// HTTP API for Challenge an Assessment: /api/challenge/*.
// Every request needs the site Origin and a valid Supabase JWT. Owners reach
// only their own cases, reviewers only cases assigned to them; anything else
// answers 404 so case ids cannot be probed. Staff views, edits and downloads
// are written to challenge_audit_log.
import { createSupabaseTokenVerifier, normalizeSupabaseUrl, readBearerToken } from "../supabase-auth.mjs";
import { createSupabaseStorageBucket, type StorageBucket } from "../supabase-storage.mjs";
import { readNotice, UnreadableNoticeError, type AiEnv } from "./ai.mts";
import { isIsoDate, todayIso } from "./dates.mts";
import { SEED_RULE_SET } from "./deadlines.mts";
import { MalformedExtractionError } from "./extract.mts";
import { resolveLaw } from "./law.mts";
import { buildPack } from "./pack.mts";
import { buildCaseView, type CaseView } from "./record.mts";
import { DEFAULT_REVIEW_THRESHOLD_UGX, highestTier } from "./review.mts";
import { assertSafe, UnsafeOutputError } from "./safety.mts";
import { ISSUE_TAGS, searchCases } from "./search.mts";
import {
  audit, isActiveReviewer, listAssignedCases, listOwnCases, loadCase, loadCaseLaw, loadConfirmations, loadDocuments, loadItems,
  findCasesByReference, loadHolidays, loadRuleSet, loadStatutes, loadVersions, pickReviewer, tierFor, type Database, type Statement,
} from "./store.mts";
import { runLawWatch, STAGE_LABEL, type LawWatchEnv } from "./lawwatch.mts";
import {
  authorityRank, CONTENT_KINDS, decide, LICENCES, loadKnowledge, loadRecord, parseRecordInput, publicRecord, rankRecords, recordEvent,
  saveRecordStatements, SOURCE_KINDS, TAX_CATEGORIES,
} from "./knowledge.mts";
import { ITEM_CATEGORIES, TAX_HEADS, type CaseRow, type ConfirmableField, type ItemCategory, type Outcome } from "./types.mts";
import { LATE_OBJECTION_REASONS, OUTCOME_PROFESSIONAL_LABELS, OWNER_QUESTIONS } from "./wording.mts";

export const CONSENT_VERSION = "2026-11-10";
export const DOCUMENTS_BUCKET = "assessment-documents";
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_JSON_BYTES = 220_000;

export interface ChallengeEnv extends AiEnv, LawWatchEnv {
  UNANSWERED_QUESTIONS?: Database;
  DATABASE_PROVIDER?: string;
  ALLOWED_ORIGIN?: string;
  SUPABASE_URL?: string;
  SUPABASE_FETCH?: typeof fetch;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  CHAT_LIMITER?: { limit(options: { key: string }): Promise<{ success: boolean }> };
  CHALLENGE_REVIEW_THRESHOLD_UGX?: string;
  /** Only its presence is read here (online payments on or off); billing.mjs uses the value. */
  FLW_SECRET_KEY?: string;
  /** Test seam: a function can only be injected by code, never by Worker vars. */
  CHALLENGE_CLOCK?: () => Date;
}

class HttpError extends Error {
  readonly status: number;
  readonly extra: Record<string, unknown>;
  constructor(status: number, message: string, extra: Record<string, unknown> = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

function json(data: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store, private", "X-Content-Type-Options": "nosniff", ...headers },
  });
}

function corsFor(request: Request, env: ChallengeEnv): Record<string, string> | null {
  const origin = request.headers.get("Origin");
  if (!origin || origin !== env.ALLOWED_ORIGIN) return null;
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Document-Type, X-File-Name",
    "Access-Control-Expose-Headers": "Content-Disposition",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  if (request.headers.get("Content-Type")?.split(";")[0]?.trim().toLowerCase() !== "application/json") throw new HttpError(415, "Send the request as JSON.");
  const text = await request.text();
  if (text.length > MAX_JSON_BYTES) throw new HttpError(413, "The request is too large.");
  try {
    const value: unknown = JSON.parse(text || "{}");
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("not an object");
    return value as Record<string, unknown>;
  } catch {
    throw new HttpError(400, "The request must contain a JSON object.");
  }
}

function storageFor(env: ChallengeEnv): StorageBucket | null {
  const url = normalizeSupabaseUrl(env.SUPABASE_URL);
  if (!url || typeof env.SUPABASE_SERVICE_ROLE_KEY !== "string" || !env.SUPABASE_SERVICE_ROLE_KEY.startsWith("eyJ")) return null;
  return createSupabaseStorageBucket({ supabaseUrl: url, serviceKey: env.SUPABASE_SERVICE_ROLE_KEY, bucket: DOCUMENTS_BUCKET, ...(env.SUPABASE_FETCH ? { fetchImpl: env.SUPABASE_FETCH } : {}) });
}

// --------------------------------------------------------------- validation
const DOC_TYPES = new Set(["assessment", "return", "ledger", "invoice", "bank_statement", "correspondence", "objection_decision", "other"]);
const FILE_TYPES: Record<string, (bytes: Uint8Array) => boolean> = {
  "application/pdf": (b) => b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46,
  "image/jpeg": (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  "image/png": (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  "image/webp": (b) => b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45,
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": (b) => b[0] === 0x50 && b[1] === 0x4b,
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": (b) => b[0] === 0x50 && b[1] === 0x4b,
  "text/plain": (b) => !b.subarray(0, 512).includes(0),
  "text/csv": (b) => !b.subarray(0, 512).includes(0),
};

const FIELD_RULES: Record<ConfirmableField, (value: string) => string | null> = {
  tin: (v) => (/^\d{10}$/.test(v) ? v : null),
  tax_head: (v) => ((TAX_HEADS as readonly string[]).includes(String(v)) ? v : null),
  assessment_type: (v) => (["original", "additional", "other"].includes(v) ? v : null),
  period_start: (v) => (isIsoDate(v) ? v : null),
  period_end: (v) => (isIsoDate(v) ? v : null),
  date_issued: (v) => (isIsoDate(v) ? v : null),
  principal: (v) => (/^\d{1,13}$/.test(v) ? v : null),
  penal_tax: (v) => (/^\d{1,13}$/.test(v) ? v : null),
  interest: (v) => (/^\d{1,13}$/.test(v) ? v : null),
  interest_rate_percent_per_month: (v) => (/^\d{1,2}(?:\.\d{1,3})?$/.test(v) ? v : null),
  interest_months: (v) => (/^\d{1,3}$/.test(v) ? v : null),
  penal_tax_percent: (v) => (/^\d{1,3}(?:\.\d{1,3})?$/.test(v) && Number(v) <= 100 ? v : null),
  ura_reasons: (v) => (v.length <= 4000 ? v : null),
  provisions_cited: (v) => {
    try {
      const list: unknown = JSON.parse(v);
      return Array.isArray(list) && list.length <= 30 && list.every((item) => typeof item === "string" && item.length <= 200) ? JSON.stringify(list) : null;
    } catch { return null; }
  },
};

/** Sets (or, for null, removes) one key of notice_terms_json. Keys are fixed strings, never user input. */
function noticeTerm(key: "interestRatePercentPerMonth" | "interestMonths" | "penalTaxPercent", value: number | null): { sql: string; values: unknown[] } {
  return value === null
    ? { sql: `notice_terms_json = (notice_terms_json::jsonb - '${key}')::text`, values: [] }
    : { sql: `notice_terms_json = jsonb_set(notice_terms_json::jsonb, '{${key}}', to_jsonb(CAST(? AS numeric)))::text`, values: [value] };
}

/** Column updates for a confirmed field value (null clears the column). */
function columnUpdate(field: ConfirmableField, value: string | null): { sql: string; values: unknown[] } {
  const numeric = (v: string | null) => (v === null ? null : Number(v));
  switch (field) {
    case "tin": return { sql: "tin = ?", values: [value] };
    case "tax_head": return { sql: "tax_head = ?", values: [value] };
    case "assessment_type": return { sql: "assessment_type = ?", values: [value] };
    case "period_start": return { sql: "period_start = ?", values: [value] };
    case "period_end": return { sql: "period_end = ?", values: [value] };
    case "date_issued": return { sql: "date_issued = ?", values: [value] };
    case "principal": return { sql: "principal = ?", values: [numeric(value)] };
    case "penal_tax": return { sql: "penal_tax = ?", values: [numeric(value)] };
    case "interest": return { sql: "interest = ?", values: [numeric(value)] };
    case "ura_reasons": return { sql: "ura_reasons = ?", values: [value ?? ""] };
    case "provisions_cited": return { sql: "provisions_cited_json = ?", values: [value ?? "[]"] };
    case "interest_rate_percent_per_month": return noticeTerm("interestRatePercentPerMonth", numeric(value));
    case "interest_months": return noticeTerm("interestMonths", numeric(value));
    case "penal_tax_percent": return noticeTerm("penalTaxPercent", numeric(value));
  }
}

function optionalAmount(value: unknown, label: string): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 1e13) throw new HttpError(400, `${label} must be an amount in UGX.`);
  return Math.round(n);
}

function optionalDate(value: unknown, label: string, today: string): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (!isIsoDate(value)) throw new HttpError(400, `${label} must be a date (YYYY-MM-DD).`);
  if (value > today) throw new HttpError(400, `${label} cannot be in the future.`);
  return value;
}

const CATEGORIES = new Set<ItemCategory>(ITEM_CATEGORIES);
const OUTCOMES = new Set<Outcome>(["correct", "computational_error", "insufficient_evidence", "arguable_legal_ground", "procedural_issue"]);

function cleanText(value: unknown, max: number): string | undefined {
  if (value === undefined || value === null) return undefined;
  const text = String(value).trim().slice(0, max);
  return text || undefined;
}

// ------------------------------------------------------------- the handler
interface Ctx {
  request: Request;
  env: ChallengeEnv;
  db: Database;
  cors: Record<string, string>;
  userId: string;
  email: string;
  reviewer: boolean;
  canApproveLaw: boolean;
  now: Date;
  nowIso: string;
  today: string;
}

async function buildView(ctx: Ctx, row: CaseRow): Promise<CaseView> {
  const [confirmations, items, documents, statutes, versions, ruleSet, holidays, caseLaw, tiers] = await Promise.all([
    loadConfirmations(ctx.db, row.id), loadItems(ctx.db, row.id), loadDocuments(ctx.db, row.id), loadStatutes(ctx.db), loadVersions(ctx.db),
    loadRuleSet(ctx.db), loadHolidays(ctx.db, ctx.today), loadCaseLaw(ctx.db), tierFor(ctx.db, row.ownerUserId, row.id, ctx.nowIso),
  ]);
  return buildCaseView({
    row, confirmations, items,
    documents: documents.map(({ id, docType, fileName, sizeBytes, uploadedAt }) => ({ id, docType, fileName, sizeBytes, uploadedAt })),
    statutes, versions, ruleSet: ruleSet ?? SEED_RULE_SET, holidays, caseLaw, tier: highestTier(tiers), today: ctx.today,
    reviewThresholdUgx: Number(ctx.env.CHALLENGE_REVIEW_THRESHOLD_UGX) > 0 ? Number(ctx.env.CHALLENGE_REVIEW_THRESHOLD_UGX) : DEFAULT_REVIEW_THRESHOLD_UGX,
  });
}

/** Stores the review flags computed from the view; assigns a reviewer when one is needed. */
async function syncReview(ctx: Ctx, row: CaseRow, view: CaseView): Promise<CaseView> {
  const required = view.review.required ? 1 : 0;
  let reviewer = row.assignedReviewerId;
  if (required && !reviewer) reviewer = await pickReviewer(ctx.db);
  const status = view.review.status;
  const reasons = JSON.stringify(view.review.reasons.map((reason) => reason.text));
  await ctx.db.prepare(`UPDATE challenge_cases SET review_required = ?, review_reasons_json = ?, review_status = ?, assigned_reviewer_id = ? WHERE id = ?`)
    .bind(required, reasons, status, reviewer, row.id).run();
  return { ...view, case: { ...view.case, reviewStatus: status, assignedReviewerId: reviewer } };
}

async function caseOr404(ctx: Ctx, caseId: string) {
  const found = await loadCase(ctx.db, caseId, ctx.userId, ctx.reviewer);
  if (!found) throw new HttpError(404, "Case not found.");
  return found;
}

async function bumpAndView(ctx: Ctx, caseId: string, statements: Statement[], action: string, details: Record<string, unknown>, role: "owner" | "reviewer"): Promise<Response> {
  statements.push(ctx.db.prepare(`UPDATE challenge_cases SET case_version = case_version + 1, updated_at = ? WHERE id = ?`).bind(ctx.nowIso, caseId));
  statements.push(audit(ctx.db, { actorUserId: ctx.userId, actorRole: role, action, caseId, details, at: ctx.nowIso }));
  await ctx.db.batch(statements);
  const fresh = await caseOr404(ctx, caseId);
  const view = await syncReview(ctx, fresh.row, await buildView(ctx, fresh.row));
  return json({ view }, 200, ctx.cors);
}

async function route(ctx: Ctx): Promise<Response> {
  const { request, db } = ctx;
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "");
  const method = request.method;
  let m: RegExpMatchArray | null;

  if (path === "/api/challenge/me" && method === "GET") {
    const consent = await db.prepare(`SELECT accepted_at AS "acceptedAt" FROM challenge_consents WHERE user_id = ? AND consent_version = ?`).bind(ctx.userId, CONSENT_VERSION).first();
    const cases = await listOwnCases(db, ctx.userId);
    const reviewedPlan = await db.prepare(`SELECT id, amount, currency FROM billing_plans WHERE kind = 'per_case' AND challenge_tier = 'reviewed' AND active = 1 ORDER BY sort_order LIMIT 1`).first<Record<string, unknown>>();
    return json({
      offers: {
        reviewed: reviewedPlan ? { planId: String(reviewedPlan.id), amount: Number(reviewedPlan.amount), currency: String(reviewedPlan.currency) } : null,
        paymentsEnabled: typeof ctx.env.FLW_SECRET_KEY === "string" && ctx.env.FLW_SECRET_KEY.length > 0,
      },
      consentVersion: CONSENT_VERSION, consented: Boolean(consent), reviewer: ctx.reviewer, canApproveLaw: ctx.canApproveLaw,
      cases: cases.map((row) => ({ id: row.id, taxHead: row.taxHead, periodStart: row.periodStart, periodEnd: row.periodEnd, principal: row.principal, status: row.status, reviewStatus: row.reviewStatus, updatedAt: row.updatedAt })),
      uploadsEnabled: Boolean(storageFor(ctx.env)),
      questions: OWNER_QUESTIONS, lateReasons: LATE_OBJECTION_REASONS, outcomeLabels: OUTCOME_PROFESSIONAL_LABELS,
    }, 200, ctx.cors);
  }

  if (path === "/api/challenge/consent" && method === "POST") {
    const body = await readJson(request);
    if (body.version !== CONSENT_VERSION || body.accept !== true) throw new HttpError(400, "Accept the current consent statement to continue.");
    await db.batch([
      db.prepare(`INSERT INTO challenge_consents (user_id, consent_version, accepted_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING`).bind(ctx.userId, CONSENT_VERSION, ctx.nowIso),
      audit(db, { actorUserId: ctx.userId, actorRole: "owner", action: "consent.accept", details: { version: CONSENT_VERSION }, at: ctx.nowIso }),
    ]);
    return json({ consented: true }, 200, ctx.cors);
  }

  if (path === "/api/challenge/cases" && method === "POST") {
    const consent = await db.prepare(`SELECT 1 AS ok FROM challenge_consents WHERE user_id = ? AND consent_version = ?`).bind(ctx.userId, CONSENT_VERSION).first();
    if (!consent) throw new HttpError(428, "Please read and accept how we handle your documents first.");
    const count = await db.prepare(`SELECT count(*) AS n FROM challenge_cases WHERE owner_user_id = ?`).bind(ctx.userId).first<{ n: number }>();
    if (Number(count?.n) >= 100) throw new HttpError(409, "You have reached the limit of 100 cases. Delete an old case first.");
    const id = crypto.randomUUID();
    await db.batch([
      db.prepare(`INSERT INTO challenge_cases (id, owner_user_id, status, created_at, updated_at) VALUES (?, ?, 'draft', ?, ?)`).bind(id, ctx.userId, ctx.nowIso, ctx.nowIso),
      audit(db, { actorUserId: ctx.userId, actorRole: "owner", action: "case.create", caseId: id, at: ctx.nowIso }),
    ]);
    const found = await caseOr404(ctx, id);
    return json({ view: await buildView(ctx, found.row) }, 201, ctx.cors);
  }

  if ((m = path.match(/^\/api\/challenge\/cases\/([0-9a-f-]{36})$/))) {
    const caseId = m[1] as string;
    const { row, access } = await caseOr404(ctx, caseId);
    if (method === "GET") {
      if (access.role === "reviewer") await audit(db, { actorUserId: ctx.userId, actorRole: "reviewer", action: "case.view", caseId, at: ctx.nowIso }).run();
      return json({ view: await syncReview(ctx, row, await buildView(ctx, row)), role: access.role }, 200, ctx.cors);
    }
    if (method === "DELETE") {
      if (access.role !== "owner") throw new HttpError(404, "Case not found.");
      const storage = storageFor(ctx.env);
      const documents = await loadDocuments(db, caseId);
      if (documents.length && !storage) throw new HttpError(503, "Document storage is not configured, so the files cannot be deleted yet.");
      for (const doc of documents) await storage?.delete(doc.storagePath);
      await db.batch([
        db.prepare(`DELETE FROM challenge_cases WHERE id = ? AND owner_user_id = ?`).bind(caseId, ctx.userId),
        audit(db, { actorUserId: ctx.userId, actorRole: "owner", action: "case.delete", caseId, details: { documents: documents.length }, at: ctx.nowIso }),
      ]);
      return json({ deleted: true }, 200, ctx.cors);
    }
    if (method === "PATCH") {
      const body = await readJson(request);
      const sets: string[] = [];
      const values: unknown[] = [];
      const set = (sql: string, value: unknown) => { sets.push(sql); values.push(value); };
      if ("dateServed" in body) {
        const served = optionalDate(body.dateServed, "The date you received the notice", ctx.today);
        if (served && row.dateIssued && served < row.dateIssued) throw new HttpError(400, "You cannot have received the notice before the date it was issued.");
        set("date_served = ?", served);
      }
      if ("serviceMethod" in body) {
        const method_ = body.serviceMethod === null ? null : String(body.serviceMethod);
        if (method_ !== null && !["hand", "email", "ura-portal", "post", "other"].includes(method_)) throw new HttpError(400, "Choose how you received the notice.");
        set("service_method = ?", method_);
      }
      if ("taxAccepted" in body) {
        const accepted = optionalAmount(body.taxAccepted, "The tax you accept");
        if (accepted !== null && row.principal !== null && accepted > row.principal) throw new HttpError(400, "The tax you accept cannot be more than the tax assessed.");
        set("tax_accepted = ?", accepted);
      }
      if ("objectionFiledOn" in body) set("objection_filed_on = ?", optionalDate(body.objectionFiledOn, "The date you lodged the objection", ctx.today));
      if ("decisionServedOn" in body) set("decision_served_on = ?", optionalDate(body.decisionServedOn, "The date you received URA's decision", ctx.today));
      if ("preparingTat" in body) set("preparing_tat = ?", body.preparingTat === true ? 1 : 0);
      if ("lateReason" in body) set("late_reason = ?", cleanText(body.lateReason, 2000) ?? "");
      if ("checklist" in body) {
        const checklist = body.checklist;
        if (!checklist || typeof checklist !== "object" || Array.isArray(checklist)) throw new HttpError(400, "Checklist must be an object.");
        const entries = Object.entries(checklist as Record<string, unknown>).filter(([key, value]) => /^[a-z0-9-]{1,80}$/.test(key) && (value === "received" || value === "not-available"));
        if (entries.length > 200) throw new HttpError(400, "Too many checklist entries.");
        set("checklist_json = ?", JSON.stringify(Object.fromEntries(entries)));
      }
      if (!sets.length) throw new HttpError(400, "Nothing to update.");
      const statusSql = body.objectionFiledOn ? ", status = 'objection_filed'" : body.decisionServedOn ? ", status = 'decision_received'" : "";
      const statement = db.prepare(`UPDATE challenge_cases SET ${sets.join(", ")}${statusSql} WHERE id = ?`).bind(...values, caseId);
      return bumpAndView(ctx, caseId, [statement], "case.edit", { fields: Object.keys(body).filter((key) => key !== "checklist") }, access.role);
    }
  }

  if ((m = path.match(/^\/api\/challenge\/cases\/([0-9a-f-]{36})\/fields$/)) && method === "POST") {
    const caseId = m[1] as string;
    const { access } = await caseOr404(ctx, caseId);
    const body = await readJson(request);
    const list = Array.isArray(body.fields) ? body.fields : [];
    if (!list.length || list.length > 20) throw new HttpError(400, "Send one or more fields to confirm.");
    const statements: Statement[] = [];
    const existing = new Map((await loadConfirmations(db, caseId)).map((item) => [item.fieldName, item]));
    for (const raw of list) {
      const entry = raw as Record<string, unknown>;
      const field = String(entry.field) as ConfirmableField;
      const rule = FIELD_RULES[field];
      if (!rule) throw new HttpError(400, `Unknown field: ${String(entry.field)}.`);
      const action = String(entry.action);
      if (!["confirm", "correct", "unconfirmable"].includes(action)) throw new HttpError(400, "Each field needs an action: confirm, correct or unconfirmable.");
      const before = existing.get(field);
      let value: string | null = null;
      if (action === "confirm") {
        value = before?.extractedValue ?? null;
        if (value === null) throw new HttpError(400, `There is no extracted value to confirm for ${field.replace(/_/g, " ")}; type it in instead.`);
      } else if (action === "correct") {
        const rawValue = entry.value === null || entry.value === undefined ? "" : (typeof entry.value === "string" ? entry.value : JSON.stringify(entry.value)).trim();
        value = rawValue === "" ? null : rule(rawValue);
        if (rawValue !== "" && value === null) throw new HttpError(400, `The value for ${field.replace(/_/g, " ")} is not valid.`);
      }
      const status = action === "confirm" ? "confirmed" : action === "correct" ? "corrected" : "unconfirmable";
      statements.push(db.prepare(`INSERT INTO challenge_field_confirmations (id, case_id, field_name, extracted_value, confirmed_value, confidence, source, status, confirmed_by, confirmed_at, created_at)
        VALUES (?, ?, ?, NULL, ?, NULL, 'user', ?, ?, ?, ?)
        ON CONFLICT (case_id, field_name) DO UPDATE SET confirmed_value = EXCLUDED.confirmed_value, status = EXCLUDED.status, confirmed_by = EXCLUDED.confirmed_by, confirmed_at = EXCLUDED.confirmed_at`)
        .bind(crypto.randomUUID(), caseId, field, value, status, ctx.userId, ctx.nowIso, ctx.nowIso));
      const update = columnUpdate(field, action === "unconfirmable" ? null : value);
      statements.push(db.prepare(`UPDATE challenge_cases SET ${update.sql} WHERE id = ?`).bind(...update.values, caseId));
    }
    statements.push(db.prepare(`UPDATE challenge_cases SET status = CASE WHEN status IN ('draft', 'confirming') THEN 'active' ELSE status END WHERE id = ?`).bind(caseId));
    return bumpAndView(ctx, caseId, statements, "case.fields", { fields: list.map((item) => (item as Record<string, unknown>).field) }, access.role);
  }

  if ((m = path.match(/^\/api\/challenge\/cases\/([0-9a-f-]{36})\/items$/)) && method === "PUT") {
    const caseId = m[1] as string;
    const { access } = await caseOr404(ctx, caseId);
    const body = await readJson(request);
    const list = Array.isArray(body.items) ? body.items : null;
    if (!list || list.length > 60) throw new HttpError(400, "Send up to 60 items.");
    const docIds = new Set((await loadDocuments(db, caseId)).map((doc) => doc.id));
    const previous = new Map((await loadItems(db, caseId)).map((item) => [item.id, item]));
    const statements: Statement[] = [db.prepare(`DELETE FROM challenge_disputed_items WHERE case_id = ?`).bind(caseId)];
    list.forEach((raw: unknown, index: number) => {
      const item = (raw ?? {}) as Record<string, unknown>;
      const category = String(item.category) as ItemCategory;
      if (!CATEGORIES.has(category)) throw new HttpError(400, `Item ${index + 1}: choose what kind of item it is.`);
      const description = cleanText(item.description, 500);
      if (!description) throw new HttpError(400, `Item ${index + 1}: describe the item.`);
      const factsIn = (item.facts ?? {}) as Record<string, unknown>;
      const optionalNumber = (value: unknown, max: number) => (value === undefined || value === null || value === "" ? undefined : Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= max ? Number(value) : (() => { throw new HttpError(400, `Item ${index + 1}: a number is out of range.`); })());
      const facts = {
        hasRecords: typeof factsIn.hasRecords === "boolean" ? factsIn.hasRecords : undefined,
        missingDocuments: Array.isArray(factsIn.missingDocuments) ? factsIn.missingDocuments.map((d) => cleanText(d, 200)).filter(Boolean).slice(0, 10) : undefined,
        legalArgument: cleanText(factsIn.legalArgument, 2000),
        proceduralConcern: cleanText(factsIn.proceduralConcern, 2000),
        ownerExplanation: cleanText(factsIn.ownerExplanation, 2000),
        uraRatePercentPerMonth: optionalNumber(factsIn.uraRatePercentPerMonth, 100),
        uraMonths: optionalNumber(factsIn.uraMonths, 600),
        uraPercent: optionalNumber(factsIn.uraPercent, 100),
        baseAmount: optionalNumber(factsIn.baseAmount, 1e13),
      };
      const documents = (Array.isArray(item.documentIds) ? item.documentIds : []).map(String).filter((id) => docIds.has(id)).slice(0, 20);
      const id = typeof item.id === "string" && /^[0-9a-f-]{36}$/.test(item.id) ? item.id : crypto.randomUUID();
      // Owners cannot set or clear a reviewer's outcome.
      const reviewerOutcome = access.role === "reviewer"
        ? (item.reviewerOutcome === null || item.reviewerOutcome === undefined ? null : OUTCOMES.has(item.reviewerOutcome as Outcome) ? item.reviewerOutcome : (() => { throw new HttpError(400, "Unknown outcome."); })())
        : previous.get(id)?.reviewerOutcome ?? null;
      statements.push(db.prepare(`INSERT INTO challenge_disputed_items (id, case_id, position, category, description, ura_amount, taxpayer_amount, facts_json, documents_json, reviewer_outcome, keep_in_objection, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(id, caseId, index, category, description,
        optionalAmount(item.uraAmount, "URA's figure"), optionalAmount(item.taxpayerAmount, "Your figure"), JSON.stringify(facts), JSON.stringify(documents),
        reviewerOutcome, item.keepInObjection === false ? 0 : 1, ctx.nowIso, ctx.nowIso));
    });
    return bumpAndView(ctx, caseId, statements, "case.items", { count: list.length }, access.role);
  }

  if ((m = path.match(/^\/api\/challenge\/cases\/([0-9a-f-]{36})\/documents$/)) && method === "POST") {
    const caseId = m[1] as string;
    const { row, access } = await caseOr404(ctx, caseId);
    if (access.role !== "owner") throw new HttpError(403, "Only the case owner can upload documents.");
    const storage = storageFor(ctx.env);
    if (!storage) throw new HttpError(503, "Document uploads are not switched on yet. You can still type or paste the notice.");
    const contentType = (request.headers.get("Content-Type") ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
    const check = FILE_TYPES[contentType];
    if (!check) throw new HttpError(415, "Upload a PDF, a photo (JPEG, PNG or WebP), a Word document (.docx), a spreadsheet (.xlsx) or a text file.");
    const docType = request.headers.get("X-Document-Type") ?? "other";
    if (!DOC_TYPES.has(docType)) throw new HttpError(400, "Choose what kind of document this is.");
    const fileName = (() => { try { return decodeURIComponent(request.headers.get("X-File-Name") ?? "document"); } catch { return "document"; } })()
      .replace(/[^\w .()-]/g, "_").slice(0, 120) || "document";
    const declared = Number(request.headers.get("Content-Length"));
    if (declared > MAX_FILE_BYTES) throw new HttpError(413, "Files must be 10 MB or smaller.");
    const bytes = new Uint8Array(await request.arrayBuffer());
    if (!bytes.byteLength) throw new HttpError(400, "The file is empty.");
    if (bytes.byteLength > MAX_FILE_BYTES) throw new HttpError(413, "Files must be 10 MB or smaller.");
    if (!check(bytes)) throw new HttpError(415, "The file's contents do not match its type. Please upload the original file.");
    const docId = crypto.randomUUID();
    const storagePath = `${row.ownerUserId}/${caseId}/${docId}`;
    await storage.put(storagePath, bytes, { httpMetadata: { contentType } });
    await db.batch([
      db.prepare(`INSERT INTO challenge_documents (id, case_id, owner_user_id, storage_path, doc_type, file_name, content_type, size_bytes, uploaded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(docId, caseId, row.ownerUserId, storagePath, docType, fileName, contentType, bytes.byteLength, ctx.nowIso),
      audit(db, { actorUserId: ctx.userId, actorRole: "owner", action: "document.upload", caseId, documentId: docId, details: { docType, sizeBytes: bytes.byteLength }, at: ctx.nowIso }),
    ]);
    return json({ document: { id: docId, docType, fileName, sizeBytes: bytes.byteLength, uploadedAt: ctx.nowIso } }, 201, ctx.cors);
  }

  if ((m = path.match(/^\/api\/challenge\/cases\/([0-9a-f-]{36})\/documents\/([0-9a-f-]{36})$/)) && method === "GET") {
    const caseId = m[1] as string;
    const documentId = m[2] as string;
    const { access } = await caseOr404(ctx, caseId);
    const doc = (await loadDocuments(db, caseId)).find((item) => item.id === documentId);
    if (!doc) throw new HttpError(404, "Document not found.");
    const storage = storageFor(ctx.env);
    if (!storage) throw new HttpError(503, "Document storage is not configured.");
    const object = await storage.get(doc.storagePath);
    if (!object?.body) throw new HttpError(404, "Document not found.");
    await audit(db, { actorUserId: ctx.userId, actorRole: access.role, action: "document.download", caseId, documentId, at: ctx.nowIso }).run();
    return new Response(object.body, { status: 200, headers: { ...ctx.cors, "Content-Type": doc.contentType, "Content-Disposition": `attachment; filename="${doc.fileName.replace(/"/g, "")}"`, "Cache-Control": "no-store, private", "X-Content-Type-Options": "nosniff" } });
  }

  if ((m = path.match(/^\/api\/challenge\/cases\/([0-9a-f-]{36})\/read$/)) && method === "POST") {
    const caseId = m[1] as string;
    const { access } = await caseOr404(ctx, caseId);
    if (access.role !== "owner") throw new HttpError(403, "Only the case owner can read a notice into the case.");
    const body = await readJson(request);
    let input: Parameters<typeof readNotice>[0];
    if (typeof body.text === "string") {
      input = { kind: "text", text: body.text.slice(0, 100_000) };
    } else if (typeof body.documentId === "string") {
      const doc = (await loadDocuments(db, caseId)).find((item) => item.id === body.documentId);
      if (!doc) throw new HttpError(404, "Document not found.");
      const storage = storageFor(ctx.env);
      const object = storage ? await storage.get(doc.storagePath) : null;
      if (!object?.body) throw new HttpError(404, "Document not found.");
      input = { kind: "file", bytes: new Uint8Array(await new Response(object.body).arrayBuffer()), contentType: doc.contentType };
    } else {
      throw new HttpError(400, "Send the notice text or the id of an uploaded document.");
    }
    let result;
    try {
      result = await readNotice(input, ctx.env);
    } catch (error) {
      if (error instanceof UnreadableNoticeError) throw new HttpError(422, error.message, { attempts: error.attempts });
      if (error instanceof MalformedExtractionError) throw new HttpError(422, error.message);
      throw error;
    }
    const statements: Statement[] = [];
    for (const field of result.extraction.fields) {
      statements.push(db.prepare(`INSERT INTO challenge_field_confirmations (id, case_id, field_name, extracted_value, confirmed_value, confidence, source, status, confirmed_by, confirmed_at, created_at)
        VALUES (?, ?, ?, ?, NULL, ?, ?, 'pending', NULL, NULL, ?)
        ON CONFLICT (case_id, field_name) DO UPDATE SET extracted_value = EXCLUDED.extracted_value, confidence = EXCLUDED.confidence, source = EXCLUDED.source,
          status = 'pending', confirmed_value = NULL, confirmed_by = NULL, confirmed_at = NULL`)
        .bind(crypto.randomUUID(), caseId, field.fieldName, field.value, field.confidence, result.extraction.source, ctx.nowIso));
      // A re-read clears the confirmed column until the user confirms again.
      const update = columnUpdate(field.fieldName, null);
      statements.push(db.prepare(`UPDATE challenge_cases SET ${update.sql} WHERE id = ?`).bind(...update.values, caseId));
    }
    statements.push(db.prepare(`UPDATE challenge_cases SET status = 'confirming' WHERE id = ?`).bind(caseId));
    const response = await bumpAndView(ctx, caseId, statements, "case.read", { source: result.extraction.source, attempts: result.attempts }, "owner");
    const payload = await response.json() as Record<string, unknown>;
    return json({ ...payload, warnings: result.extraction.warnings, source: result.extraction.source }, 200, ctx.cors);
  }

  if ((m = path.match(/^\/api\/challenge\/cases\/([0-9a-f-]{36})\/pack$/)) && method === "GET") {
    const caseId = m[1] as string;
    const { row, access } = await caseOr404(ctx, caseId);
    const view = await syncReview(ctx, row, await buildView(ctx, row));
    if (!view.access.fullPack) {
      const message = view.access.blockedBecause.includes("review")
        ? "A reviewer must sign off this case before the full pack can be downloaded. Your explanation, deadline and checklist are still available."
        : "The full response pack needs a paid plan. Your explanation, deadline and checklist are free.";
      return json({ error: message, blockedBecause: view.access.blockedBecause }, 403, ctx.cors);
    }
    const pack = buildPack(view, ctx.today);
    await audit(db, { actorUserId: ctx.userId, actorRole: access.role, action: "pack.download", caseId, details: { caseVersion: row.caseVersion }, at: ctx.nowIso }).run();
    return json({ pack }, 200, ctx.cors);
  }

  if (path === "/api/challenge/law" && method === "GET") {
    const [statutes, versions, ruleSet, holidays] = await Promise.all([loadStatutes(db), loadVersions(db), loadRuleSet(db), loadHolidays(db, ctx.today)]);
    const taxHead = url.searchParams.get("taxHead");
    const start = url.searchParams.get("periodStart");
    const end = url.searchParams.get("periodEnd");
    const head = TAX_HEADS.find((item) => item === taxHead);
    const resolution = head && isIsoDate(start) && isIsoDate(end) && start <= end
      ? resolveLaw({ taxHead: head, periodStart: start, periodEnd: end }, statutes, versions) : null;
    return json({ statutes, versions, ruleSet: ruleSet ?? SEED_RULE_SET, holidays, resolution }, 200, ctx.cors);
  }

  if (path === "/api/challenge/case-law" && method === "GET") {
    const q = (url.searchParams.get("q") ?? "").slice(0, 300);
    const all = await loadCaseLaw(db);
    const results = q ? searchCases(all, q, { limit: 20 }).map((match) => ({ ...match.caseLaw, score: match.score, matchedTags: match.matchedTags })) : all.slice(0, 100);
    return json({ total: all.length, results }, 200, ctx.cors);
  }

  if (path === "/api/challenge/knowledge" && method === "GET") {
    // Knowledge records for an answer: verified current law first, then by the source hierarchy.
    const onDate = url.searchParams.get("onDate");
    if (onDate && !isIsoDate(onDate)) throw new HttpError(400, "onDate must be YYYY-MM-DD.");
    const staff = ctx.reviewer && url.searchParams.get("include") === "drafts";
    const country = url.searchParams.get("country");
    const ranked = rankRecords(await loadKnowledge(db, { staff }), {
      q: (url.searchParams.get("q") ?? "").slice(0, 300),
      country: country && /^(?:[A-Z]{2}|INTL)$/.test(country) ? country : null,
      category: url.searchParams.get("category"),
      layer: url.searchParams.get("layer"),
      onDate,
    }, 30);
    return json({
      hierarchy: SOURCE_KINDS.map((kind) => ({ kind, rank: authorityRank(kind, country ?? "INTL") })).sort((a, b) => a.rank - b.rank),
      results: ranked.map((match) => ({ ...publicRecord(match.record, onDate), inPeriod: match.inPeriod })),
    }, 200, ctx.cors);
  }

  // ------------------------------------------------------------ reviewers
  if (path.startsWith("/api/challenge/review")) {
    if (!ctx.reviewer) throw new HttpError(403, "Reviewer access only.");
    if (path === "/api/challenge/review/queue" && method === "GET") {
      const cases = await listAssignedCases(db, ctx.userId);
      return json({ cases: cases.map((row) => ({ id: row.id, taxHead: row.taxHead, principal: row.principal, taxAccepted: row.taxAccepted, periodStart: row.periodStart, periodEnd: row.periodEnd, reviewStatus: row.reviewStatus, reasons: row.reviewReasons, updatedAt: row.updatedAt, dateServed: row.dateServed })) }, 200, ctx.cors);
    }
    if ((m = path.match(/^\/api\/challenge\/review\/cases\/([0-9a-f-]{36})$/)) && method === "POST") {
      const caseId = m[1] as string;
      const { row, access } = await caseOr404(ctx, caseId);
      if (access.role !== "reviewer") throw new HttpError(404, "Case not found.");
      const body = await readJson(request);
      const decision = body.decision === "approve" ? "approved" : body.decision === "changes" ? "changes_requested" : null;
      if (!decision) throw new HttpError(400, "Choose approve or request changes.");
      const note = cleanText(body.note, 2000) ?? "";
      await db.batch([
        db.prepare(`UPDATE challenge_cases SET review_status = ?, reviewed_by = ?, reviewed_at = ?, review_note = ?, reviewed_case_version = ? WHERE id = ? AND case_version = ?`)
          .bind(decision, ctx.userId, ctx.nowIso, note, decision === "approved" ? row.caseVersion : null, caseId, row.caseVersion),
        audit(db, { actorUserId: ctx.userId, actorRole: "reviewer", action: decision === "approved" ? "review.signoff" : "review.changes", caseId, details: { caseVersion: row.caseVersion, note }, at: ctx.nowIso }),
      ]);
      const fresh = await caseOr404(ctx, caseId);
      return json({ view: await syncReview(ctx, fresh.row, await buildView(ctx, fresh.row)) }, 200, ctx.cors);
    }
    if ((m = path.match(/^\/api\/challenge\/review\/cases\/([0-9a-f-]{36})\/entitlement$/)) && method === "POST") {
      const caseId = m[1] as string;
      const { access } = await caseOr404(ctx, caseId);
      if (access.role !== "reviewer") throw new HttpError(404, "Case not found.");
      const body = await readJson(request);
      if (body.tier !== "reviewed" && body.tier !== "managed") throw new HttpError(400, "Choose reviewed or managed.");
      const reference = cleanText(body.paymentReference, 120);
      if (!reference) throw new HttpError(400, "Record the payment reference.");
      await db.batch([
        db.prepare(`INSERT INTO challenge_case_entitlements (case_id, tier, granted_by, granted_at, payment_reference) VALUES (?, ?, ?, ?, ?) ON CONFLICT DO NOTHING`).bind(caseId, body.tier, ctx.userId, ctx.nowIso, reference),
        audit(db, { actorUserId: ctx.userId, actorRole: "reviewer", action: "entitlement.grant", caseId, details: { tier: body.tier }, at: ctx.nowIso }),
      ]);
      return json({ granted: body.tier }, 200, ctx.cors);
    }
    if ((m = path.match(/^\/api\/challenge\/review\/law\/([a-z0-9.-]{2,80})$/)) && method === "POST") {
      const versionId = m[1] as string;
      const body = await readJson(request);
      const text = cleanText(body.text, 20_000);
      if (!text || /TODO_VERIFY/.test(text)) throw new HttpError(400, "Paste the official text from ULII.");
      const section = cleanText(body.section, 40);
      const result = await db.prepare(`UPDATE law_provision_versions SET text_or_summary = ?, section = COALESCE(?, section), text_verified_by = ?, text_verified_at = ?, approved_for_computation = 0, approved_by = NULL, approved_at = NULL, updated_at = ? WHERE id = ?`)
        .bind(text, section ?? null, ctx.userId, ctx.nowIso, ctx.nowIso, versionId).run();
      if (!result.meta.changes) throw new HttpError(404, "Provision not found.");
      await audit(db, { actorUserId: ctx.userId, actorRole: "reviewer", action: "law.text", details: { versionId }, at: ctx.nowIso }).run();
      return json({ updated: versionId }, 200, ctx.cors);
    }
    if ((m = path.match(/^\/api\/challenge\/review\/law\/([a-z0-9.-]{2,80})\/approve$/)) && method === "POST") {
      if (!ctx.canApproveLaw) throw new HttpError(403, "Only a legal approver can approve law for computation.");
      const versionId = m[1] as string;
      const body = await readJson(request);
      const computation = body.computation === undefined ? undefined : body.computation;
      if (computation !== undefined && (typeof computation !== "object" || computation === null || Array.isArray(computation))) throw new HttpError(400, "The formula must be an object.");
      const result = await db.prepare(`UPDATE law_provision_versions SET approved_for_computation = 1, approved_by = ?, approved_at = ?, computation_json = COALESCE(?, computation_json), updated_at = ?
        WHERE id = ? AND text_verified_by IS NOT NULL AND bill_status IN ('assented', 'in_force')`)
        .bind(ctx.userId, ctx.nowIso, computation === undefined ? null : JSON.stringify(computation), ctx.nowIso, versionId).run();
      if (!result.meta.changes) throw new HttpError(409, "Verify the provision's text before approving it.");
      await audit(db, { actorUserId: ctx.userId, actorRole: "reviewer", action: "law.approve", details: { versionId }, at: ctx.nowIso }).run();
      return json({ approved: versionId }, 200, ctx.cors);
    }
    if (path === "/api/challenge/review/case-law" && method === "POST") {
      // Add or update one TAT decision from a reviewer's reading of ULII (metadata, link, tags).
      const body = await readJson(request);
      const id = String(body.id ?? "");
      const citation = cleanText(body.citation, 300);
      const parties = cleanText(body.parties, 300);
      const sourceUrl = String(body.sourceUrl ?? "");
      const tags = Array.isArray(body.issueTags) ? body.issueTags.map(String).filter((tag) => ISSUE_TAGS.some((known) => known.id === tag)) : [];
      if (!/^[a-z0-9-]{3,120}$/.test(id) || !citation || !parties || !/^https:\/\/ulii\.org\//.test(sourceUrl) || !tags.length) {
        throw new HttpError(400, "Give an id, citation, parties, a https://ulii.org/ link and at least one issue tag.");
      }
      const decisionDate = body.decisionDate ? (isIsoDate(body.decisionDate) ? body.decisionDate : (() => { throw new HttpError(400, "Decision date must be YYYY-MM-DD."); })()) : null;
      const summary = { legalQuestion: cleanText(body.legalQuestion, 2000) ?? null, decision: cleanText(body.decision, 4000) ?? null, principle: cleanText(body.principle, 2000) ?? null, background: cleanText(body.background, 4000) ?? null };
      for (const text of Object.values(summary)) if (text) assertSafe(text, "case summary");
      const hasSummary = Object.values(summary).some(Boolean);
      const approve = body.approveSummary === true && hasSummary;
      const appeal = ["final", "appealed", "overturned", "upheld"].includes(String(body.appealStatus)) ? String(body.appealStatus) : "unverified";
      const verified = approve || appeal !== "unverified";
      await db.batch([
        db.prepare(`INSERT INTO tax_case_law (id, citation, parties, decision_date, forum, background, legal_question, decision, principle, summary_status, summary_source, issue_tags_json, search_terms, source_url, appeal_status, verified_by, verified_at, ingested_at)
          VALUES (?, ?, ?, ?, 'TAT', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT (id) DO UPDATE SET citation = EXCLUDED.citation, parties = EXCLUDED.parties, decision_date = EXCLUDED.decision_date, background = EXCLUDED.background,
            legal_question = EXCLUDED.legal_question, decision = EXCLUDED.decision, principle = EXCLUDED.principle, summary_status = EXCLUDED.summary_status,
            summary_source = EXCLUDED.summary_source, issue_tags_json = EXCLUDED.issue_tags_json, search_terms = EXCLUDED.search_terms, source_url = EXCLUDED.source_url,
            appeal_status = EXCLUDED.appeal_status, verified_by = EXCLUDED.verified_by, verified_at = EXCLUDED.verified_at`)
          .bind(id, citation, parties, decisionDate, summary.background, summary.legalQuestion, summary.decision, summary.principle,
            hasSummary ? (approve ? "approved" : "draft") : "none", hasSummary ? "staff" : null, JSON.stringify(tags), cleanText(body.searchTerms, 1000) ?? "",
            sourceUrl, appeal, verified ? ctx.userId : null, verified ? ctx.nowIso : null, ctx.nowIso),
        audit(db, { actorUserId: ctx.userId, actorRole: "reviewer", action: "caselaw.save", details: { id, approve, appeal }, at: ctx.nowIso }),
      ]);
      return json({ saved: id }, 200, ctx.cors);
    }
    if (path === "/api/challenge/review/knowledge" && method === "GET") {
      const [records, events] = await Promise.all([
        loadKnowledge(db, { staff: true }),
        db.prepare(`SELECT record_id AS "recordId", occurred_at AS "occurredAt", action, from_status AS "fromStatus", to_status AS "toStatus", note
          FROM knowledge_record_events ORDER BY occurred_at DESC LIMIT 50`).all<Record<string, unknown>>(),
      ]);
      return json({ records, events: events.results, options: { sourceKinds: SOURCE_KINDS, contentKinds: CONTENT_KINDS, licences: LICENCES, categories: TAX_CATEGORIES } }, 200, ctx.cors);
    }
    if (path === "/api/challenge/review/knowledge" && method === "POST") {
      // Any reviewer may add or edit a record; it is (re)saved as a draft for a legal approver.
      const { input, problems } = parseRecordInput(await readJson(request));
      if (problems.length) throw new HttpError(400, problems.join(" "), { problems });
      if (input.body) assertSafe(input.body, "knowledge note");
      if (input.statuteId && !(await db.prepare(`SELECT 1 AS ok FROM law_statutes WHERE id = ?`).bind(input.statuteId).first())) throw new HttpError(400, "That statute is not in the law register.");
      const existing = await loadRecord(db, input.id);
      await db.batch([
        ...saveRecordStatements(db, input, existing, ctx.userId, ctx.nowIso),
        audit(db, { actorUserId: ctx.userId, actorRole: "reviewer", action: existing ? "knowledge.edit" : "knowledge.create", details: { id: input.id }, at: ctx.nowIso }),
      ]);
      return json({ saved: input.id, status: "draft" }, 200, ctx.cors);
    }
    if ((m = path.match(/^\/api\/challenge\/review\/knowledge\/([a-z0-9][a-z0-9.-]{2,119})\/decision$/)) && method === "POST") {
      if (!ctx.canApproveLaw) throw new HttpError(403, "Only a legal approver can verify, reject or retire knowledge records.");
      const id = m[1] as string;
      const record = await loadRecord(db, id);
      if (!record) throw new HttpError(404, "Record not found.");
      const body = await readJson(request);
      const next = decide(record.status, String(body.decision ?? ""));
      if (!next) throw new HttpError(409, `A ${record.status} record cannot be given that decision.`);
      const note = cleanText(body.note, 2000) ?? "";
      if (next === "verified" && record.aiGenerated && note.length < 10) throw new HttpError(400, "This note was written by AI. Say what you checked it against before verifying it.");
      const supersededBy = next === "outdated" ? cleanText(body.supersededBy, 120) ?? null : record.supersededBy;
      if (supersededBy && (supersededBy === id || !(await loadRecord(db, supersededBy)))) throw new HttpError(400, "The replacing record does not exist.");
      const action = next === "verified" ? "verified" : next === "rejected" ? "rejected" : next === "outdated" ? "outdated" : "reopened";
      await db.batch([
        db.prepare(`UPDATE knowledge_records SET status = ?, reviewed_by = ?, reviewed_at = ?, review_note = ?, superseded_by = ?, updated_at = ? WHERE id = ? AND status = ?`)
          .bind(next, next === "draft" ? null : ctx.userId, next === "draft" ? null : ctx.nowIso, note, supersededBy, ctx.nowIso, id, record.status),
        recordEvent(db, { recordId: id, at: ctx.nowIso, actor: ctx.userId, action, from: record.status, to: next, note }),
        audit(db, { actorUserId: ctx.userId, actorRole: "reviewer", action: `knowledge.${action}`, details: { id, note }, at: ctx.nowIso }),
      ]);
      return json({ id, status: next }, 200, ctx.cors);
    }
    if (path === "/api/challenge/review/lawwatch" && method === "GET") {
      const [bills, events, lastRun] = await Promise.all([
        db.prepare(`SELECT bill_id AS "billId", title, object, cap_references_json AS "capReferencesJson", stage, first_reading AS "firstReading",
          second_reading AS "secondReading", third_reading AS "thirdReading", assent_date AS "assentDate", withdrawn_date AS "withdrawnDate",
          source_url AS "sourceUrl", last_checked_at AS "lastCheckedAt", last_changed_at AS "lastChangedAt", review_status AS "reviewStatus", review_note AS "reviewNote"
          FROM law_watch_bills ORDER BY (review_status = 'new') DESC, last_changed_at DESC LIMIT 200`).all<Record<string, unknown>>(),
        db.prepare(`SELECT bill_id AS "billId", detected_at AS "detectedAt", kind, summary FROM law_watch_events ORDER BY detected_at DESC LIMIT 30`).all<Record<string, unknown>>(),
        db.prepare(`SELECT ran_at AS "ranAt", checked, tax_bills AS "taxBills", changes, errors_json AS "errorsJson" FROM law_watch_runs ORDER BY ran_at DESC LIMIT 1`).first<Record<string, unknown>>(),
      ]);
      return json({
        stageLabels: STAGE_LABEL,
        bills: bills.results.map((row) => ({ ...row, capReferences: JSON.parse(String(row.capReferencesJson ?? "[]")), capReferencesJson: undefined })),
        events: events.results,
        lastRun: lastRun ? { ...lastRun, errors: JSON.parse(String(lastRun.errorsJson ?? "[]")), errorsJson: undefined } : null,
      }, 200, ctx.cors);
    }
    if (path === "/api/challenge/review/lawwatch/run" && method === "POST") {
      if (!ctx.canApproveLaw) throw new HttpError(403, "Only a legal approver can run the legislative watch.");
      const result = await runLawWatch(db, ctx.env, ctx.now);
      await audit(db, { actorUserId: ctx.userId, actorRole: "reviewer", action: "lawwatch.run", details: { ...result, errors: result.errors.length }, at: ctx.nowIso }).run();
      return json({ result }, 200, ctx.cors);
    }
    if ((m = path.match(/^\/api\/challenge\/review\/lawwatch\/(\d{1,9})$/)) && method === "POST") {
      const billId = Number(m[1]);
      const body = await readJson(request);
      if (body.status !== "reviewed" && body.status !== "not_relevant") throw new HttpError(400, "Choose reviewed or not relevant.");
      const note = cleanText(body.note, 1000) ?? "";
      const updated = await db.prepare(`UPDATE law_watch_bills SET review_status = ?, reviewed_by = ?, reviewed_at = ?, review_note = ? WHERE bill_id = ?`)
        .bind(body.status, ctx.userId, ctx.nowIso, note, billId).run();
      if (!updated.meta.changes) throw new HttpError(404, "Bill not found.");
      await audit(db, { actorUserId: ctx.userId, actorRole: "reviewer", action: "lawwatch.review", details: { billId, status: body.status, note }, at: ctx.nowIso }).run();
      return json({ reviewed: billId }, 200, ctx.cors);
    }
    if (path === "/api/challenge/review/entitlements" && method === "POST") {
      // Payments taken by hand (mobile money via WhatsApp, or an agreed managed-dispute quote):
      // a legal approver grants the tier using the short case reference the customer quotes.
      if (!ctx.canApproveLaw) throw new HttpError(403, "Only a legal approver can record a payment for a case.");
      const body = await readJson(request);
      const reference = String(body.caseRef ?? "").trim().toLowerCase();
      if (body.tier !== "reviewed" && body.tier !== "managed") throw new HttpError(400, "Choose reviewed or managed.");
      const paymentReference = cleanText(body.paymentReference, 120);
      if (!paymentReference) throw new HttpError(400, "Record the payment reference (for example the mobile money transaction ID).");
      const found = await findCasesByReference(db, reference);
      if (found.length !== 1) throw new HttpError(found.length ? 409 : 404, found.length ? "More than one case matches; use more of the reference." : "No case has that reference.");
      const row = found[0] as CaseRow;
      await db.batch([
        db.prepare(`INSERT INTO challenge_case_entitlements (case_id, tier, granted_by, granted_at, payment_reference) VALUES (?, ?, ?, ?, ?) ON CONFLICT DO NOTHING`).bind(row.id, body.tier, ctx.userId, ctx.nowIso, paymentReference),
        audit(db, { actorUserId: ctx.userId, actorRole: "reviewer", action: "entitlement.grant", caseId: row.id, details: { tier: body.tier, paymentReference, manual: true }, at: ctx.nowIso }),
      ]);
      // The paid tier makes review required: assign a reviewer now, not on the owner's next visit.
      const view = await syncReview(ctx, row, await buildView(ctx, row));
      return json({ granted: body.tier, caseId: row.id, assignedReviewerId: view.case.assignedReviewerId }, 200, ctx.cors);
    }
    if (path === "/api/challenge/review/holidays" && method === "POST") {
      // Any reviewer may list a holiday (e.g. a gazetted Eid date). It starts
      // unverified: it can then only make TaxComp warn users to lodge EARLIER.
      const body = await readJson(request);
      const date = body.date;
      const name = cleanText(body.name, 80);
      const sourceUrl = body.sourceUrl ? String(body.sourceUrl) : null;
      if (!isIsoDate(date) || !name || name.length < 3) throw new HttpError(400, "Give the date (YYYY-MM-DD) and the holiday's name.");
      if (sourceUrl && !/^https:\/\/\S{4,500}$/.test(sourceUrl)) throw new HttpError(400, "The source must be an https:// link.");
      await db.batch([
        db.prepare(`INSERT INTO public_holidays (holiday_date, name, source_url, note, added_by, created_at) VALUES (?, ?, ?, '', ?, ?) ON CONFLICT (holiday_date, name) DO NOTHING`)
          .bind(date, name, sourceUrl, ctx.userId, ctx.nowIso),
        audit(db, { actorUserId: ctx.userId, actorRole: "reviewer", action: "holiday.add", details: { date, name }, at: ctx.nowIso }),
      ]);
      return json({ added: { date, name } }, 200, ctx.cors);
    }
    if (path === "/api/challenge/review/holidays/verify" && method === "POST") {
      // Verifying lets a holiday move a deadline LATER (under next_business_day), so legal approvers only, with a source.
      if (!ctx.canApproveLaw) throw new HttpError(403, "Only a legal approver can confirm public holidays.");
      const body = await readJson(request);
      const date = body.date;
      const name = cleanText(body.name, 80);
      const sourceUrl = String(body.sourceUrl ?? "");
      if (!isIsoDate(date) || !name) throw new HttpError(400, "Give the holiday's date and name.");
      if (!/^https:\/\/\S{4,500}$/.test(sourceUrl)) throw new HttpError(400, "Give the https:// link to the Gazette notice or Act that confirms it.");
      const result = await db.prepare(`UPDATE public_holidays SET verified_by = ?, verified_at = ?, source_url = ? WHERE holiday_date = ? AND name = ?`)
        .bind(ctx.userId, ctx.nowIso, sourceUrl, date, name).run();
      if (!result.meta.changes) throw new HttpError(404, "Holiday not found.");
      await audit(db, { actorUserId: ctx.userId, actorRole: "reviewer", action: "holiday.verify", details: { date, name, sourceUrl }, at: ctx.nowIso }).run();
      return json({ verified: { date, name } }, 200, ctx.cors);
    }
    if ((m = path.match(/^\/api\/challenge\/review\/rules\/([a-z0-9.-]{3,60})\/approve$/)) && method === "POST") {
      if (!ctx.canApproveLaw) throw new HttpError(403, "Only a legal approver can approve the deadline rules.");
      const version = m[1] as string;
      const result = await db.prepare(`UPDATE procedure_rule_sets SET approved_for_computation = 1, approved_by = ?, approved_at = ? WHERE version = ?`).bind(ctx.userId, ctx.nowIso, version).run();
      if (!result.meta.changes) throw new HttpError(404, "Rule set not found.");
      await audit(db, { actorUserId: ctx.userId, actorRole: "reviewer", action: "rules.approve", details: { version }, at: ctx.nowIso }).run();
      return json({ approved: version }, 200, ctx.cors);
    }
  }

  throw new HttpError(404, "Not found.");
}

export async function handleChallengeRequest(request: Request, env: ChallengeEnv): Promise<Response> {
  const cors = corsFor(request, env);
  if (!cors) return json({ error: "Origin is not allowed." }, 403, {});
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  const db = env.UNANSWERED_QUESTIONS;
  if (env.DATABASE_PROVIDER !== "supabase" || !db) return json({ error: "Challenge an Assessment is not available yet." }, 503, cors);

  if (env.CHAT_LIMITER?.limit) {
    try {
      const limit = await env.CHAT_LIMITER.limit({ key: `challenge:${request.headers.get("CF-Connecting-IP") || "unknown"}` });
      if (!limit.success) return json({ error: "Too many requests. Please wait a minute." }, 429, cors);
    } catch { /* limiter outage: continue, auth still applies */ }
  }

  const token = readBearerToken(request);
  const supabaseUrl = normalizeSupabaseUrl(env.SUPABASE_URL);
  if (!token || !supabaseUrl) return json({ error: "Sign in to continue." }, 401, cors);
  let claims;
  try {
    claims = await createSupabaseTokenVerifier({ supabaseUrl, ...(env.SUPABASE_FETCH ? { fetchImpl: env.SUPABASE_FETCH } : {}) }).verify(token);
  } catch {
    return json({ error: "Sign-in could not be checked. Please try again shortly." }, 503, cors);
  }
  if (!claims) return json({ error: "Sign in to continue." }, 401, cors);

  const now = env.CHALLENGE_CLOCK ? env.CHALLENGE_CLOCK() : new Date();
  try {
    const { reviewer, canApproveLaw } = await isActiveReviewer(db, claims.sub);
    return await route({
      request, env, db, cors, userId: claims.sub, email: String(claims.email ?? ""), reviewer, canApproveLaw,
      now, nowIso: now.toISOString(), today: todayIso(now),
    });
  } catch (error) {
    if (error instanceof HttpError) return json({ error: error.message, ...error.extra }, error.status, cors);
    if (error instanceof UnsafeOutputError) {
      console.error("Challenge output blocked by the safety filter", { problems: error.problems.length });
      return json({ error: "Part of the output was withheld by TaxComp's safety check. Please contact Opitekene Consultancy for help with this case." }, 500, cors);
    }
    console.error("Challenge request failed", { errorName: error instanceof Error ? error.name : "UnknownError" });
    return json({ error: "Something went wrong. Please try again." }, 500, cors);
  }
}
