// Knowledge base (international and domestic tax knowledge records).
// Pure rules here; storage and routes live in api.mts.
//
// Every record says where it came from (source kind, organisation, reference,
// chapter or section), what period it applies to, and whether a reviewer has
// verified it. Users only ever see verified records. Records from copyright
// sources that TaxComp has no licence for (for example a textbook) may hold
// TaxComp's own original notes or metadata only, never the source's text.
import type { Database, Statement } from "./store.mts";

export const SOURCE_KINDS = [
  "legislation",
  "regulation",
  "case_law",
  "official_guidance",
  "treaty",
  "international_standard",
  "textbook",
  "ai_general",
] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

export const CONTENT_KINDS = ["original_note", "official_text", "licensed_excerpt", "metadata_only"] as const;
export type ContentKind = (typeof CONTENT_KINDS)[number];

/**
 * public_law: statutes and court decisions (no copyright bar on use).
 * official_publication: URA, OECD, UN and similar publications, used as references.
 * licensed: written permission from the copyright owner is on file (licence_note says where).
 * restricted_no_text: copyright material without a licence; original notes and metadata only.
 * original_work: TaxComp's own writing.
 */
export const LICENCES = ["public_law", "official_publication", "licensed", "restricted_no_text", "original_work"] as const;
export type Licence = (typeof LICENCES)[number];

export const STATUSES = ["draft", "verified", "rejected", "outdated"] as const;
export type Status = (typeof STATUSES)[number];

export const LAYERS = ["international", "domestic"] as const;
export type Layer = (typeof LAYERS)[number];

export const TAX_CATEGORIES = [
  // International
  "residence-source", "worldwide-income", "foreign-source-income", "nonresidents", "double-taxation-relief",
  "withholding", "permanent-establishment", "tax-treaties", "transfer-pricing", "anti-avoidance",
  "beps", "digital-economy",
  // Domestic
  "income-tax", "vat", "paye", "corporation-tax", "presumptive-tax", "capital-gains", "stamp-duty",
  "excise-duty", "customs", "tax-administration", "returns-filing", "registration-compliance",
  "penalties-interest", "objections-appeals",
] as const;
export type TaxCategory = (typeof TAX_CATEGORIES)[number];

/**
 * Default order of authority. 1 is strongest. A jurisdiction may override it
 * (see HIERARCHY_BY_COUNTRY), because the place of treaties, court decisions
 * and guidance differs between legal systems.
 */
export const DEFAULT_HIERARCHY: Readonly<Record<SourceKind, number>> = {
  legislation: 1,
  regulation: 2,
  case_law: 3,
  official_guidance: 4,
  treaty: 5,
  international_standard: 6,
  textbook: 7,
  ai_general: 8,
};

/**
 * Per-country overrides. Uganda uses the default for now; a legal approver
 * should confirm the treaty position (how an in-force treaty interacts with
 * the Income Tax Act) before this is changed. TODO_VERIFY.
 */
export const HIERARCHY_BY_COUNTRY: Readonly<Record<string, Partial<Record<SourceKind, number>>>> = {
  UG: {},
};

export function authorityRank(kind: SourceKind, country: string): number {
  const override = HIERARCHY_BY_COUNTRY[country]?.[kind];
  return override ?? DEFAULT_HIERARCHY[kind];
}

export interface KnowledgeRecord {
  id: string;
  title: string;
  layer: Layer;
  country: string; // ISO 3166 alpha-2, or "INTL" for principles not tied to one country
  taxCategory: TaxCategory;
  topic: string;
  sourceKind: SourceKind;
  sourceOrganisation: string;
  sourceReference: string;
  sourceUrl: string | null;
  chapterRef: string | null;
  statuteId: string | null;
  applicableFrom: string | null;
  applicableTo: string | null;
  effectiveDate: string | null;
  publicationDate: string | null;
  contentKind: ContentKind;
  licence: Licence;
  licenceNote: string;
  body: string;
  aiGenerated: boolean;
  status: Status;
  supersededBy: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNote: string;
}

export type RecordInput = Omit<KnowledgeRecord, "status" | "supersededBy" | "createdBy" | "createdAt" | "updatedAt" | "reviewedBy" | "reviewedAt" | "reviewNote">;

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const PAGE_REFERENCE = /\b(?:pp?\.\s*\d|pages?\s+\d)/i;
/** A run of 25 or more words inside quotation marks. */
const LONG_QUOTE = /["“]([^"”]{0,4000})["”]/g;
export const NOTE_MAX = 4000;
export const EXCERPT_MAX = 2000;

function quotedWordRuns(text: string): number[] {
  return [...text.matchAll(LONG_QUOTE)].map((m) => (m[1] ?? "").trim().split(/\s+/).filter(Boolean).length);
}

/**
 * Checks a record before it is stored. Returns the problems; empty means it may be saved (as a draft).
 * The copyright rules:
 *  - restricted_no_text sources: original notes or metadata only; no quotations of 25+ words; no page numbers
 *    (a page number can only come from the book itself, so it cannot be checked here and is not stored).
 *  - licensed_excerpt needs licence "licensed", a note recording the permission, and stays short.
 *  - AI-written notes never cite pages and never quote.
 */
export function validateRecord(input: RecordInput): string[] {
  const problems: string[] = [];
  if (!/^[a-z0-9][a-z0-9.-]{2,119}$/.test(input.id)) problems.push("The id must be 3-120 lowercase letters, digits, dots or hyphens.");
  if (!input.title || input.title.length > 300) problems.push("Give a title (up to 300 characters).");
  if (!(LAYERS as readonly string[]).includes(input.layer)) problems.push("Layer must be international or domestic.");
  if (!/^(?:[A-Z]{2}|INTL)$/.test(input.country)) problems.push("Country must be a two-letter code, or INTL.");
  if (input.layer === "domestic" && input.country === "INTL") problems.push("A domestic record needs a country.");
  if (!(TAX_CATEGORIES as readonly string[]).includes(input.taxCategory)) problems.push("Choose a known tax category.");
  if (!(SOURCE_KINDS as readonly string[]).includes(input.sourceKind)) problems.push("Choose a known source kind.");
  if (!(CONTENT_KINDS as readonly string[]).includes(input.contentKind)) problems.push("Choose a known content kind.");
  if (!(LICENCES as readonly string[]).includes(input.licence)) problems.push("Choose a known licence.");
  if (!input.sourceOrganisation) problems.push("Record the source organisation (who published it).");
  if (!input.sourceReference) problems.push("Record the source reference (Act and section, publication, or book and chapter).");
  if (input.sourceUrl !== null && !/^https:\/\/\S{4,500}$/.test(input.sourceUrl)) problems.push("The source link must be an https:// link.");
  for (const [label, value] of [["Applicable from", input.applicableFrom], ["Applicable to", input.applicableTo], ["Effective date", input.effectiveDate], ["Publication date", input.publicationDate]] as const) {
    if (value !== null && !ISO.test(value)) problems.push(`${label} must be YYYY-MM-DD.`);
  }
  if (input.applicableFrom && input.applicableTo && input.applicableFrom > input.applicableTo) problems.push("The applicable period ends before it starts.");

  const body = input.body ?? "";
  if (input.contentKind === "metadata_only" && body.trim()) problems.push("A metadata-only record has no body text.");
  if (input.contentKind !== "metadata_only" && !body.trim()) problems.push("Write the note (or choose metadata only).");
  if (body.length > NOTE_MAX) problems.push(`Keep the text under ${NOTE_MAX} characters.`);

  if (input.contentKind === "licensed_excerpt") {
    if (input.licence !== "licensed") problems.push("An excerpt from a copyright source needs the licence set to licensed.");
    if (!input.licenceNote.trim()) problems.push("Record where the written permission is kept (licence note).");
    if (body.length > EXCERPT_MAX) problems.push(`Licensed excerpts are limited to ${EXCERPT_MAX} characters.`);
  }
  if (input.contentKind === "official_text" && !["public_law", "official_publication"].includes(input.licence)) {
    problems.push("Official text must come from legislation, a court or an official publication.");
  }
  if (input.sourceKind === "textbook" && input.licence !== "licensed" && input.contentKind !== "original_note" && input.contentKind !== "metadata_only") {
    problems.push("Without a licence, a textbook can only be referenced by original notes or metadata.");
  }
  if (input.licence === "restricted_no_text" || input.aiGenerated) {
    if (quotedWordRuns(body).some((n) => n >= 25)) problems.push("Do not quote the source: write the note in your own words.");
    if (PAGE_REFERENCE.test(`${body} ${input.chapterRef ?? ""} ${input.sourceReference}`)) problems.push("Do not add page numbers here; refer to the chapter.");
  }
  if (input.licence === "restricted_no_text" && input.contentKind === "licensed_excerpt") problems.push("Restricted sources cannot hold excerpts.");
  return problems;
}

export interface RankQuery {
  q?: string;
  country?: string | null;
  category?: string | null;
  layer?: string | null;
  /** YYYY-MM-DD: a record whose applicable period excludes this date ranks lower and is marked. */
  onDate?: string | null;
}

export interface RankedRecord {
  record: KnowledgeRecord;
  authority: number;
  inPeriod: boolean;
  score: number;
}

const STOP = new Set(["the", "a", "an", "of", "to", "and", "or", "in", "on", "for", "is", "are", "my", "i", "me", "how", "what", "does", "do", "tax", "taxes"]);

function words(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((w) => w.length > 2 && !STOP.has(w)).map((w) => w.replace(/(?:ies)$/, "y").replace(/s$/, ""));
}

export function inPeriod(record: Pick<KnowledgeRecord, "applicableFrom" | "applicableTo">, onDate: string | null | undefined): boolean {
  if (!onDate) return true;
  if (record.applicableFrom && onDate < record.applicableFrom) return false;
  if (record.applicableTo && onDate > record.applicableTo) return false;
  return true;
}

/**
 * Orders records for an answer: verified current law first, then by the
 * jurisdiction's source hierarchy, then by how well they match the question.
 * Drafts and rejected records never reach users (the caller filters by role).
 */
export function rankRecords(records: KnowledgeRecord[], query: RankQuery, limit = 20): RankedRecord[] {
  const terms = new Set(words(query.q ?? ""));
  const out: RankedRecord[] = [];
  for (const record of records) {
    if (query.country && record.country !== query.country && record.country !== "INTL") continue;
    if (query.category && record.taxCategory !== query.category) continue;
    if (query.layer && record.layer !== query.layer) continue;
    const haystack = new Set(words(`${record.title} ${record.topic} ${record.body} ${record.taxCategory.replace(/-/g, " ")}`));
    const hits = [...terms].filter((t) => haystack.has(t)).length;
    if (terms.size && hits === 0) continue;
    const authority = authorityRank(record.sourceKind, query.country ?? record.country);
    const current = inPeriod(record, query.onDate) && record.status !== "outdated";
    const statusWeight = record.status === "verified" ? 0 : record.status === "draft" ? 1 : 2;
    // Lower is better on the first three keys; hits break ties.
    const score = (current ? 0 : 1000) + statusWeight * 100 + authority * 10 - Math.min(hits, 9);
    out.push({ record, authority, inPeriod: current, score });
  }
  return out.sort((a, b) => a.score - b.score || a.record.title.localeCompare(b.record.title)).slice(0, limit);
}

/** What a reviewer decision does to a record's status. */
export function decide(current: Status, decision: string): Status | null {
  if (decision === "verify" && (current === "draft" || current === "outdated")) return "verified";
  if (decision === "reject" && current === "draft") return "rejected";
  if (decision === "outdated" && current === "verified") return "outdated";
  if (decision === "reopen" && (current === "rejected" || current === "verified")) return "draft";
  return null;
}

// ------------------------------------------------------------------ storage

const SELECT = `SELECT id, title, layer, country, tax_category AS "taxCategory", topic, source_kind AS "sourceKind", source_organisation AS "sourceOrganisation",
  source_reference AS "sourceReference", source_url AS "sourceUrl", chapter_ref AS "chapterRef", statute_id AS "statuteId", applicable_from AS "applicableFrom",
  applicable_to AS "applicableTo", effective_date AS "effectiveDate", publication_date AS "publicationDate", content_kind AS "contentKind", licence,
  licence_note AS "licenceNote", body, ai_generated AS "aiGenerated", status, superseded_by AS "supersededBy", created_by AS "createdBy",
  created_at AS "createdAt", updated_at AS "updatedAt", reviewed_by AS "reviewedBy", reviewed_at AS "reviewedAt", review_note AS "reviewNote"
  FROM knowledge_records`;

type Row = Omit<KnowledgeRecord, "aiGenerated"> & { aiGenerated: number | boolean };

function toRecord(row: Row): KnowledgeRecord {
  return { ...row, aiGenerated: row.aiGenerated === true || Number(row.aiGenerated) === 1 };
}

/** Users see verified and outdated (marked) records; reviewers also see drafts and rejected ones. */
export async function loadKnowledge(db: Database, { staff = false } = {}): Promise<KnowledgeRecord[]> {
  const where = staff ? "" : ` WHERE status IN ('verified', 'outdated')`;
  const { results } = await db.prepare(`${SELECT}${where} ORDER BY id LIMIT 5000`).all<Row>();
  return results.map(toRecord);
}

export async function loadRecord(db: Database, id: string): Promise<KnowledgeRecord | null> {
  const row = await db.prepare(`${SELECT} WHERE id = ?`).bind(id).first<Row>();
  return row ? toRecord(row) : null;
}

export function recordEvent(db: Database, e: { recordId: string; at: string; actor: string | null; action: string; from: Status | null; to: Status; note?: string }): Statement {
  return db.prepare(`INSERT INTO knowledge_record_events (id, record_id, occurred_at, actor_user_id, action, from_status, to_status, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(crypto.randomUUID(), e.recordId, e.at, e.actor, e.action, e.from, e.to, e.note ?? "");
}

/**
 * Inserts or edits a record. Any edit sends it back to draft: a changed record
 * must be reviewed again before users see it.
 */
export function saveRecordStatements(db: Database, input: RecordInput, existing: KnowledgeRecord | null, actor: string, at: string): Statement[] {
  const values = [input.title, input.layer, input.country, input.taxCategory, input.topic, input.sourceKind, input.sourceOrganisation, input.sourceReference,
    input.sourceUrl, input.chapterRef, input.statuteId, input.applicableFrom, input.applicableTo, input.effectiveDate, input.publicationDate,
    input.contentKind, input.licence, input.licenceNote, input.body, input.aiGenerated ? 1 : 0];
  if (!existing) {
    return [
      db.prepare(`INSERT INTO knowledge_records (title, layer, country, tax_category, topic, source_kind, source_organisation, source_reference, source_url, chapter_ref,
        statute_id, applicable_from, applicable_to, effective_date, publication_date, content_kind, licence, licence_note, body, ai_generated, id, status, created_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?)`).bind(...values, input.id, actor, at, at),
      recordEvent(db, { recordId: input.id, at, actor, action: "created", from: null, to: "draft" }),
    ];
  }
  return [
    db.prepare(`UPDATE knowledge_records SET title = ?, layer = ?, country = ?, tax_category = ?, topic = ?, source_kind = ?, source_organisation = ?, source_reference = ?,
      source_url = ?, chapter_ref = ?, statute_id = ?, applicable_from = ?, applicable_to = ?, effective_date = ?, publication_date = ?, content_kind = ?, licence = ?,
      licence_note = ?, body = ?, ai_generated = ?, status = 'draft', reviewed_by = NULL, reviewed_at = NULL, review_note = '', updated_at = ? WHERE id = ?`).bind(...values, at, input.id),
    recordEvent(db, { recordId: input.id, at, actor, action: "edited", from: existing.status, to: "draft" }),
  ];
}

/** Reads and validates the fields of a record from a request body. */
export function parseRecordInput(body: Record<string, unknown>): { input: RecordInput; problems: string[] } {
  const text = (value: unknown, max: number): string => String(value ?? "").trim().slice(0, max);
  const optional = (value: unknown, max: number): string | null => {
    const t = text(value, max);
    return t ? t : null;
  };
  const input: RecordInput = {
    id: text(body.id, 120),
    title: text(body.title, 300),
    layer: text(body.layer, 20) as Layer,
    country: text(body.country, 4).toUpperCase(),
    taxCategory: text(body.taxCategory, 40) as TaxCategory,
    topic: text(body.topic, 300),
    sourceKind: text(body.sourceKind, 40) as SourceKind,
    sourceOrganisation: text(body.sourceOrganisation, 200),
    sourceReference: text(body.sourceReference, 500),
    sourceUrl: optional(body.sourceUrl, 600),
    chapterRef: optional(body.chapterRef, 200),
    statuteId: optional(body.statuteId, 80),
    applicableFrom: optional(body.applicableFrom, 10),
    applicableTo: optional(body.applicableTo, 10),
    effectiveDate: optional(body.effectiveDate, 10),
    publicationDate: optional(body.publicationDate, 10),
    contentKind: text(body.contentKind, 40) as ContentKind,
    licence: text(body.licence, 40) as Licence,
    licenceNote: text(body.licenceNote, 1000),
    body: String(body.body ?? "").trim().slice(0, NOTE_MAX + 1),
    aiGenerated: body.aiGenerated === true,
  };
  return { input, problems: validateRecord(input) };
}

/** The public view of a record: what an answer may cite. */
export function publicRecord(record: KnowledgeRecord, onDate?: string | null) {
  return {
    id: record.id, title: record.title, layer: record.layer, country: record.country, taxCategory: record.taxCategory, topic: record.topic,
    sourceKind: record.sourceKind, authority: authorityRank(record.sourceKind, record.country), sourceOrganisation: record.sourceOrganisation,
    sourceReference: record.sourceReference, sourceUrl: record.sourceUrl, chapterRef: record.chapterRef, statuteId: record.statuteId,
    applicableFrom: record.applicableFrom, applicableTo: record.applicableTo, effectiveDate: record.effectiveDate, publicationDate: record.publicationDate,
    contentKind: record.contentKind, body: record.body, aiGenerated: record.aiGenerated, status: record.status, supersededBy: record.supersededBy,
    lastReviewed: record.reviewedAt, current: record.status === "verified" && inPeriod(record, onDate),
  };
}
