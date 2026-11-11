// Database access for Challenge an Assessment, through the Worker's
// D1-compatible adapter (worker/db.mjs). Every case query is scoped by owner
// or by assigned reviewer; callers never pass raw SQL.
import type { Tier } from "./review.mts";
import type {
  CaseLaw, CaseRow, ConfirmableField, DisputedItem, FieldConfirmation, ProvisionVersion, PublicHoliday, RuleSet, Statute,
} from "./types.mts";

export interface Statement {
  bind(...values: unknown[]): Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta: { changes: number } }>;
}
export interface Database {
  prepare(sql: string): Statement;
  batch(statements: Statement[]): Promise<unknown[]>;
}

type Row = Record<string, unknown>;

const str = (value: unknown): string | null => (value === null || value === undefined ? null : String(value));
const num = (value: unknown): number | null => (value === null || value === undefined ? null : Number(value));
const parse = <T,>(value: unknown, fallback: T): T => {
  try { return typeof value === "string" ? JSON.parse(value) as T : fallback; } catch { return fallback; }
};

const CASE_COLUMNS = `id, owner_user_id AS "ownerUserId", tax_head AS "taxHead", assessment_type AS "assessmentType", tin,
  period_start AS "periodStart", period_end AS "periodEnd", date_issued AS "dateIssued", date_served AS "dateServed",
  service_method AS "serviceMethod", principal, penal_tax AS "penalTax", interest, tax_accepted AS "taxAccepted",
  ura_reasons AS "uraReasons", provisions_cited_json AS "provisionsCitedJson", notice_terms_json AS "noticeTermsJson",
  status, objection_filed_on AS "objectionFiledOn", decision_served_on AS "decisionServedOn", preparing_tat AS "preparingTat",
  late_reason AS "lateReason", checklist_json AS "checklistJson", review_status AS "reviewStatus",
  assigned_reviewer_id AS "assignedReviewerId", reviewed_by AS "reviewedBy", reviewed_at AS "reviewedAt", review_note AS "reviewNote",
  reviewed_case_version AS "reviewedCaseVersion", case_version AS "caseVersion", created_at AS "createdAt", updated_at AS "updatedAt"`;

export function toCaseRow(row: Row): CaseRow {
  return {
    id: String(row.id),
    ownerUserId: String(row.ownerUserId),
    taxHead: str(row.taxHead) as CaseRow["taxHead"],
    assessmentType: str(row.assessmentType) as CaseRow["assessmentType"],
    tin: str(row.tin),
    periodStart: str(row.periodStart),
    periodEnd: str(row.periodEnd),
    dateIssued: str(row.dateIssued),
    dateServed: str(row.dateServed),
    serviceMethod: str(row.serviceMethod) as CaseRow["serviceMethod"],
    principal: num(row.principal),
    penalTax: num(row.penalTax),
    interest: num(row.interest),
    taxAccepted: num(row.taxAccepted),
    uraReasons: String(row.uraReasons ?? ""),
    provisionsCited: parse<string[]>(row.provisionsCitedJson, []),
    noticeTerms: parse<CaseRow["noticeTerms"]>(row.noticeTermsJson, {}),
    status: String(row.status) as CaseRow["status"],
    objectionFiledOn: str(row.objectionFiledOn),
    decisionServedOn: str(row.decisionServedOn),
    preparingTat: Number(row.preparingTat) === 1,
    lateReason: String(row.lateReason ?? ""),
    checklist: parse<CaseRow["checklist"]>(row.checklistJson, {}),
    reviewStatus: String(row.reviewStatus) as CaseRow["reviewStatus"],
    assignedReviewerId: str(row.assignedReviewerId),
    reviewedBy: str(row.reviewedBy),
    reviewedAt: str(row.reviewedAt),
    reviewNote: String(row.reviewNote ?? ""),
    reviewedCaseVersion: num(row.reviewedCaseVersion),
    caseVersion: Number(row.caseVersion),
    createdAt: String(row.createdAt),
    updatedAt: String(row.updatedAt),
  };
}

export interface Access { userId: string; role: "owner" | "reviewer" }

/** The case if the user owns it or is its assigned reviewer; otherwise null (never "forbidden"). */
export async function loadCase(db: Database, caseId: string, userId: string, isReviewer: boolean): Promise<{ row: CaseRow; access: Access } | null> {
  const row = await db.prepare(`SELECT ${CASE_COLUMNS} FROM challenge_cases WHERE id = ? AND (owner_user_id = ? OR (? = 1 AND assigned_reviewer_id = ?))`)
    .bind(caseId, userId, isReviewer ? 1 : 0, userId).first<Row>();
  if (!row) return null;
  const caseRow = toCaseRow(row);
  return { row: caseRow, access: { userId, role: caseRow.ownerUserId === userId ? "owner" : "reviewer" } };
}

/**
 * Cases whose id starts with `prefix` (the short reference a customer quotes on
 * WhatsApp). Only for legal approvers granting a paid tier; never for owners.
 */
export async function findCasesByReference(db: Database, prefix: string): Promise<CaseRow[]> {
  if (!/^[0-9a-f]{8,36}$/.test(prefix)) return [];
  const { results } = await db.prepare(`SELECT ${CASE_COLUMNS} FROM challenge_cases WHERE id LIKE ? ORDER BY created_at DESC LIMIT 2`).bind(`${prefix}%`).all<Row>();
  return results.map(toCaseRow);
}

export async function listOwnCases(db: Database, userId: string): Promise<CaseRow[]> {
  const { results } = await db.prepare(`SELECT ${CASE_COLUMNS} FROM challenge_cases WHERE owner_user_id = ? ORDER BY updated_at DESC LIMIT 100`).bind(userId).all<Row>();
  return results.map(toCaseRow);
}

export async function listAssignedCases(db: Database, reviewerId: string): Promise<Array<CaseRow & { reviewReasons: string[] }>> {
  const { results } = await db.prepare(`SELECT ${CASE_COLUMNS}, review_reasons_json AS "reviewReasonsJson" FROM challenge_cases
    WHERE assigned_reviewer_id = ? AND review_required = 1 ORDER BY updated_at ASC LIMIT 200`).bind(reviewerId).all<Row>();
  return results.map((row) => ({ ...toCaseRow(row), reviewReasons: parse<string[]>(row.reviewReasonsJson, []) }));
}

export async function loadConfirmations(db: Database, caseId: string): Promise<FieldConfirmation[]> {
  const { results } = await db.prepare(`SELECT field_name AS "fieldName", extracted_value AS "extractedValue", confirmed_value AS "confirmedValue",
    confidence, source, status FROM challenge_field_confirmations WHERE case_id = ? ORDER BY field_name`).bind(caseId).all<Row>();
  return results.map((row) => ({
    fieldName: String(row.fieldName) as ConfirmableField,
    extractedValue: str(row.extractedValue),
    confirmedValue: str(row.confirmedValue),
    confidence: num(row.confidence),
    source: String(row.source) as FieldConfirmation["source"],
    status: String(row.status) as FieldConfirmation["status"],
  }));
}

export async function loadItems(db: Database, caseId: string): Promise<DisputedItem[]> {
  const { results } = await db.prepare(`SELECT id, position, category, description, ura_amount AS "uraAmount", taxpayer_amount AS "taxpayerAmount",
    facts_json AS "factsJson", documents_json AS "documentsJson", reviewer_outcome AS "reviewerOutcome", keep_in_objection AS "keepInObjection"
    FROM challenge_disputed_items WHERE case_id = ? ORDER BY position, created_at`).bind(caseId).all<Row>();
  return results.map((row) => ({
    id: String(row.id),
    position: Number(row.position),
    category: String(row.category) as DisputedItem["category"],
    description: String(row.description),
    uraAmount: num(row.uraAmount),
    taxpayerAmount: num(row.taxpayerAmount),
    facts: parse<DisputedItem["facts"]>(row.factsJson, {}),
    documentIds: parse<string[]>(row.documentsJson, []),
    reviewerOutcome: str(row.reviewerOutcome) as DisputedItem["reviewerOutcome"],
    keepInObjection: Number(row.keepInObjection) === 1,
  }));
}

export async function loadDocuments(db: Database, caseId: string) {
  const { results } = await db.prepare(`SELECT id, doc_type AS "docType", file_name AS "fileName", size_bytes AS "sizeBytes", uploaded_at AS "uploadedAt",
    storage_path AS "storagePath", content_type AS "contentType" FROM challenge_documents WHERE case_id = ? ORDER BY uploaded_at`).bind(caseId).all<Row>();
  return results.map((row) => ({
    id: String(row.id), docType: String(row.docType), fileName: String(row.fileName), sizeBytes: Number(row.sizeBytes),
    uploadedAt: String(row.uploadedAt), storagePath: String(row.storagePath), contentType: String(row.contentType),
  }));
}

export async function loadStatutes(db: Database): Promise<Statute[]> {
  const { results } = await db.prepare(`SELECT id, title, chapter, kind, parent_id AS "parentId", bill_status AS "billStatus", returned_date AS "returnedDate",
    assent_date AS "assentDate", commencement_date AS "commencementDate", applies_from_period AS "appliesFromPeriod", source_url AS "sourceUrl", note
    FROM law_statutes ORDER BY kind DESC, id`).all<Row>();
  return results.map((row) => ({
    id: String(row.id), title: String(row.title), chapter: str(row.chapter), kind: String(row.kind) as Statute["kind"], parentId: str(row.parentId),
    billStatus: String(row.billStatus) as Statute["billStatus"], returnedDate: str(row.returnedDate), assentDate: str(row.assentDate),
    commencementDate: str(row.commencementDate), appliesFromPeriod: str(row.appliesFromPeriod), sourceUrl: str(row.sourceUrl), note: String(row.note ?? ""),
  }));
}

export async function loadVersions(db: Database): Promise<ProvisionVersion[]> {
  const { results } = await db.prepare(`SELECT id, statute_id AS "statuteId", topic, section, heading, text_or_summary AS "textOrSummary",
    text_verified_by AS "textVerifiedBy", bill_status AS "billStatus", assent_date AS "assentDate", commencement_date AS "commencementDate",
    applies_from_period AS "appliesFromPeriod", applies_to_period AS "appliesToPeriod", amended_by_statute_id AS "amendedByStatuteId",
    computation_json AS "computationJson", approved_for_computation AS "approved", source_url AS "sourceUrl", note
    FROM law_provision_versions ORDER BY topic, applies_from_period`).all<Row>();
  return results.map((row) => ({
    id: String(row.id), statuteId: String(row.statuteId), topic: String(row.topic), section: String(row.section), heading: String(row.heading),
    textOrSummary: String(row.textOrSummary), textVerified: row.textVerifiedBy !== null && row.textVerifiedBy !== undefined,
    billStatus: String(row.billStatus) as Statute["billStatus"], assentDate: str(row.assentDate), commencementDate: str(row.commencementDate),
    appliesFromPeriod: str(row.appliesFromPeriod), appliesToPeriod: str(row.appliesToPeriod), amendedByStatuteId: str(row.amendedByStatuteId),
    computation: parse<ProvisionVersion["computation"]>(row.computationJson, {}), approvedForComputation: Number(row.approved) === 1,
    sourceUrl: str(row.sourceUrl), note: String(row.note ?? ""),
  }));
}

export async function loadRuleSet(db: Database): Promise<RuleSet | null> {
  const set = await db.prepare(`SELECT version, title, sources_json AS "sourcesJson", approved_for_computation AS "approved"
    FROM procedure_rule_sets WHERE active = 1 ORDER BY created_at DESC LIMIT 1`).first<Row>();
  if (!set) return null;
  const { results } = await db.prepare(`SELECT rule_key AS "ruleKey", label, trigger_event AS "triggerEvent", period_days AS "periodDays", urgent_days AS "urgentDays",
    exclude_trigger_day AS "excludeTriggerDay", weekend_holiday_rule AS "weekendHolidayRule", counting_todo_verify AS "countingTodoVerify",
    payment_fraction AS "paymentFraction", description, source_url AS "sourceUrl" FROM procedure_rules WHERE rule_set_version = ?`).bind(set.version).all<Row>();
  return {
    version: String(set.version), title: String(set.title), approvedForComputation: Number(set.approved) === 1, sources: parse<string[]>(set.sourcesJson, []),
    rules: results.map((row) => ({
      ruleKey: String(row.ruleKey) as RuleSet["rules"][number]["ruleKey"], label: String(row.label), triggerEvent: String(row.triggerEvent),
      periodDays: num(row.periodDays), urgentDays: num(row.urgentDays), excludeTriggerDay: Number(row.excludeTriggerDay) === 1,
      weekendHolidayRule: String(row.weekendHolidayRule) as "calendar" | "next_business_day", countingTodoVerify: Number(row.countingTodoVerify) === 1,
      paymentFraction: num(row.paymentFraction), description: String(row.description), sourceUrl: str(row.sourceUrl),
    })),
  };
}

/** Public holidays from a year before today onwards (deadlines never reach further back). */
export async function loadHolidays(db: Database, today: string): Promise<PublicHoliday[]> {
  const from = `${Number(today.slice(0, 4)) - 1}-01-01`;
  const { results } = await db.prepare(`SELECT holiday_date AS "date", name, verified_by AS "verifiedBy", source_url AS "sourceUrl", note
    FROM public_holidays WHERE holiday_date >= ? ORDER BY holiday_date, name`).bind(from).all<Row>();
  return results.map((row) => ({
    date: String(row.date), name: String(row.name), verified: row.verifiedBy !== null && row.verifiedBy !== undefined,
    sourceUrl: str(row.sourceUrl), note: String(row.note ?? ""),
  }));
}

export async function loadCaseLaw(db: Database): Promise<CaseLaw[]> {
  const { results } = await db.prepare(`SELECT id, citation, parties, decision_date AS "decisionDate", forum, background, legal_question AS "legalQuestion",
    decision, principle, summary_status AS "summaryStatus", summary_source AS "summarySource", issue_tags_json AS "issueTagsJson", search_terms AS "searchTerms",
    source_url AS "sourceUrl", appeal_status AS "appealStatus" FROM tax_case_law ORDER BY decision_date DESC NULLS LAST LIMIT 2000`).all<Row>();
  return results.map((row) => ({
    id: String(row.id), citation: String(row.citation), parties: String(row.parties), decisionDate: str(row.decisionDate), forum: "TAT",
    background: str(row.background), legalQuestion: str(row.legalQuestion), decision: str(row.decision), principle: str(row.principle),
    summaryStatus: String(row.summaryStatus) as CaseLaw["summaryStatus"], summarySource: str(row.summarySource) as CaseLaw["summarySource"], issueTags: parse<string[]>(row.issueTagsJson, []),
    searchTerms: String(row.searchTerms ?? ""), sourceUrl: String(row.sourceUrl), appealStatus: String(row.appealStatus) as CaseLaw["appealStatus"],
  }));
}

export async function tierFor(db: Database, ownerUserId: string, caseId: string, now: string): Promise<Tier[]> {
  const { results } = await db.prepare(`SELECT p.challenge_tier AS "tier" FROM billing_subscriptions s JOIN billing_plans p ON p.id = s.plan_id
    WHERE s.user_id = ? AND s.status = 'active' AND s.current_period_end > ?`).bind(ownerUserId, now).all<Row>();
  const granted = await db.prepare(`SELECT tier FROM challenge_case_entitlements WHERE case_id = ?`).bind(caseId).all<Row>();
  return [...results, ...granted.results].map((row) => String(row.tier) as Tier);
}

export async function isActiveReviewer(db: Database, userId: string): Promise<{ reviewer: boolean; canApproveLaw: boolean }> {
  const row = await db.prepare(`SELECT can_approve_law AS "canApproveLaw" FROM challenge_reviewers WHERE user_id = ? AND active = 1`).bind(userId).first<Row>();
  return { reviewer: Boolean(row), canApproveLaw: Number(row?.canApproveLaw) === 1 };
}

/** The active reviewer with the fewest open review cases. */
export async function pickReviewer(db: Database): Promise<string | null> {
  const row = await db.prepare(`SELECT r.user_id AS "userId" FROM challenge_reviewers r
    LEFT JOIN challenge_cases c ON c.assigned_reviewer_id = r.user_id AND c.review_required = 1 AND c.review_status IN ('pending', 'changes_requested')
    WHERE r.active = 1 GROUP BY r.user_id ORDER BY count(c.id) ASC, r.user_id ASC LIMIT 1`).first<Row>();
  return row ? String(row.userId) : null;
}

export function audit(db: Database, entry: { actorUserId: string; actorRole: "owner" | "reviewer" | "system"; action: string; caseId?: string | null; documentId?: string | null; details?: Record<string, unknown>; at: string }): Statement {
  return db.prepare(`INSERT INTO challenge_audit_log (id, actor_user_id, actor_role, action, case_id, document_id, details_json, occurred_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(crypto.randomUUID(), entry.actorUserId, entry.actorRole, entry.action, entry.caseId ?? null, entry.documentId ?? null, JSON.stringify(entry.details ?? {}), entry.at);
}
