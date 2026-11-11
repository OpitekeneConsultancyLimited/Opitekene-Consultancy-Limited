// Legislative knowledge engine: structured legislation from the database
// (migrations 20261112000300 and 20261112000310).
//
// - Public read API: GET /api/legislation/* (no sign-in; structure is public law).
// - Reviewer workflow: /api/challenge/review/legislation/* (see api.mts).
// - Retrieval for the AI assistant: retrieveLegislation() and friends.
//
// Nothing here writes or invents section wording. Every record carries its
// verification status and edition, and answers say what is not known.
import type { Database } from "./store.mts";

export const STATUSES = ["unverified", "under_review", "verified", "superseded", "requires_amendment_review"] as const;
export type VerificationStatus = (typeof STATUSES)[number];
export const STATUS_LABEL: Readonly<Record<VerificationStatus, string>> = {
  unverified: "Unverified",
  under_review: "Under review",
  verified: "Verified against official edition",
  superseded: "Superseded",
  requires_amendment_review: "Requires amendment review",
};
/** Statuses only a legal approver may set. */
const APPROVER_ONLY = new Set<VerificationStatus>(["verified", "superseded"]);

export type EvidenceLevel = "verified_wording" | "unverified_wording" | "verified_structure" | "unverified_structure";
export const EVIDENCE_LABEL: Readonly<Record<EvidenceLevel | "missing", string>> = {
  verified_wording: "Verified legislation with full wording",
  unverified_wording: "Wording held but not verified",
  verified_structure: "Verified structure only (heading; no wording held)",
  unverified_structure: "Unverified structure only (heading; no wording held)",
  missing: "Not in TaxComp's legislative database",
};

export class LegislationError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

type Row = Record<string, unknown>;
const str = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const LAW_ID = /^[a-z0-9][a-z0-9-]{1,59}$/;
const EDITION_ID = /^[a-z0-9][a-z0-9-]{2,59}$/;
const SECTION_NO = /^\d{1,3}[A-Z]{0,2}$/;

// ------------------------------------------------------------------ editions
export interface Edition {
  id: string;
  jurisdiction: string;
  label: string;
  kind: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  publicationDate: string | null;
  verificationStatus: VerificationStatus;
  coverageNote: string;
}

export interface EditionChoice {
  edition: Edition | null;
  match: "requested" | "covers-date" | "latest-before-date" | "latest-captured" | "none";
  warning: string | null;
}

export async function loadEditions(db: Database, jurisdiction = "UG"): Promise<Edition[]> {
  const { results } = await db.prepare(`SELECT id, jurisdiction, label, kind, effective_from AS "effectiveFrom", effective_to AS "effectiveTo",
    publication_date AS "publicationDate", verification_status AS "verificationStatus", coverage_note AS "coverageNote"
    FROM legislation_editions WHERE jurisdiction = ? ORDER BY effective_from DESC, id`).bind(jurisdiction).all<Row>();
  return results.map((r) => ({
    id: String(r.id), jurisdiction: String(r.jurisdiction), label: String(r.label), kind: String(r.kind), effectiveFrom: String(r.effectiveFrom),
    effectiveTo: str(r.effectiveTo), publicationDate: str(r.publicationDate), verificationStatus: String(r.verificationStatus) as VerificationStatus, coverageNote: String(r.coverageNote ?? ""),
  }));
}

function period(e: Edition): string {
  return `${e.effectiveFrom} to ${e.effectiveTo ?? "open"}`;
}

/**
 * Picks the edition for a request. A date after the latest captured edition
 * gets that edition with a warning: an old edition is historical evidence,
 * not proof of the law in force on a later date.
 */
export function chooseEdition(editions: Edition[], { editionId, onDate, today }: { editionId?: string | null; onDate?: string | null; today: string }): EditionChoice {
  if (editionId) {
    const edition = editions.find((e) => e.id === editionId);
    if (!edition) throw new LegislationError(404, "That edition is not in the database.");
    return { edition, match: "requested", warning: edition.effectiveTo && edition.effectiveTo < today ? `${edition.label} states the law for ${period(edition)}. It is a historical edition and may not show the law in force today.` : null };
  }
  const date = onDate ?? today;
  const covering = editions.filter((e) => e.effectiveFrom <= date && (!e.effectiveTo || date <= e.effectiveTo));
  if (covering.length) {
    const edition = covering[0] as Edition;
    return { edition, match: onDate ? "covers-date" : "latest-captured", warning: null };
  }
  const before = editions.filter((e) => e.effectiveFrom <= date);
  if (before.length) {
    const edition = before[0] as Edition;
    return {
      edition,
      match: onDate ? "latest-before-date" : "latest-captured",
      warning: `The latest edition in TaxComp's database is ${edition.label} (${period(edition)}). It may not reflect the law in force on ${date}: later amendments have not been captured.`,
    };
  }
  return { edition: null, match: "none", warning: `TaxComp's legislative database has no edition covering ${date}.` };
}

// ------------------------------------------------------------------ records
export interface LaterAmendment {
  statuteId: string;
  title: string;
  billStatus: string;
  appliesFrom: string | null;
}

export interface LawSummary {
  id: string;
  versionId: string;
  shortTitle: string;
  officialTitle: string;
  chapter: string | null;
  category: string;
  taxCategory: string;
  jurisdiction: string;
  parentLawId: string | null;
  statuteId: string | null;
  commencementDate: string | null;
  enablingProvision: string | null;
  statutoryInstrument: string | null;
  sectionCount: number;
  scheduleCount: number;
  sourceReference: string;
  verificationStatus: VerificationStatus;
  verificationLabel: string;
  verificationNote: string;
  officialSourceUrl: string | null;
  verifiedAt: string | null;
  lastUpdated: string;
  editionId: string;
  laterAmendments: LaterAmendment[];
}

const LAW_SELECT = `SELECT l.id, v.id AS "versionId", l.short_title AS "shortTitle", v.official_title AS "officialTitle", v.chapter, l.category, l.tax_category AS "taxCategory",
  l.jurisdiction, l.parent_law_id AS "parentLawId", l.statute_id AS "statuteId", v.commencement_date AS "commencementDate", v.enabling_provision AS "enablingProvision",
  v.statutory_instrument AS "statutoryInstrument", v.section_count AS "sectionCount", v.schedule_count AS "scheduleCount", v.source_reference AS "sourceReference",
  v.verification_status AS "verificationStatus", v.verification_note AS "verificationNote", v.official_source_url AS "officialSourceUrl", v.verified_at AS "verifiedAt",
  v.updated_at AS "lastUpdated", v.edition_id AS "editionId"
  FROM legislation_law_versions v JOIN legislation_laws l ON l.id = v.law_id`;

function toLaw(r: Row, amendments: Map<string, LaterAmendment[]>): LawSummary {
  const status = String(r.verificationStatus) as VerificationStatus;
  const statuteId = str(r.statuteId);
  const parentLawId = str(r.parentLawId);
  return {
    id: String(r.id), versionId: String(r.versionId), shortTitle: String(r.shortTitle), officialTitle: String(r.officialTitle), chapter: str(r.chapter),
    category: String(r.category), taxCategory: String(r.taxCategory), jurisdiction: String(r.jurisdiction), parentLawId, statuteId,
    commencementDate: str(r.commencementDate), enablingProvision: str(r.enablingProvision), statutoryInstrument: str(r.statutoryInstrument),
    sectionCount: Number(r.sectionCount), scheduleCount: Number(r.scheduleCount), sourceReference: String(r.sourceReference),
    verificationStatus: status, verificationLabel: STATUS_LABEL[status], verificationNote: String(r.verificationNote ?? ""), officialSourceUrl: str(r.officialSourceUrl),
    verifiedAt: str(r.verifiedAt), lastUpdated: String(r.lastUpdated), editionId: String(r.editionId),
    laterAmendments: amendments.get(statuteId ?? "") ?? amendments.get(parentLawId ?? "") ?? [],
  };
}

/**
 * Amendment Acts in the law register that apply after the edition ends (or
 * whose date is unknown): the edition does not show their changes.
 */
async function laterAmendments(db: Database, edition: Edition | null): Promise<Map<string, LaterAmendment[]>> {
  const map = new Map<string, LaterAmendment[]>();
  if (!edition) return map;
  const { results } = await db.prepare(`SELECT id, title, parent_id AS "parentId", bill_status AS "billStatus",
    COALESCE(applies_from_period, commencement_date, assent_date) AS "appliesFrom" FROM law_statutes WHERE kind = 'amendment' ORDER BY id`).all<Row>();
  for (const r of results) {
    const appliesFrom = str(r.appliesFrom);
    if (appliesFrom && edition.effectiveTo && appliesFrom <= edition.effectiveTo) continue;
    if (appliesFrom && !edition.effectiveTo && appliesFrom <= edition.effectiveFrom) continue;
    const parent = String(r.parentId);
    const list = map.get(parent) ?? [];
    list.push({ statuteId: String(r.id), title: String(r.title), billStatus: String(r.billStatus), appliesFrom });
    map.set(parent, list);
  }
  return map;
}

export interface Paging { page: number; pageSize: number }

export function paging(params: URLSearchParams, max = 200, fallback = 50): Paging {
  const page = params.has("page") ? Number(params.get("page")) : 1;
  const pageSize = params.has("pageSize") ? Number(params.get("pageSize")) : fallback;
  if (!Number.isInteger(page) || page < 1 || page > 10_000) throw new LegislationError(400, "page must be a whole number from 1.");
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > max) throw new LegislationError(400, `pageSize must be a whole number from 1 to ${max}.`);
  return { page, pageSize };
}

export async function listLaws(db: Database, edition: Edition, { category, taxCategory }: { category?: string | null; taxCategory?: string | null }, { page, pageSize }: Paging) {
  const where = ["v.edition_id = ?"];
  const values: unknown[] = [edition.id];
  if (category) { where.push("l.category = ?"); values.push(category); }
  if (taxCategory) { where.push("l.tax_category = ?"); values.push(taxCategory); }
  const [{ results }, count, amendments] = await Promise.all([
    db.prepare(`${LAW_SELECT} WHERE ${where.join(" AND ")} ORDER BY (l.category = 'act') DESC, l.parent_law_id NULLS FIRST, v.official_title LIMIT ? OFFSET ?`).bind(...values, pageSize, (page - 1) * pageSize).all<Row>(),
    db.prepare(`SELECT count(*)::int AS n FROM legislation_law_versions v JOIN legislation_laws l ON l.id = v.law_id WHERE ${where.join(" AND ")}`).bind(...values).first<Row>(),
    laterAmendments(db, edition),
  ]);
  return { total: Number(count?.n ?? 0), laws: results.map((r) => toLaw(r, amendments)) };
}

export async function getLaw(db: Database, edition: Edition, lawId: string): Promise<LawSummary> {
  if (!LAW_ID.test(lawId)) throw new LegislationError(400, "Invalid law id.");
  const [row, amendments] = await Promise.all([
    db.prepare(`${LAW_SELECT} WHERE v.edition_id = ? AND l.id = ?`).bind(edition.id, lawId).first<Row>(),
    laterAmendments(db, edition),
  ]);
  if (!row) throw new LegislationError(404, "That law is not in this edition.");
  return toLaw(row, amendments);
}

export async function lawParts(db: Database, versionId: string) {
  const { results } = await db.prepare(`SELECT part_number AS "partNumber", part_title AS "partTitle", count(*)::int AS "sectionCount", min(position) AS "firstPosition"
    FROM legislation_sections WHERE law_version_id = ? GROUP BY part_number, part_title ORDER BY min(position)`).bind(versionId).all<Row>();
  return results.map((r) => ({ number: str(r.partNumber), title: str(r.partTitle), sectionCount: Number(r.sectionCount) }));
}

export async function lawSchedules(db: Database, versionId: string) {
  const { results } = await db.prepare(`SELECT id, label, title, position, verification_status AS "verificationStatus" FROM legislation_schedules WHERE law_version_id = ? ORDER BY position`).bind(versionId).all<Row>();
  return results.map((r) => ({ id: String(r.id), label: String(r.label), title: str(r.title), position: Number(r.position), verificationStatus: String(r.verificationStatus), verificationLabel: STATUS_LABEL[String(r.verificationStatus) as VerificationStatus] }));
}

export interface SectionRecord {
  id: string;
  lawId: string;
  lawTitle: string;
  chapter: string | null;
  category: string;
  editionId: string;
  sectionNumber: string;
  citation: string;
  heading: string;
  part: { number: string | null; title: string | null };
  division: string | null;
  position: number;
  flags: string[];
  wording: string | null;
  wordingStatus: "none" | "unverified" | "verified";
  verificationStatus: VerificationStatus;
  verificationLabel: string;
  evidenceLevel: EvidenceLevel;
  evidenceLabel: string;
  officialSourceUrl: string | null;
  verifiedAt: string | null;
  rank?: number;
}

const SECTION_SELECT = `SELECT s.id, v.law_id AS "lawId", v.official_title AS "lawTitle", v.chapter, l.category, v.edition_id AS "editionId", s.section_number AS "sectionNumber",
  s.heading, s.part_number AS "partNumber", s.part_title AS "partTitle", s.division, s.position, s.flags_json AS "flagsJson", s.wording, s.wording_status AS "wordingStatus",
  s.verification_status AS "verificationStatus", s.official_source_url AS "officialSourceUrl", s.verified_at AS "verifiedAt"
  FROM legislation_sections s JOIN legislation_law_versions v ON v.id = s.law_version_id JOIN legislation_laws l ON l.id = v.law_id`;

export function evidenceLevel(wordingStatus: string, status: string): EvidenceLevel {
  if (wordingStatus === "verified" && status === "verified") return "verified_wording";
  if (wordingStatus !== "none") return "unverified_wording";
  return status === "verified" ? "verified_structure" : "unverified_structure";
}

export function citationFor(lawTitle: string, chapter: string | null, category: string, number: string): string {
  return `${lawTitle}${chapter ? ` (${chapter})` : ""}, ${category === "act" ? "s." : "reg. "}${number}`;
}

function toSection(r: Row): SectionRecord {
  const status = String(r.verificationStatus) as VerificationStatus;
  const wordingStatus = String(r.wordingStatus) as SectionRecord["wordingStatus"];
  const level = evidenceLevel(wordingStatus, status);
  let flags: string[] = [];
  try { flags = JSON.parse(String(r.flagsJson ?? "[]")) as string[]; } catch { flags = []; }
  return {
    id: String(r.id), lawId: String(r.lawId), lawTitle: String(r.lawTitle), chapter: str(r.chapter), category: String(r.category), editionId: String(r.editionId),
    sectionNumber: String(r.sectionNumber), citation: citationFor(String(r.lawTitle), str(r.chapter), String(r.category), String(r.sectionNumber)), heading: String(r.heading),
    part: { number: str(r.partNumber), title: str(r.partTitle) }, division: str(r.division), position: Number(r.position), flags,
    wording: wordingStatus === "none" ? null : str(r.wording), wordingStatus, verificationStatus: status, verificationLabel: STATUS_LABEL[status],
    evidenceLevel: level, evidenceLabel: EVIDENCE_LABEL[level], officialSourceUrl: str(r.officialSourceUrl), verifiedAt: str(r.verifiedAt),
    ...(r.rank !== undefined ? { rank: Number(r.rank) } : {}),
  };
}

export async function listSections(db: Database, versionId: string, { part }: { part?: string | null }, { page, pageSize }: Paging) {
  if (part && !/^[IVXLC]{1,8}$/.test(part)) throw new LegislationError(400, "part must be a Roman numeral such as IX.");
  const where = ["s.law_version_id = ?", ...(part ? ["s.part_number = ?"] : [])];
  const values = [versionId, ...(part ? [part] : [])];
  const [{ results }, count] = await Promise.all([
    db.prepare(`${SECTION_SELECT} WHERE ${where.join(" AND ")} ORDER BY s.position LIMIT ? OFFSET ?`).bind(...values, pageSize, (page - 1) * pageSize).all<Row>(),
    db.prepare(`SELECT count(*)::int AS n FROM legislation_sections s WHERE ${where.join(" AND ")}`).bind(...values).first<Row>(),
  ]);
  return { total: Number(count?.n ?? 0), sections: results.map(toSection) };
}

export async function getSection(db: Database, versionId: string, number: string): Promise<SectionRecord> {
  if (!SECTION_NO.test(number)) throw new LegislationError(400, "Invalid section number.");
  const row = await db.prepare(`${SECTION_SELECT} WHERE s.law_version_id = ? AND s.section_number = ?`).bind(versionId, number).first<Row>();
  if (!row) throw new LegislationError(404, "That section is not in this law and edition.");
  return toSection(row);
}

const NUMBER_QUERY = /\b(?:s(?:ec(?:tion)?)?|reg(?:ulation)?)\.?\s*(\d{1,3}[A-Za-z]{0,2})\b|^\s*(\d{1,3}[A-Za-z]{0,2})\s*$/i;

/**
 * Searches section numbers and headings. Words must all match (falling back
 * to any word); "s.80", "section 80" or "80" searches by number.
 */
export async function searchSections(db: Database, edition: Edition, { q, lawId }: { q: string; lawId?: string | null }, { page, pageSize }: Paging) {
  const query = q.replace(/\s+/g, " ").trim();
  if (query.length < 2 || query.length > 200) throw new LegislationError(400, "q must be 2 to 200 characters.");
  if (lawId && !LAW_ID.test(lawId)) throw new LegislationError(400, "Invalid law id.");
  const lawFilter = lawId ? " AND v.law_id = ?" : "";
  const lawValues = lawId ? [lawId] : [];
  const number = query.match(NUMBER_QUERY);
  if (number) {
    const n = (number[1] ?? number[2] ?? "").toUpperCase();
    const rest = query.replace(NUMBER_QUERY, " ").replace(/\b(?:of|the|act)\b/gi, " ").trim();
    const { results } = await db.prepare(`${SECTION_SELECT} WHERE v.edition_id = ? AND upper(s.section_number) = ?${lawFilter}
      ORDER BY ${rest ? "(to_tsvector('english', v.official_title) @@ plainto_tsquery('english', ?)) DESC," : ""} (l.category = 'act') DESC, v.law_id LIMIT ? OFFSET ?`)
      .bind(edition.id, n, ...lawValues, ...(rest ? [rest] : []), pageSize, (page - 1) * pageSize).all<Row>();
    return { mode: "number" as const, total: results.length, results: results.map(toSection) };
  }
  const run = (tsquery: string) => db.prepare(`WITH q AS (SELECT ${tsquery} AS query)
    ${SECTION_SELECT.replace("SELECT s.id,", "SELECT ts_rank(s.search_tsv, q.query) AS rank, count(*) OVER () AS total, s.id,")}, q
    WHERE v.edition_id = ? AND s.search_tsv @@ q.query${lawFilter}
    ORDER BY rank DESC, (l.category = 'act') DESC, v.law_id, s.position LIMIT ? OFFSET ?`).bind(query, edition.id, ...lawValues, pageSize, (page - 1) * pageSize).all<Row>();
  let { results } = await run("plainto_tsquery('english', ?)");
  let mode: "all-words" | "any-word" = "all-words";
  if (!results.length) {
    ({ results } = await run("NULLIF(replace(plainto_tsquery('english', ?)::text, '&', '|'), '')::tsquery"));
    mode = "any-word";
  }
  return { mode, total: Number(results[0]?.total ?? 0), results: results.map(toSection) };
}

export async function relationsFor(db: Database, lawId: string, sectionId?: string | null) {
  const { results } = await db.prepare(`SELECT r.id, r.kind, r.basis, r.evidence, r.from_law_id AS "fromLawId", r.from_section_id AS "fromSectionId", r.to_law_id AS "toLawId", r.to_section_id AS "toSectionId",
    fl.short_title AS "fromTitle", tl.short_title AS "toTitle", fs.section_number AS "fromNumber", fs.heading AS "fromHeading", ts.section_number AS "toNumber", ts.heading AS "toHeading",
    fl.category AS "fromCategory", tl.category AS "toCategory"
    FROM legislation_relations r JOIN legislation_laws fl ON fl.id = r.from_law_id JOIN legislation_laws tl ON tl.id = r.to_law_id
    LEFT JOIN legislation_sections fs ON fs.id = r.from_section_id LEFT JOIN legislation_sections ts ON ts.id = r.to_section_id
    WHERE ${sectionId ? "r.from_section_id = ? OR r.to_section_id = ?" : "r.from_law_id = ? OR r.to_law_id = ?"} ORDER BY r.basis, r.id`).bind(sectionId ?? lawId, sectionId ?? lawId).all<Row>();
  const end = (title: unknown, category: unknown, number: unknown, heading: unknown) => ({
    title: String(title), section: str(number), heading: str(heading), label: number ? `${String(title)}, ${category === "act" ? "s." : "reg. "}${String(number)} ${String(heading)}` : String(title),
  });
  return results.map((r) => ({
    id: String(r.id), kind: String(r.kind), basis: String(r.basis) as "confirmed" | "inferred", evidence: String(r.evidence ?? ""),
    from: { lawId: String(r.fromLawId), sectionId: str(r.fromSectionId), ...end(r.fromTitle, r.fromCategory, r.fromNumber, r.fromHeading) },
    to: { lawId: String(r.toLawId), sectionId: str(r.toSectionId), ...end(r.toTitle, r.toCategory, r.toNumber, r.toHeading) },
  }));
}

export async function coverageGaps(db: Database, jurisdiction = "UG") {
  const { results } = await db.prepare(`SELECT id, title, kind, keywords, note FROM legislation_coverage_gaps WHERE jurisdiction = ? ORDER BY id`).bind(jurisdiction).all<Row>();
  return results.map((r) => ({ id: String(r.id), title: String(r.title), kind: String(r.kind), keywords: String(r.keywords), note: String(r.note) }));
}

// ------------------------------------------------------------------ public API
export interface LegislationEnv {
  UNANSWERED_QUESTIONS?: Database;
  DATABASE_PROVIDER?: string;
  ALLOWED_ORIGIN?: string;
  CHAT_LIMITER?: { limit(options: { key: string }): Promise<{ success: boolean }> };
  CHALLENGE_CLOCK?: () => Date;
}

function respond(data: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Cache-Control": status === 200 ? "public, max-age=300" : "no-store", "Content-Type": "application/json; charset=utf-8", "X-Content-Type-Options": "nosniff", ...headers },
  });
}

/** GET /api/legislation/* — public, read-only. */
export async function handleLegislationRequest(request: Request, env: LegislationEnv): Promise<Response> {
  const origin = request.headers.get("Origin");
  if (!origin || origin !== env.ALLOWED_ORIGIN) return respond({ error: "Origin is not allowed." }, 403, {});
  const cors = { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Methods": "GET, OPTIONS", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Max-Age": "600", Vary: "Origin" };
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (request.method !== "GET") return respond({ error: "The legislation API is read-only. Use GET." }, 405, cors);
  const db = env.UNANSWERED_QUESTIONS;
  if (env.DATABASE_PROVIDER !== "supabase" || !db) return respond({ error: "The legislative database is not available yet." }, 503, cors);
  if (env.CHAT_LIMITER?.limit) {
    try {
      const limit = await env.CHAT_LIMITER.limit({ key: `legislation:${request.headers.get("CF-Connecting-IP") || "unknown"}` });
      if (!limit.success) return respond({ error: "Too many requests. Please wait a minute." }, 429, cors);
    } catch { /* limiter outage: read-only public data, continue */ }
  }
  const url = new URL(request.url);
  const params = url.searchParams;
  const path = url.pathname.replace(/\/+$/, "");
  const today = (env.CHALLENGE_CLOCK ? env.CHALLENGE_CLOCK() : new Date()).toISOString().slice(0, 10);
  try {
    const jurisdiction = (params.get("jurisdiction") ?? "UG").toUpperCase();
    if (!/^[A-Z]{2}$/.test(jurisdiction)) throw new LegislationError(400, "jurisdiction must be a two-letter country code.");
    const editionId = params.get("edition");
    if (editionId && !EDITION_ID.test(editionId)) throw new LegislationError(400, "Invalid edition id.");
    const onDate = params.get("onDate");
    if (onDate && !ISO.test(onDate)) throw new LegislationError(400, "onDate must be YYYY-MM-DD.");
    const editions = await loadEditions(db, jurisdiction);
    const pick = () => {
      const choice = chooseEdition(editions, { editionId, onDate, today });
      if (!choice.edition) throw new LegislationError(404, choice.warning ?? "No edition available.");
      return choice as EditionChoice & { edition: Edition };
    };
    const editionView = (c: EditionChoice & { edition: Edition }) => ({ ...c.edition, match: c.match, warning: c.warning });

    if (path === "/api/legislation/editions") {
      return respond({ jurisdiction, editions, gaps: await coverageGaps(db, jurisdiction), statuses: STATUS_LABEL }, 200, cors);
    }
    if (path === "/api/legislation") {
      const choice = pick();
      const category = params.get("category");
      if (category && !["act", "regulations", "order", "rules"].includes(category)) throw new LegislationError(400, "category must be act, regulations, order or rules.");
      const taxCategory = params.get("taxCategory");
      if (taxCategory && !/^[a-z-]{2,40}$/.test(taxCategory)) throw new LegislationError(400, "Invalid taxCategory.");
      const pg = paging(params, 100, 50);
      const { total, laws } = await listLaws(db, choice.edition, { category, taxCategory }, pg);
      return respond({ edition: editionView(choice), ...pg, total, laws }, 200, cors);
    }
    if (path === "/api/legislation/search") {
      const choice = pick();
      const pg = paging(params, 50, 20);
      const found = await searchSections(db, choice.edition, { q: params.get("q") ?? "", lawId: params.get("law") }, pg);
      return respond({ edition: editionView(choice), query: params.get("q"), ...pg, ...found }, 200, cors);
    }
    const m = path.match(/^\/api\/legislation\/([a-z0-9][a-z0-9-]{1,59})(?:\/(sections|schedules|related|verification)(?:\/(\d{1,3}[A-Za-z]{0,2}))?)?$/);
    if (!m) throw new LegislationError(404, "Not found.");
    const choice = pick();
    const law = await getLaw(db, choice.edition, m[1] as string);
    const sub = m[2];
    if (!sub) {
      const [parts, schedules, related] = await Promise.all([lawParts(db, law.versionId), lawSchedules(db, law.versionId), relationsFor(db, law.id)]);
      return respond({ edition: editionView(choice), law, parts, schedules, related }, 200, cors);
    }
    if (sub === "sections" && m[3]) {
      const section = await getSection(db, law.versionId, m[3].toUpperCase());
      return respond({ edition: editionView(choice), law, section, related: await relationsFor(db, law.id, section.id) }, 200, cors);
    }
    if (m[3]) throw new LegislationError(404, "Not found.");
    if (sub === "sections") {
      const pg = paging(params, 200, 100);
      const { total, sections } = await listSections(db, law.versionId, { part: params.get("part") }, pg);
      return respond({ edition: editionView(choice), law, ...pg, total, sections }, 200, cors);
    }
    if (sub === "schedules") return respond({ edition: editionView(choice), law, schedules: await lawSchedules(db, law.versionId) }, 200, cors);
    if (sub === "related") return respond({ edition: editionView(choice), law, related: await relationsFor(db, law.id) }, 200, cors);
    // verification
    const { results } = await db.prepare(`SELECT verification_status AS status, count(*)::int AS n FROM legislation_sections WHERE law_version_id = ? GROUP BY verification_status`).bind(law.versionId).all<Row>();
    return respond({
      edition: editionView(choice), law: { id: law.id, officialTitle: law.officialTitle, verificationStatus: law.verificationStatus, verificationLabel: law.verificationLabel, verifiedAt: law.verifiedAt, officialSourceUrl: law.officialSourceUrl, laterAmendments: law.laterAmendments },
      sections: Object.fromEntries(results.map((r) => [String(r.status), Number(r.n)])),
    }, 200, cors);
  } catch (error) {
    if (error instanceof LegislationError) return respond({ error: error.message }, error.status, cors);
    console.error("Legislation request failed", { errorName: error instanceof Error ? error.name : "UnknownError", message: error instanceof Error ? error.message.slice(0, 160) : "" });
    return respond({ error: "Something went wrong. Please try again." }, 500, cors);
  }
}

// ------------------------------------------------------------------ reviewer workflow
export interface StatusChange {
  status: string;
  note?: unknown;
  officialSourceUrl?: unknown;
}

function checkChange(change: StatusChange, canApprove: boolean): { status: VerificationStatus; note: string; source: string | null } {
  const status = change.status as VerificationStatus;
  if (!(STATUSES as readonly string[]).includes(status)) throw new LegislationError(400, `Status must be one of: ${STATUSES.join(", ")}.`);
  if (APPROVER_ONLY.has(status) && !canApprove) throw new LegislationError(403, "Only a legal approver can mark legislation verified or superseded.");
  const note = String(change.note ?? "").trim().slice(0, 2000);
  const source = change.officialSourceUrl ? String(change.officialSourceUrl).trim() : null;
  if (source && !/^https:\/\/\S{4,500}$/.test(source)) throw new LegislationError(400, "The official source must be an https:// link.");
  if (status === "verified" && (!source || note.length < 10)) throw new LegislationError(400, "To verify, give the official source link and a note of what you checked.");
  return { status, note, source };
}

export async function setLawVersionStatus(db: Database, versionId: string, change: StatusChange & { chapter?: unknown; commencementDate?: unknown }, actor: string, at: string, canApprove: boolean) {
  const { status, note, source } = checkChange(change, canApprove);
  const chapter = change.chapter === undefined || change.chapter === "" ? undefined : String(change.chapter).trim();
  const commencement = change.commencementDate === undefined || change.commencementDate === "" ? undefined : String(change.commencementDate);
  if ((chapter !== undefined || commencement !== undefined) && !canApprove) throw new LegislationError(403, "Only a legal approver can confirm or correct a chapter or commencement date.");
  if (chapter !== undefined && !/^Cap\. \d{1,3}[A-Z]?$/.test(chapter)) throw new LegislationError(400, "Chapter must look like Cap. 338.");
  if (commencement !== undefined && !ISO.test(commencement)) throw new LegislationError(400, "Commencement date must be YYYY-MM-DD.");
  const result = await db.prepare(`UPDATE legislation_law_versions SET verification_status = ?, verification_note = ?, official_source_url = COALESCE(?, official_source_url),
    chapter = COALESCE(?, chapter), commencement_date = COALESCE(?, commencement_date),
    verified_by = CASE WHEN CAST(? AS text) = 'verified' THEN CAST(? AS text) ELSE NULL END, verified_at = CASE WHEN CAST(? AS text) = 'verified' THEN CAST(? AS text) ELSE NULL END, updated_at = ?, updated_by = ? WHERE id = ?`)
    .bind(status, note, source, chapter ?? null, commencement ?? null, status, actor, status, at, at, actor, versionId).run();
  if (!result.meta.changes) throw new LegislationError(404, "That law version is not in the database.");
  return { id: versionId, status };
}

export async function setSectionStatus(db: Database, sectionId: string, change: StatusChange & { heading?: unknown; wording?: unknown; wordingSourceUrl?: unknown; wordingVerified?: unknown }, actor: string, at: string, canApprove: boolean) {
  const { status, note, source } = checkChange(change, canApprove);
  const heading = change.heading === undefined || change.heading === "" ? undefined : String(change.heading).trim();
  const wording = change.wording === undefined || change.wording === "" ? undefined : String(change.wording).trim();
  if ((heading !== undefined || wording !== undefined) && !canApprove) throw new LegislationError(403, "Only a legal approver can correct a heading or enter wording.");
  if (heading !== undefined && (heading.length < 2 || heading.length > 300)) throw new LegislationError(400, "A heading must be 2 to 300 characters.");
  const wordingSource = change.wordingSourceUrl ? String(change.wordingSourceUrl).trim() : null;
  if (wording !== undefined && (wording.length > 20_000 || !wordingSource || !/^https:\/\/\S{4,500}$/.test(wordingSource))) {
    throw new LegislationError(400, "Wording must come with the https:// link to the official text it was copied from (20,000 characters at most).");
  }
  const wordingStatus = wording === undefined ? null : change.wordingVerified === true ? "verified" : "unverified";
  const result = await db.prepare(`UPDATE legislation_sections SET verification_status = ?, verification_note = ?, official_source_url = COALESCE(?, official_source_url),
    heading = COALESCE(?, heading), wording = COALESCE(?, wording), wording_status = COALESCE(?, wording_status), wording_source_url = COALESCE(?, wording_source_url),
    verified_by = CASE WHEN CAST(? AS text) = 'verified' THEN CAST(? AS text) ELSE NULL END, verified_at = CASE WHEN CAST(? AS text) = 'verified' THEN CAST(? AS text) ELSE NULL END, updated_at = ?, updated_by = ? WHERE id = ?`)
    .bind(status, note, source, heading ?? null, wording ?? null, wordingStatus, wording === undefined ? null : wordingSource, status, actor, status, at, at, actor, sectionId).run();
  if (!result.meta.changes) throw new LegislationError(404, "That section is not in the database.");
  return { id: sectionId, status };
}

/** Headings added, removed or changed between two editions of a law. */
export async function compareEditions(db: Database, lawId: string, fromEdition: string, toEdition: string) {
  if (!LAW_ID.test(lawId) || !EDITION_ID.test(fromEdition) || !EDITION_ID.test(toEdition)) throw new LegislationError(400, "Give a law and two editions.");
  const load = async (edition: string) => {
    const { results } = await db.prepare(`SELECT s.section_number AS n, s.heading AS h FROM legislation_sections s JOIN legislation_law_versions v ON v.id = s.law_version_id
      WHERE v.law_id = ? AND v.edition_id = ? ORDER BY s.position`).bind(lawId, edition).all<Row>();
    return new Map(results.map((r) => [String(r.n), String(r.h)]));
  };
  const [a, b] = await Promise.all([load(fromEdition), load(toEdition)]);
  if (!a.size || !b.size) throw new LegislationError(404, "The law is not in both editions.");
  const added = [...b].filter(([n]) => !a.has(n)).map(([section, heading]) => ({ section, heading }));
  const removed = [...a].filter(([n]) => !b.has(n)).map(([section, heading]) => ({ section, heading }));
  const changed = [...b].filter(([n, h]) => a.has(n) && a.get(n) !== h).map(([section, heading]) => ({ section, from: a.get(section), to: heading }));
  return { lawId, fromEdition, toEdition, added, removed, changed, unchanged: [...b].filter(([n, h]) => a.get(n) === h).length };
}

export async function reviewList(db: Database, edition: Edition, { lawId, status, flagged }: { lawId?: string | null; status?: string | null; flagged?: boolean }, pg: Paging) {
  if (lawId && !LAW_ID.test(lawId)) throw new LegislationError(400, "Invalid law id.");
  if (status && !(STATUSES as readonly string[]).includes(status)) throw new LegislationError(400, "Unknown status.");
  const where = ["v.edition_id = ?", ...(lawId ? ["v.law_id = ?"] : []), ...(status ? ["s.verification_status = ?"] : []), ...(flagged ? ["s.flags_json <> '[]'"] : [])];
  const values = [edition.id, ...(lawId ? [lawId] : []), ...(status ? [status] : [])];
  const { results } = await db.prepare(`${SECTION_SELECT} WHERE ${where.join(" AND ")} ORDER BY v.law_id, s.position LIMIT ? OFFSET ?`).bind(...values, pg.pageSize, (pg.page - 1) * pg.pageSize).all<Row>();
  return results.map(toSection);
}

export async function historyFor(db: Database, entityId: string) {
  const { results } = await db.prepare(`SELECT entity_type AS "entityType", entity_id AS "entityId", action, from_status AS "fromStatus", to_status AS "toStatus", from_value AS "fromValue",
    to_value AS "toValue", actor, note, occurred_at AS "occurredAt" FROM legislation_history WHERE entity_id = ? ORDER BY occurred_at DESC, action LIMIT 100`).bind(entityId).all<Row>();
  return results;
}

// ------------------------------------------------------------------ AI retrieval
const QUESTION_STOP = new Set(["what", "which", "how", "where", "when", "who", "why", "is", "are", "a", "an", "the", "in", "of", "for", "to", "do", "does", "i", "my", "we", "our",
  "uganda", "ugandan", "tax", "taxes", "taxed", "law", "laws", "act", "section", "purposes", "purpose", "under", "about", "me", "can", "should", "explain", "tell", "please", "and", "or", "on", "be", "it"]);

/** Words that name a tax and so point to one law (removed from the search words). */
const LAW_HINTS: Array<[RegExp, string]> = [
  [/\b(?:vat|value added tax)\b/i, "vata"],
  [/\bexcise\b/i, "eda"],
  [/\bstamp duty\b/i, "sda"],
  [/\b(?:nssf|social security)\b/i, "nssf"],
  [/\b(?:gaming|betting|lotter(?:y|ies)|casino)\b/i, "lga"],
  [/\btax appeals? tribunals?\b/i, "tata"],
  [/\btax procedures? code\b/i, "tpca"],
];

export function lawHint(question: string): string | null {
  return LAW_HINTS.find(([pattern]) => pattern.test(question))?.[1] ?? null;
}

/** Search words from a question: subject words only, with plain-language phrasing mapped to statutory terms. */
export function subjectTerms(question: string): string {
  let text = question.toLowerCase();
  for (const [pattern] of LAW_HINTS) text = text.replace(new RegExp(pattern.source, "gi"), " ");
  const words = (text.match(/[a-z][a-z'-]+/g) ?? []).filter((w) => !QUESTION_STOP.has(w));
  // "Where are services supplied?" asks about the place of supply.
  if (/\bwhere\b/i.test(question) && words.some((w) => w.startsWith("suppl"))) words.push("place");
  return words.slice(0, 12).join(" ");
}

export interface RetrievedProvision extends SectionRecord {
  ref: string;
  relatedTo: string | null;
  relationBasis: "confirmed" | "inferred" | null;
}

export interface LegislationRetrieval {
  jurisdiction: "UG";
  edition: (Edition & { match: EditionChoice["match"]; warning: string | null }) | null;
  provisions: RetrievedProvision[];
  laterAmendments: Record<string, LaterAmendment[]>;
  gaps: Array<{ id: string; title: string; kind: string; note: string }>;
}

/**
 * Steps 2 to 6 of an answer: subject words, search, related provisions,
 * edition for the period, wording when held, gaps that apply.
 */
export async function retrieveLegislation(db: Database, question: string, { onDate, today, limit = 4 }: { onDate?: string | null; today: string; limit?: number }): Promise<LegislationRetrieval> {
  const editions = await loadEditions(db, "UG");
  const choice = chooseEdition(editions, { onDate, today });
  const gapsAll = await coverageGaps(db, "UG");
  const words = new Set(question.toLowerCase().match(/[a-z0-9/]+/g) ?? []);
  const gaps = gapsAll.filter((g) => g.kind === "wording_not_held" || g.keywords.split(" ").some((k) => k.length > 2 && words.has(k)) || /local service tax/i.test(question) && g.id === "ug-local-service-tax")
    .map(({ id, title, kind, note }) => ({ id, title, kind, note }));
  const empty: LegislationRetrieval = { jurisdiction: "UG", edition: null, provisions: [], laterAmendments: {}, gaps };
  if (!choice.edition) return empty;
  const edition = choice.edition;
  const explicit = question.match(/\b(?:section|s\.)\s*(\d{1,3}[A-Za-z]{0,2})\b/i);
  const terms = subjectTerms(question);
  let found: SectionRecord[] = [];
  if (explicit) {
    const titleWords = question.replace(explicit[0], " ");
    found = (await searchSections(db, edition, { q: `section ${explicit[1]} ${subjectTerms(titleWords)}`.trim() }, { page: 1, pageSize: 2 })).results;
  }
  const hint = lawHint(question);
  if (!found.length && terms.length >= 2) {
    // A named tax narrows the search to its law first, then to all laws.
    for (const lawId of hint ? [hint, null] : [null]) {
      const result = await searchSections(db, edition, { q: terms, lawId }, { page: 1, pageSize: limit * 2 });
      // With any-word matching keep only the strong hits.
      found = result.mode === "all-words" ? result.results : result.results.filter((s, _i, all) => (s.rank ?? 0) >= ((all[0]?.rank ?? 0) * 0.6));
      if (found.length) break;
    }
  }
  found = found.slice(0, limit);
  const provisions: RetrievedProvision[] = found.map((s, i) => ({ ...s, ref: `L${i + 1}`, relatedTo: null, relationBasis: null }));
  // Related provisions of the best match (confirmed first, then inferred).
  if (provisions[0]) {
    const relations = await relationsFor(db, provisions[0].lawId, provisions[0].id);
    for (const r of relations.slice(0, 3)) {
      const other = r.from.sectionId === provisions[0].id ? r.to : r.from;
      if (!other.sectionId || provisions.some((p) => p.id === other.sectionId)) continue;
      const row = await db.prepare(`${SECTION_SELECT} WHERE s.id = ?`).bind(other.sectionId).first<Row>();
      if (row) provisions.push({ ...toSection(row), ref: `L${provisions.length + 1}`, relatedTo: provisions[0].ref, relationBasis: r.basis });
    }
  }
  const amendments = await laterAmendments(db, edition);
  const lawStatute = new Map<string, string | null>();
  for (const p of provisions) {
    if (lawStatute.has(p.lawId)) continue;
    const row = await db.prepare(`SELECT COALESCE(statute_id, parent_law_id) AS s FROM legislation_laws WHERE id = ?`).bind(p.lawId).first<Row>();
    lawStatute.set(p.lawId, str(row?.s));
  }
  const later: Record<string, LaterAmendment[]> = {};
  for (const [lawId, statute] of lawStatute) if (statute && amendments.get(statute)?.length) later[lawId] = amendments.get(statute) as LaterAmendment[];
  return { jurisdiction: "UG", edition: { ...edition, match: choice.match, warning: choice.warning }, provisions, laterAmendments: later, gaps };
}

function provisionLine(p: RetrievedProvision): string {
  const relation = p.relatedTo ? ` (related to [${p.relatedTo}]; relationship ${p.relationBasis})` : "";
  const flags = p.flags.includes("numbering-check") ? " Numbering to be checked against the official edition." : "";
  const wording = p.wording && p.wordingStatus !== "none" ? ` Wording (${p.wordingStatus}): "${p.wording.slice(0, 1500)}"` : " No wording held.";
  return `[${p.ref}] ${p.citation} – ${p.heading}${p.part.number ? ` (Part ${p.part.number}${p.part.title ? ` – ${p.part.title}` : ""})` : ""}. Status: ${p.evidenceLabel}.${wording}${flags}${relation}`;
}

/** The evidence block given to the model, with the rules for using it. */
export function legislationEvidence(r: LegislationRetrieval): string {
  if (!r.edition) return "Uganda legislation database: no edition is available; do not cite Uganda legislation by section.";
  const lines = [`Uganda legislation retrieved from TaxComp's legislative database. Edition: ${r.edition.label} (law stated for ${r.edition.effectiveFrom} to ${r.edition.effectiveTo ?? "open"}).${r.edition.warning ? ` ${r.edition.warning}` : ""}`];
  if (r.provisions.length) lines.push(...r.provisions.map(provisionLine));
  else lines.push("No section matched this question in the database.");
  for (const [lawId, list] of Object.entries(r.laterAmendments)) lines.push(`Later amendments not captured for ${lawId}: ${list.map((a) => `${a.title} (${a.billStatus}${a.appliesFrom ? `, applies from ${a.appliesFrom}` : ""})`).join("; ")}.`);
  for (const g of r.gaps) lines.push(`Known gap: ${g.title}. ${g.note}`);
  lines.push("Rules for this legislation: cite Uganda legislation only as the [L#] entries above, and only those sections. A heading says what a section is about; it does not give its conditions, rates or effect, so do not state them from a heading. Never quote or paraphrase statutory wording unless an entry includes wording, and say whether that wording is verified. Say that the headings come from the stated edition, are unverified unless marked verified, and may have been changed by later amendments. Do not apply another country's legislation as Uganda law. If the user's facts matter, ask for them.");
  return lines.join("\n");
}

/** Plain-text summary used when no AI provider answers (and appended to local answers). */
export function legislationSummary(r: LegislationRetrieval): string {
  if (!r.edition || !r.provisions.length) {
    const gap = r.gaps.find((g) => g.kind !== "wording_not_held");
    return gap ? `TaxComp's legislative database does not contain this: ${gap.title}. ${gap.note}` : "";
  }
  const lines = ["Relevant provisions found in TaxComp's legislative database:"];
  for (const p of r.provisions) lines.push(`• ${p.citation} – ${p.heading}${p.relatedTo ? ` (related${p.relationBasis === "inferred" ? ", inferred from headings" : ""})` : ""}. ${p.evidenceLabel}.${p.flags.includes("numbering-check") ? " Section number to be checked against the official edition." : ""}`);
  const structureOnly = r.provisions.every((p) => p.wordingStatus === "none");
  lines.push(structureOnly
    ? "Only the section headings are held, not the wording, so TaxComp cannot state the conditions, rates or legal effect of these provisions. Read the official text before relying on them."
    : "Where wording is shown, check whether it is marked verified before relying on it.");
  lines.push(`The headings come from ${r.edition.label}.${r.edition.warning ? ` ${r.edition.warning}` : ""}`);
  const later = Object.values(r.laterAmendments).flat();
  if (later.length) lines.push(`Later amendments that may have changed these provisions: ${[...new Set(later.map((a) => a.title))].join("; ")}.`);
  lines.push("Applying a provision to your situation needs the facts of the transaction (the parties, where they are, what was supplied or paid, and the period) and the official wording.");
  return lines.join("\n");
}

/**
 * Checks section references in an answer against what was retrieved. [L#]
 * markers become citations; references to sections that were not retrieved
 * are reported (the caller appends a warning).
 */
export function checkCitations(answer: string, r: LegislationRetrieval): { answer: string; unmatched: string[] } {
  const byRef = new Map(r.provisions.map((p) => [p.ref, p]));
  let text = answer.replace(/\[L(\d+)\]/g, (_m, n: string) => {
    const p = byRef.get(`L${n}`);
    return p ? `(${p.citation})` : "";
  });
  const known = new Set(r.provisions.map((p) => p.sectionNumber.toUpperCase()));
  const unmatched = new Set<string>();
  for (const m of text.matchAll(/\b(?:sections?|s\.|ss\.|regulations?|reg\.)\s*(\d{1,3}[A-Za-z]{0,2})\b/gi)) {
    if (!known.has(String(m[1]).toUpperCase())) unmatched.add(String(m[1]).toUpperCase());
  }
  if (unmatched.size) text += `\n\nNote: TaxComp could not match ${[...unmatched].map((n) => `section ${n}`).join(", ")} to its legislative database for this answer. Treat ${unmatched.size === 1 ? "that reference" : "those references"} as unverified.`;
  return { answer: text, unmatched: [...unmatched] };
}

/** The legislation part of a chat response, for display. */
export function legislationForResponse(r: LegislationRetrieval, unmatched: string[] = []) {
  return {
    jurisdiction: r.jurisdiction,
    edition: r.edition ? { id: r.edition.id, label: r.edition.label, effectiveFrom: r.edition.effectiveFrom, effectiveTo: r.edition.effectiveTo, match: r.edition.match, warning: r.edition.warning } : null,
    provisions: r.provisions.map((p) => ({
      ref: p.ref, citation: p.citation, heading: p.heading, lawId: p.lawId, sectionNumber: p.sectionNumber, sectionId: p.id, part: p.part,
      verificationStatus: p.verificationStatus, verificationLabel: p.verificationLabel, evidenceLevel: p.evidenceLevel, evidenceLabel: p.evidenceLabel,
      wordingHeld: p.wordingStatus !== "none", flags: p.flags, relatedTo: p.relatedTo, relationBasis: p.relationBasis,
    })),
    laterAmendments: r.laterAmendments,
    gaps: r.gaps,
    citationCheck: { unmatched },
  };
}
