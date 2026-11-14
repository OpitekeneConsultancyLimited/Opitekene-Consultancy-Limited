// Phase 2b: legal verification register, independent two-person review and
// emergency withdrawal (migration 20261114000100, docs/remediation/LEGAL_VERIFICATION_REGISTER.md).
//
// Workflow: a record starts as a draft (pending verification). A reviewer
// researches it and SUBMITS a verification request with its authoritative
// source. A DIFFERENT legal approver decides it. Only then is the record
// verified (the database trigger legal_require_two_person refuses any other
// path). Every approved state is a new version in legal_register; every action
// is in the hash-chained legal_audit_log.
//
// Emergency withdrawal is one legal approver's decision and takes effect at
// once on every read path (legislation API, AI retrieval, knowledge, deadlines,
// calculators). Reinstating needs an approved two-person request, and the
// record then returns to "pending verification", never straight to verified.
//
// Nothing here decides what the law is. It records who checked what, against
// which source, and stops unchecked material being presented as verified law.
import type { Database, Statement } from "./store.mts";
import { recordEvent } from "./knowledge.mts";

export const ENTITY_TYPES = ["law_version", "section", "schedule", "amendment", "knowledge", "holiday", "rule_set", "provision", "case_law", "calculator_rules"] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];
export const ENTITY_LABEL: Readonly<Record<EntityType, string>> = {
  law_version: "Act or regulations (edition)", section: "Section or regulation", schedule: "Schedule", amendment: "2026 amendment record",
  knowledge: "Knowledge record", holiday: "Public holiday", rule_set: "Deadline rules", provision: "Provision used in computation",
  case_law: "Tax Appeals Tribunal decision", calculator_rules: "Calculator rule set",
};
const LEGISLATION_TYPES: ReadonlySet<EntityType> = new Set(["law_version", "section", "schedule", "amendment"]);

export const LEGAL_CATEGORIES = ["act", "statutory_instrument", "gazette_notice", "commencement_instrument", "judgment", "ura_guidance", "bill", "budget_speech", "commentary", "press_report"] as const;
export type LegalCategory = (typeof LEGAL_CATEGORIES)[number];
export const CATEGORY_LABEL: Readonly<Record<LegalCategory, string>> = {
  act: "Act of Parliament", statutory_instrument: "Statutory instrument", gazette_notice: "Uganda Gazette notice", commencement_instrument: "Commencement instrument",
  judgment: "Judicial or tribunal decision", ura_guidance: "URA publication (administrative guidance)", bill: "Bill (proposed law)", budget_speech: "Budget speech",
  commentary: "Professional commentary", press_report: "Press report",
};
/** Primary legal materials: the only sources that can make a record verified law. */
export const PRIMARY_LAW: ReadonlySet<LegalCategory> = new Set(["act", "statutory_instrument", "gazette_notice", "commencement_instrument", "judgment"]);
/** Never evidence of enacted law. */
export const NOT_ENACTED: ReadonlySet<LegalCategory> = new Set(["bill", "budget_speech", "press_report"]);

export const CONTENT_CLASSES = ["verified_law", "pending_verification", "disputed", "superseded", "withdrawn", "professional_commentary", "proposed_legislation", "administrative_guidance"] as const;
export type ContentClass = (typeof CONTENT_CLASSES)[number];
export const CLASS_LABEL: Readonly<Record<ContentClass, string>> = {
  verified_law: "Verified law", pending_verification: "Pending verification", disputed: "Disputed legal position", superseded: "Superseded law",
  withdrawn: "Withdrawn", professional_commentary: "Professional commentary", proposed_legislation: "Proposed legislation",
  administrative_guidance: "Administrative guidance (URA)",
};

/** Calculator rule sets in tax-rules.js that can be withdrawn (a "#head" suffix withdraws one calculator only). */
export const CALCULATOR_RULE_SETS = ["UG-FY2026-27-v1", "UG-FY2025-26-individual-v1"] as const;
export const CALCULATOR_HEADS = ["individual", "paye", "company", "vat", "rental", "withholding", "presumptive", "customs"] as const;

export class RegisterError extends Error {
  readonly status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

type Row = Record<string, unknown>;
const str = (v: unknown): string | null => (v === null || v === undefined || v === "" ? null : String(v));
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const HTTPS = /^https:\/\/\S{4,500}$/;
// Ids are matched exactly against the database; a holiday id is "YYYY-MM-DD|Name" (names may hold any printable text).
const ENTITY_ID = /^[^\s<>"`\\\u0000-\u001f][^<>"`\\\u0000-\u001f]{0,199}$/u;

// ------------------------------------------------------------------ classes (pure)
/**
 * The legal class of a record as users must see it. Withdrawn beats disputed
 * beats superseded beats verified. Verified knowledge is commentary or
 * guidance, never "verified law"; a Bill is proposed legislation.
 */
export function contentClassFor(type: EntityType, s: { verified: boolean; superseded?: boolean; withdrawn?: boolean; disputed?: boolean; proposed?: boolean; category?: string | null }): ContentClass {
  if (s.withdrawn) return "withdrawn";
  if (s.disputed) return "disputed";
  if (s.superseded) return "superseded";
  if (s.verified) {
    if (s.category === "ura_guidance") return "administrative_guidance";
    if (type === "knowledge" || s.category === "commentary") return "professional_commentary";
    return "verified_law";
  }
  if (s.proposed) return "proposed_legislation";
  return "pending_verification";
}

/** Class of a legislation record (law version, section, schedule, amendment) from its own columns. */
export function legislationClass(status: string, flags: { withdrawn?: unknown; disputed?: unknown; billOnly?: boolean; figuresDiffer?: boolean } = {}): ContentClass {
  const on = (v: unknown) => v === true || v === 1 || v === "1" || v === "t";
  return contentClassFor("section", {
    verified: status === "verified", superseded: status === "superseded", withdrawn: on(flags.withdrawn),
    disputed: on(flags.disputed) || (status !== "verified" && Boolean(flags.figuresDiffer)), proposed: Boolean(flags.billOnly),
  });
}

// ------------------------------------------------------------------ records
interface Entity {
  type: EntityType;
  id: string;
  title: string;
  provision: string | null;
  defaultCategory: LegalCategory;
  verified: boolean;
  superseded: boolean;
  withdrawn: boolean;
  disputed: boolean;
  /** People who wrote or entered the content: they may not approve it. */
  authors: string[];
  sourceUrl: string | null;
  extra: Row;
}

const flag = (v: unknown) => v === 1 || v === "1" || v === true;

function checkEntityId(type: string, id: string): asserts type is EntityType {
  if (!(ENTITY_TYPES as readonly string[]).includes(type)) throw new RegisterError(400, `Record type must be one of: ${ENTITY_TYPES.join(", ")}.`);
  if (!ENTITY_ID.test(id)) throw new RegisterError(400, "Invalid record id.");
}

export async function loadEntity(db: Database, type: EntityType, id: string): Promise<Entity | null> {
  const base = (row: Row, rest: Partial<Entity> & Pick<Entity, "title" | "defaultCategory" | "verified">): Entity => ({
    type, id, provision: null, superseded: false, withdrawn: flag(row.withdrawn), disputed: flag(row.disputed), authors: [], sourceUrl: null, extra: row, ...rest,
  });
  if (type === "law_version") {
    const r = await db.prepare(`SELECT v.id, v.official_title AS title, v.chapter, l.category, v.verification_status AS status, v.official_source_url AS "sourceUrl", v.withdrawn, v.disputed
      FROM legislation_law_versions v JOIN legislation_laws l ON l.id = v.law_id WHERE v.id = ?`).bind(id).first<Row>();
    return r ? base(r, { title: `${r.title}${r.chapter ? ` (${r.chapter})` : ""}`, defaultCategory: r.category === "act" ? "act" : "statutory_instrument", verified: r.status === "verified", superseded: r.status === "superseded", sourceUrl: str(r.sourceUrl) }) : null;
  }
  if (type === "section" || type === "schedule") {
    const r = type === "section"
      ? await db.prepare(`SELECT s.id, v.official_title AS title, v.chapter, l.category, s.section_number AS num, s.heading, s.verification_status AS status, s.official_source_url AS "sourceUrl", s.withdrawn, s.disputed, s.law_version_id AS "lawVersionId"
          FROM legislation_sections s JOIN legislation_law_versions v ON v.id = s.law_version_id JOIN legislation_laws l ON l.id = v.law_id WHERE s.id = ?`).bind(id).first<Row>()
      : await db.prepare(`SELECT s.id, v.official_title AS title, v.chapter, l.category, s.label AS num, s.title AS heading, s.verification_status AS status, s.official_source_url AS "sourceUrl", s.withdrawn, s.disputed, s.law_version_id AS "lawVersionId"
          FROM legislation_schedules s JOIN legislation_law_versions v ON v.id = s.law_version_id JOIN legislation_laws l ON l.id = v.law_id WHERE s.id = ?`).bind(id).first<Row>();
    if (!r) return null;
    const provision = type === "section" ? `${r.category === "act" ? "s." : "reg. "}${r.num} ${r.heading}` : `${r.num}${r.heading ? ` ${r.heading}` : ""}`;
    return base(r, { title: `${r.title}${r.chapter ? ` (${r.chapter})` : ""}`, provision, defaultCategory: r.category === "act" ? "act" : "statutory_instrument", verified: r.status === "verified", superseded: r.status === "superseded", sourceUrl: str(r.sourceUrl) });
  }
  if (type === "amendment") {
    const r = await db.prepare(`SELECT a.id, a.principal_act AS "principalAct", a.provision, a.verification_status AS status, a.official_source_url AS "sourceUrl", a.evidence, a.figures_differ AS "figuresDiffer", a.withdrawn, a.disputed, s.title AS "amendingTitle"
      FROM legislation_amendments a JOIN law_statutes s ON s.id = a.amending_statute_id WHERE a.id = ?`).bind(id).first<Row>();
    return r ? base(r, { title: String(r.amendingTitle), provision: `${r.principalAct}, ${r.provision}`, defaultCategory: "act", verified: r.status === "verified", superseded: r.status === "superseded", sourceUrl: str(r.sourceUrl) }) : null;
  }
  if (type === "knowledge") {
    const r = await db.prepare(`SELECT id, title, status, source_kind AS "sourceKind", source_url AS "sourceUrl", created_by AS "createdBy", withdrawn, disputed FROM knowledge_records WHERE id = ?`).bind(id).first<Row>();
    if (!r) return null;
    const editors = await db.prepare(`SELECT DISTINCT actor_user_id AS actor FROM knowledge_record_events WHERE record_id = ? AND action IN ('created', 'edited') AND actor_user_id IS NOT NULL`).bind(id).all<Row>();
    const kind = String(r.sourceKind);
    const category: LegalCategory = kind === "legislation" ? "act" : kind === "regulation" ? "statutory_instrument" : kind === "case_law" ? "judgment" : kind === "official_guidance" ? "ura_guidance" : "commentary";
    return base(r, { title: String(r.title), defaultCategory: category, verified: r.status === "verified", superseded: r.status === "outdated", sourceUrl: str(r.sourceUrl),
      authors: [...new Set([str(r.createdBy), ...editors.results.map((e) => str(e.actor))].filter((a): a is string => Boolean(a) && a !== "seed"))] });
  }
  if (type === "holiday") {
    const [date, ...nameParts] = id.split("|");
    const name = nameParts.join("|");
    if (!date || !ISO.test(date) || !name) throw new RegisterError(400, "A holiday id is YYYY-MM-DD|Name.");
    const r = await db.prepare(`SELECT holiday_date AS date, name, verified_by AS "verifiedBy", added_by AS "addedBy", source_url AS "sourceUrl", withdrawn, disputed FROM public_holidays WHERE holiday_date = ? AND name = ?`).bind(date, name).first<Row>();
    return r ? base(r, { title: `${r.name} (${r.date})`, defaultCategory: "gazette_notice", verified: r.verifiedBy !== null, sourceUrl: str(r.sourceUrl), authors: r.addedBy && r.addedBy !== "seed" ? [String(r.addedBy)] : [] }) : null;
  }
  if (type === "rule_set") {
    const r = await db.prepare(`SELECT version, title, approved_for_computation AS approved, withdrawn, disputed FROM procedure_rule_sets WHERE version = ?`).bind(id).first<Row>();
    return r ? base(r, { title: String(r.title), defaultCategory: "act", verified: flag(r.approved) }) : null;
  }
  if (type === "provision") {
    const r = await db.prepare(`SELECT id, heading, section, statute_id AS "statuteId", approved_for_computation AS approved, text_verified_by AS "textVerifiedBy", bill_status AS "billStatus", source_url AS "sourceUrl", withdrawn, disputed
      FROM law_provision_versions WHERE id = ?`).bind(id).first<Row>();
    return r ? base(r, { title: String(r.heading), provision: `s. ${r.section}`, defaultCategory: "act", verified: flag(r.approved), sourceUrl: str(r.sourceUrl), authors: r.textVerifiedBy ? [String(r.textVerifiedBy)] : [] }) : null;
  }
  if (type === "case_law") {
    const r = await db.prepare(`SELECT id, citation, summary_status AS "summaryStatus", appeal_status AS "appealStatus", source_url AS "sourceUrl", withdrawn, disputed FROM tax_case_law WHERE id = ?`).bind(id).first<Row>();
    return r ? base(r, { title: String(r.citation), defaultCategory: "judgment", verified: r.summaryStatus === "approved" || r.appealStatus !== "unverified", sourceUrl: str(r.sourceUrl) }) : null;
  }
  // calculator_rules: no table; the id names a rule set in tax-rules.js.
  const [setId, head] = id.split("#");
  if (!(CALCULATOR_RULE_SETS as readonly string[]).includes(setId ?? "") || (head !== undefined && !(CALCULATOR_HEADS as readonly string[]).includes(head))) return null;
  const active = await activeWithdrawal(db, "calculator_rules", id);
  return { type, id, title: `Calculator rule set ${setId}${head ? ` (${head})` : ""}`, provision: null, defaultCategory: "act", verified: false, superseded: false, withdrawn: Boolean(active), disputed: false, authors: [], sourceUrl: null, extra: {} };
}

// ------------------------------------------------------------------ requests
export interface RequestInput {
  entityType: string;
  entityId: string;
  action: string;
  change?: Record<string, unknown>;
  instrumentTitle?: unknown; instrumentNumber?: unknown; legalCategory?: unknown; provision?: unknown;
  publicationDate?: unknown; assentDate?: unknown; gazetteDate?: unknown; commencementDate?: unknown;
  effectiveFrom?: unknown; effectiveTo?: unknown; applicableTaxYear?: unknown;
  sourceUrl?: unknown; documentReference?: unknown; evidenceNote?: unknown;
}

const opt = (v: unknown, max: number): string | null => {
  if (v === undefined || v === null || v === "") return null;
  const s = String(v).trim();
  if (s.length > max) throw new RegisterError(400, `A value is longer than ${max} characters.`);
  return s || null;
};
const date = (v: unknown, label: string): string | null => {
  const s = opt(v, 10);
  if (s && !ISO.test(s)) throw new RegisterError(400, `${label} must be YYYY-MM-DD.`);
  return s;
};

export function auditStatement(db: Database, e: { actor: string; action: string; at: string; entityType?: string | null; entityId?: string | null; requestId?: string | null; details?: Row }): Statement {
  return db.prepare(`INSERT INTO legal_audit_log (id, occurred_at, actor_user_id, action, entity_type, entity_id, request_id, details_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(crypto.randomUUID(), e.at, e.actor, e.action, e.entityType ?? null, e.entityId ?? null, e.requestId ?? null, JSON.stringify(e.details ?? {}));
}

/** Any reviewer may prepare a request. Returns the stored request. */
export async function submitRequest(db: Database, input: RequestInput, actor: string, at: string) {
  const type = String(input.entityType ?? "");
  const id = String(input.entityId ?? "");
  checkEntityId(type, id);
  const action = String(input.action ?? "");
  if (!["verify", "supersede", "reinstate"].includes(action)) throw new RegisterError(400, "Action must be verify, supersede or reinstate.");
  const entity = await loadEntity(db, type, id);
  if (!entity) throw new RegisterError(404, `That ${ENTITY_LABEL[type].toLowerCase()} is not in the database.`);

  const category = String(input.legalCategory ?? entity.defaultCategory) as LegalCategory;
  if (!(LEGAL_CATEGORIES as readonly string[]).includes(category)) throw new RegisterError(400, `Source type must be one of: ${LEGAL_CATEGORIES.join(", ")}.`);
  if (action === "verify") {
    if (entity.withdrawn) throw new RegisterError(409, "This record is withdrawn. Ask for it to be reinstated first; it then needs a fresh verification.");
    if (entity.verified) throw new RegisterError(409, "This record is already verified.");
    if (type === "calculator_rules") throw new RegisterError(400, "Calculator rule sets are verified through the tax calculation assurance programme (Phase 4), not here. They can be withdrawn and reinstated here.");
    if (NOT_ENACTED.has(category)) throw new RegisterError(400, `A ${CATEGORY_LABEL[category].toLowerCase()} is not enacted law and cannot verify a legal record. Record it as proposed legislation or commentary instead.`);
    if (type === "case_law" && category !== "judgment") throw new RegisterError(400, "A tribunal decision is verified against the decision itself (source type: judicial or tribunal decision).");
    if (type !== "case_law" && type !== "knowledge" && (!PRIMARY_LAW.has(category) || category === "judgment")) {
      throw new RegisterError(400, "Legislation, holidays and deadline rules are verified only against an Act, statutory instrument, Gazette notice or commencement instrument.");
    }
  }
  if (action === "supersede") {
    if (!LEGISLATION_TYPES.has(type) && type !== "knowledge") throw new RegisterError(400, "Only legislation and knowledge records can be marked superseded.");
    if (entity.withdrawn) throw new RegisterError(409, "This record is withdrawn. Reinstate it before marking it superseded.");
    if (entity.superseded) throw new RegisterError(409, "This record is already superseded.");
  }
  if (action === "reinstate" && !entity.withdrawn) throw new RegisterError(409, "Only a withdrawn record can be reinstated.");

  const sourceUrl = opt(input.sourceUrl, 500);
  if (sourceUrl && !HTTPS.test(sourceUrl)) throw new RegisterError(400, "The source must be an https:// link.");
  const documentReference = opt(input.documentReference, 300);
  if (!sourceUrl && !documentReference) throw new RegisterError(400, "Give the authoritative source: an https:// link, or a document reference (for example Uganda Gazette Vol. CXIX No. 33, 27 March 2026).");
  if (action === "verify" && (LEGISLATION_TYPES.has(type) || type === "holiday") && !sourceUrl) throw new RegisterError(400, "Verifying legislation or a holiday needs the https:// link to the official text or Gazette notice.");
  const evidenceNote = opt(input.evidenceNote, 4000);
  if (!evidenceNote || evidenceNote.length < 10) throw new RegisterError(400, "Say what you checked and against what (at least 10 characters).");
  const effectiveFrom = date(input.effectiveFrom, "Effective from");
  const effectiveTo = date(input.effectiveTo, "Effective to");
  if (effectiveFrom && effectiveTo && effectiveFrom > effectiveTo) throw new RegisterError(400, "The effective period ends before it starts.");
  const taxYear = opt(input.applicableTaxYear, 7);
  if (taxYear && !/^\d{4}\/\d{2}$/.test(taxYear)) throw new RegisterError(400, "Tax year must look like 2026/27.");
  const change = input.change && typeof input.change === "object" && !Array.isArray(input.change) ? input.change : {};
  if (type === "case_law" && action === "verify" && change.approveSummary !== true && !change.appealStatus) throw new RegisterError(400, "Say what is being verified: the summary, the appeal status, or both.");

  const requestId = crypto.randomUUID();
  const values = {
    instrumentTitle: opt(input.instrumentTitle, 300) ?? entity.title, instrumentNumber: opt(input.instrumentNumber, 120), provision: opt(input.provision, 200) ?? entity.provision,
    publicationDate: date(input.publicationDate, "Publication date"), assentDate: date(input.assentDate, "Assent date"), gazetteDate: date(input.gazetteDate, "Gazette date"),
    commencementDate: date(input.commencementDate, "Commencement date"),
  };
  try {
    await db.batch([
      db.prepare(`INSERT INTO legal_verification_requests (id, entity_type, entity_id, action, change_json, jurisdiction, instrument_title, instrument_number, legal_category, provision,
          publication_date, assent_date, gazette_date, commencement_date, effective_from, effective_to, applicable_tax_year, source_url, document_reference, evidence_note, prepared_by, prepared_at)
        VALUES (?, ?, ?, ?, ?, 'UG', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(requestId, type, id, action, JSON.stringify(change), values.instrumentTitle, values.instrumentNumber, category, values.provision,
          values.publicationDate, values.assentDate, values.gazetteDate, values.commencementDate, effectiveFrom, effectiveTo, taxYear, sourceUrl, documentReference, evidenceNote, actor, at),
      auditStatement(db, { actor, action: "request.submit", at, entityType: type, entityId: id, requestId, details: { action, legalCategory: category, sourceUrl, documentReference } }),
    ]);
  } catch (error) {
    if (/legal_requests_one_pending|UNIQUE constraint/i.test(error instanceof Error ? error.message : "")) throw new RegisterError(409, "A request for this record is already waiting for a decision.");
    throw error;
  }
  return getRequest(db, requestId);
}

const REQUEST_SELECT = `SELECT id, entity_type AS "entityType", entity_id AS "entityId", action, change_json AS "changeJson", jurisdiction, instrument_title AS "instrumentTitle",
  instrument_number AS "instrumentNumber", legal_category AS "legalCategory", provision, publication_date AS "publicationDate", assent_date AS "assentDate", gazette_date AS "gazetteDate",
  commencement_date AS "commencementDate", effective_from AS "effectiveFrom", effective_to AS "effectiveTo", applicable_tax_year AS "applicableTaxYear", source_url AS "sourceUrl",
  document_reference AS "documentReference", evidence_note AS "evidenceNote", prepared_by AS "preparedBy", prepared_at AS "preparedAt", status, decided_by AS "decidedBy",
  decided_at AS "decidedAt", decision_note AS "decisionNote" FROM legal_verification_requests`;

function toRequest(r: Row) {
  let change: Row = {};
  try { change = JSON.parse(String(r.changeJson ?? "{}")) as Row; } catch { change = {}; }
  return { ...r, change, changeJson: undefined, categoryLabel: CATEGORY_LABEL[String(r.legalCategory) as LegalCategory] ?? String(r.legalCategory), entityLabel: ENTITY_LABEL[String(r.entityType) as EntityType] } as unknown as Row & {
    id: string; entityType: EntityType; entityId: string; action: "verify" | "supersede" | "reinstate"; legalCategory: LegalCategory; preparedBy: string; status: string; sourceUrl: string | null;
    documentReference: string | null; evidenceNote: string; change: Row;
  };
}
export type VerificationRequest = ReturnType<typeof toRequest>;

export async function getRequest(db: Database, id: string): Promise<VerificationRequest> {
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new RegisterError(400, "Invalid request id.");
  const r = await db.prepare(`${REQUEST_SELECT} WHERE id = ?`).bind(id).first<Row>();
  if (!r) throw new RegisterError(404, "Request not found.");
  return toRequest(r);
}

function registerVersion(db: Database, r: VerificationRequest, contentClass: ContentClass, by: { prepared: string | null; approved: string | null; recorder: string; at: string; note: string }): Statement[] {
  return [
    db.prepare(`UPDATE legal_register SET superseded_at = ? WHERE entity_type = ? AND entity_id = ? AND superseded_at IS NULL`).bind(by.at, r.entityType, r.entityId),
    db.prepare(`INSERT INTO legal_register (id, entity_type, entity_id, version, content_class, jurisdiction, instrument_title, instrument_number, legal_category, provision,
        publication_date, assent_date, gazette_date, commencement_date, effective_from, effective_to, applicable_tax_year, source_url, document_reference, request_id,
        prepared_by, approved_by, recorded_by, recorded_at, note)
      VALUES (?, ?, ?, (SELECT coalesce(max(version), 0) + 1 FROM legal_register WHERE entity_type = ? AND entity_id = ?), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(crypto.randomUUID(), r.entityType, r.entityId, r.entityType, r.entityId, contentClass, String(r.jurisdiction ?? "UG"), str(r.instrumentTitle), str(r.instrumentNumber), r.legalCategory, str(r.provision),
        str(r.publicationDate), str(r.assentDate), str(r.gazetteDate), str(r.commencementDate), str(r.effectiveFrom), str(r.effectiveTo), str(r.applicableTaxYear), r.sourceUrl, r.documentReference, r.id,
        by.prepared, by.approved, by.recorder, by.at, by.note),
  ];
}

/** A register version without a request (dispute, withdrawal): who recorded it and why. */
function plainVersion(db: Database, type: EntityType, id: string, contentClass: ContentClass, actor: string, at: string, note: string, title: string): Statement[] {
  return [
    db.prepare(`UPDATE legal_register SET superseded_at = ? WHERE entity_type = ? AND entity_id = ? AND superseded_at IS NULL`).bind(at, type, id),
    db.prepare(`INSERT INTO legal_register (id, entity_type, entity_id, version, content_class, instrument_title, recorded_by, recorded_at, note)
      VALUES (?, ?, ?, (SELECT coalesce(max(version), 0) + 1 FROM legal_register WHERE entity_type = ? AND entity_id = ?), ?, ?, ?, ?, ?)`)
      .bind(crypto.randomUUID(), type, id, type, id, contentClass, title, actor, at, note.slice(0, 2000)),
  ];
}

const text = (v: unknown, max = 2000) => (v === undefined || v === null || v === "" ? null : String(v).trim().slice(0, max));

/** The record changes an approved request makes, with the approver as the verifier. */
function applyStatements(db: Database, r: VerificationRequest, approver: string, at: string, entity: Entity): Statement[] {
  const c = r.change;
  const knowledgeFrom = (str(entity.extra.status) ?? "draft") as "draft";
  const note = text(c.note) ?? r.evidenceNote;
  const source = text(c.officialSourceUrl, 500) ?? r.sourceUrl;
  const [hDate, ...hName] = r.entityId.split("|");
  if (r.action === "verify") {
    switch (r.entityType) {
      case "law_version":
        return [db.prepare(`UPDATE legislation_law_versions SET verification_status = 'verified', verification_note = ?, official_source_url = ?, chapter = COALESCE(?, chapter),
            commencement_date = COALESCE(?, commencement_date), verified_by = ?, verified_at = ?, disputed = 0, updated_at = ?, updated_by = ? WHERE id = ?`)
          .bind(note, source, text(c.chapter, 20), text(c.commencementDate, 10) ?? str(r.commencementDate), approver, at, at, approver, r.entityId)];
      case "section": {
        const wording = text(c.wording, 20_000);
        return [db.prepare(`UPDATE legislation_sections SET verification_status = 'verified', verification_note = ?, official_source_url = ?, heading = COALESCE(?, heading),
            wording = COALESCE(?, wording), wording_status = COALESCE(?, wording_status), wording_source_url = COALESCE(?, wording_source_url),
            verified_by = ?, verified_at = ?, disputed = 0, updated_at = ?, updated_by = ? WHERE id = ?`)
          .bind(note, source, text(c.heading, 300), wording, wording ? (c.wordingVerified === true ? "verified" : "unverified") : null, wording ? text(c.wordingSourceUrl, 500) : null,
            approver, at, at, approver, r.entityId)];
      }
      case "schedule":
        return [db.prepare(`UPDATE legislation_schedules SET verification_status = 'verified', verification_note = ?, official_source_url = ?, verified_by = ?, verified_at = ?, disputed = 0, updated_at = ?, updated_by = ? WHERE id = ?`)
          .bind(note, source, approver, at, at, approver, r.entityId)];
      case "amendment":
        return [db.prepare(`UPDATE legislation_amendments SET verification_status = 'verified', verification_note = ?, official_source_url = ?, verified_by = ?, verified_at = ?, disputed = 0, updated_at = ?, updated_by = ? WHERE id = ?`)
          .bind(note, source, approver, at, at, approver, r.entityId)];
      case "knowledge":
        return [
          db.prepare(`UPDATE knowledge_records SET status = 'verified', reviewed_by = ?, reviewed_at = ?, review_note = ?, disputed = 0, updated_at = ? WHERE id = ?`).bind(approver, at, note, at, r.entityId),
          recordEvent(db, { recordId: r.entityId, at, actor: approver, action: "verified", from: knowledgeFrom, to: "verified", note: `Two-person review: prepared by another reviewer (request ${r.id.slice(0, 8)}).` }),
        ];
      case "holiday":
        return [db.prepare(`UPDATE public_holidays SET verified_by = ?, verified_at = ?, source_url = ?, disputed = 0 WHERE holiday_date = ? AND name = ?`).bind(approver, at, source, hDate, hName.join("|"))];
      case "rule_set":
        return [db.prepare(`UPDATE procedure_rule_sets SET approved_for_computation = 1, approved_by = ?, approved_at = ?, disputed = 0 WHERE version = ?`).bind(approver, at, r.entityId)];
      case "provision":
        return [db.prepare(`UPDATE law_provision_versions SET approved_for_computation = 1, approved_by = ?, approved_at = ?, computation_json = COALESCE(?, computation_json), disputed = 0, updated_at = ? WHERE id = ?`)
          .bind(approver, at, c.computation && typeof c.computation === "object" ? JSON.stringify(c.computation) : null, at, r.entityId)];
      case "case_law":
        return [db.prepare(`UPDATE tax_case_law SET summary_status = CASE WHEN CAST(? AS integer) = 1 AND summary_status = 'draft' THEN 'approved' ELSE summary_status END,
            appeal_status = COALESCE(?, appeal_status), verified_by = ?, verified_at = ?, disputed = 0 WHERE id = ?`)
          .bind(c.approveSummary === true ? 1 : 0, text(c.appealStatus, 20), approver, at, r.entityId)];
      default:
        throw new RegisterError(400, "This record type cannot be verified here.");
    }
  }
  if (r.action === "supersede") {
    if (r.entityType === "knowledge") {
      return [
        db.prepare(`UPDATE knowledge_records SET status = 'outdated', reviewed_by = ?, reviewed_at = ?, review_note = ?, superseded_by = COALESCE(?, superseded_by), updated_at = ? WHERE id = ?`)
          .bind(approver, at, note, text(c.supersededBy, 120), at, r.entityId),
        recordEvent(db, { recordId: r.entityId, at, actor: approver, action: "outdated", from: knowledgeFrom, to: "outdated", note }),
      ];
    }
    const table = { law_version: "legislation_law_versions", section: "legislation_sections", schedule: "legislation_schedules", amendment: "legislation_amendments" }[r.entityType as "section"];
    return [db.prepare(`UPDATE ${table} SET verification_status = 'superseded', verification_note = ?, official_source_url = COALESCE(?, official_source_url), updated_at = ?, updated_by = ? WHERE id = ?`)
      .bind(note, source, at, approver, r.entityId)];
  }
  // reinstate: lift the withdrawal; the record stays unverified until verified again.
  return [
    ...(r.entityType === "calculator_rules" ? [] : [flagStatement(db, r.entityType, r.entityId, "withdrawn", 0)]),
    db.prepare(`UPDATE legal_withdrawals SET lifted_by = ?, lifted_at = ?, lift_request_id = ? WHERE entity_type = ? AND entity_id = ? AND lifted_at IS NULL`).bind(approver, at, r.id, r.entityType, r.entityId),
  ];
}

const TABLE_FOR: Record<Exclude<EntityType, "calculator_rules">, { table: string; where: string }> = {
  law_version: { table: "legislation_law_versions", where: "id = ?" }, section: { table: "legislation_sections", where: "id = ?" },
  schedule: { table: "legislation_schedules", where: "id = ?" }, amendment: { table: "legislation_amendments", where: "id = ?" },
  knowledge: { table: "knowledge_records", where: "id = ?" }, holiday: { table: "public_holidays", where: "holiday_date = ? AND name = ?" },
  rule_set: { table: "procedure_rule_sets", where: "version = ?" }, provision: { table: "law_provision_versions", where: "id = ?" }, case_law: { table: "tax_case_law", where: "id = ?" },
};
const keyValues = (type: EntityType, id: string) => (type === "holiday" ? [id.split("|")[0], id.split("|").slice(1).join("|")] : [id]);

/** Sets the withdrawn/disputed flag. When set, a verified record is also demoted, so nothing can treat it as verified. */
function flagStatement(db: Database, type: EntityType, id: string, column: "withdrawn" | "disputed", value: 0 | 1): Statement {
  const { table, where } = TABLE_FOR[type as Exclude<EntityType, "calculator_rules">];
  let demote = "";
  if (value === 1) {
    if (LEGISLATION_TYPES.has(type)) demote = `, verification_status = CASE WHEN verification_status = 'verified' THEN 'under_review' ELSE verification_status END, verified_by = CASE WHEN verification_status = 'verified' THEN NULL ELSE verified_by END, verified_at = CASE WHEN verification_status = 'verified' THEN NULL ELSE verified_at END`;
    else if (type === "knowledge") demote = `, status = CASE WHEN status = 'verified' THEN 'draft' ELSE status END, reviewed_by = CASE WHEN status = 'verified' THEN NULL ELSE reviewed_by END, reviewed_at = CASE WHEN status = 'verified' THEN NULL ELSE reviewed_at END`;
    else if (type === "holiday") demote = ", verified_by = NULL, verified_at = NULL";
    else if (type === "rule_set" || type === "provision") demote = ", approved_for_computation = 0, approved_by = NULL, approved_at = NULL";
    else if (type === "case_law") demote = ", summary_status = CASE WHEN summary_status = 'approved' THEN 'draft' ELSE summary_status END";
  }
  return db.prepare(`UPDATE ${table} SET ${column} = ?${demote} WHERE ${where}`).bind(value, ...keyValues(type, id));
}

function verifiedClass(r: VerificationRequest): ContentClass {
  return contentClassFor(r.entityType, { verified: true, category: r.legalCategory });
}

/** A legal approver decides; never the preparer, never the author of the content. */
export async function decideRequest(db: Database, id: string, decision: string, noteInput: unknown, actor: string, canApprove: boolean, at: string) {
  if (!canApprove) throw new RegisterError(403, "Only a legal approver can decide a verification request.");
  if (decision !== "approve" && decision !== "reject") throw new RegisterError(400, "Decision must be approve or reject.");
  const r = await getRequest(db, id);
  if (r.status !== "pending") throw new RegisterError(409, `This request was already ${r.status}.`);
  if (r.preparedBy === actor) throw new RegisterError(403, "You prepared this request. A different legal approver must decide it (two-person review).");
  const note = (text(noteInput) ?? "").trim();
  if (decision === "reject") {
    if (note.length < 5) throw new RegisterError(400, "Give the reason for rejecting it.");
    await db.batch([
      db.prepare(`UPDATE legal_verification_requests SET status = 'rejected', decided_by = ?, decided_at = ?, decision_note = ? WHERE id = ? AND status = 'pending'`).bind(actor, at, note, id),
      auditStatement(db, { actor, action: "request.reject", at, entityType: r.entityType, entityId: r.entityId, requestId: id, details: { note } }),
    ]);
    return { id, status: "rejected" as const };
  }
  const entity = await loadEntity(db, r.entityType, r.entityId);
  if (!entity) throw new RegisterError(404, "The record no longer exists.");
  if (entity.authors.includes(actor)) throw new RegisterError(403, "You wrote or entered this content, so you cannot be its independent approver.");
  if (r.action === "verify" && entity.withdrawn) throw new RegisterError(409, "The record was withdrawn after this request was made. Reinstate it first.");
  if (r.action === "verify" && entity.verified) throw new RegisterError(409, "The record is already verified.");
  if (r.action === "reinstate" && !entity.withdrawn) throw new RegisterError(409, "The record is no longer withdrawn.");
  if (r.entityType === "provision" && r.action === "verify" && (!entity.extra.textVerifiedBy || !["assented", "in_force"].includes(String(entity.extra.billStatus)))) {
    throw new RegisterError(409, "The provision's official text must be entered, and the law in force, before it can be approved for computation.");
  }
  const contentClass: ContentClass = r.action === "verify" ? verifiedClass(r) : r.action === "supersede" ? "superseded" : "pending_verification";
  await db.batch([
    db.prepare(`UPDATE legal_verification_requests SET status = 'approved', decided_by = ?, decided_at = ?, decision_note = ? WHERE id = ? AND status = 'pending'`).bind(actor, at, note, id),
    // Names the approved request for the legal_require_two_person trigger (this transaction only).
    db.prepare(`SELECT set_config('taxcomp.legal_request', ?, true) AS ok`).bind(id),
    ...applyStatements(db, r, actor, at, entity),
    ...registerVersion(db, r, contentClass, { prepared: r.preparedBy, approved: actor, recorder: actor, at, note: note || r.evidenceNote }),
    auditStatement(db, { actor, action: r.action === "reinstate" ? "entity.reinstate" : "request.approve", at, entityType: r.entityType, entityId: r.entityId, requestId: id, details: { action: r.action, contentClass, preparedBy: r.preparedBy, note } }),
  ]);
  return { id, status: "approved" as const, contentClass };
}

export async function cancelRequest(db: Database, id: string, actor: string, at: string) {
  const r = await getRequest(db, id);
  if (r.status !== "pending") throw new RegisterError(409, `This request was already ${r.status}.`);
  if (r.preparedBy !== actor) throw new RegisterError(403, "Only the person who prepared a request can cancel it.");
  await db.batch([
    db.prepare(`UPDATE legal_verification_requests SET status = 'cancelled', decided_at = ? WHERE id = ? AND status = 'pending'`).bind(at, id),
    auditStatement(db, { actor, action: "request.cancel", at, entityType: r.entityType, entityId: r.entityId, requestId: id }),
  ]);
  return { id, status: "cancelled" as const };
}

// ------------------------------------------------------------------ withdrawal and dispute
/** Emergency withdrawal: one legal approver, effective at once everywhere. */
export async function withdrawEntity(db: Database, input: { entityType?: unknown; entityId?: unknown; reason?: unknown }, actor: string, canApprove: boolean, at: string) {
  if (!canApprove) throw new RegisterError(403, "Only a legal approver can withdraw legal material.");
  const type = String(input.entityType ?? "");
  const id = String(input.entityId ?? "");
  checkEntityId(type, id);
  const reason = (text(input.reason) ?? "").trim();
  if (reason.length < 10) throw new RegisterError(400, "Say why it is being withdrawn (at least 10 characters). Users see this reason.");
  const entity = await loadEntity(db, type, id);
  if (!entity) throw new RegisterError(404, "That record is not in the database.");
  if (entity.withdrawn) throw new RegisterError(409, "That record is already withdrawn.");
  const withdrawalId = crypto.randomUUID();
  await db.batch([
    db.prepare(`INSERT INTO legal_withdrawals (id, entity_type, entity_id, reason, withdrawn_by, withdrawn_at) VALUES (?, ?, ?, ?, ?, ?)`).bind(withdrawalId, type, id, reason, actor, at),
    // Cancel any pending verification: it was prepared before the problem was found.
    db.prepare(`UPDATE legal_verification_requests SET status = 'cancelled', decided_at = ?, decision_note = 'Cancelled automatically: the record was withdrawn.' WHERE entity_type = ? AND entity_id = ? AND status = 'pending' AND action <> 'reinstate'`).bind(at, type, id),
    ...(type === "calculator_rules" ? [] : [flagStatement(db, type, id, "withdrawn", 1)]),
    ...plainVersion(db, type, id, "withdrawn", actor, at, reason, entity.title),
    auditStatement(db, { actor, action: "entity.withdraw", at, entityType: type, entityId: id, details: { reason, withdrawalId, wasVerified: entity.verified } }),
  ]);
  return { id: withdrawalId, entityType: type, entityId: id, withdrawnAt: at };
}

/** Any reviewer may flag a record as disputed: it stops being shown as verified until a verification is approved. */
export async function disputeEntity(db: Database, input: { entityType?: unknown; entityId?: unknown; note?: unknown }, actor: string, at: string) {
  const type = String(input.entityType ?? "");
  const id = String(input.entityId ?? "");
  checkEntityId(type, id);
  if (type === "calculator_rules") throw new RegisterError(400, "Withdraw a calculator rule set instead; it cannot be marked disputed.");
  const note = (text(input.note) ?? "").trim();
  if (note.length < 10) throw new RegisterError(400, "Describe the dispute and its sources (at least 10 characters).");
  const entity = await loadEntity(db, type, id);
  if (!entity) throw new RegisterError(404, "That record is not in the database.");
  if (entity.withdrawn) throw new RegisterError(409, "That record is withdrawn.");
  if (entity.disputed) throw new RegisterError(409, "That record is already marked disputed.");
  await db.batch([
    flagStatement(db, type, id, "disputed", 1),
    ...plainVersion(db, type, id, "disputed", actor, at, note, entity.title),
    auditStatement(db, { actor, action: "entity.dispute", at, entityType: type, entityId: id, details: { note, wasVerified: entity.verified } }),
  ]);
  return { entityType: type, entityId: id, contentClass: "disputed" as const };
}

export async function activeWithdrawal(db: Database, type: EntityType, id: string): Promise<{ reason: string; withdrawnAt: string } | null> {
  const r = await db.prepare(`SELECT reason, withdrawn_at AS "withdrawnAt" FROM legal_withdrawals WHERE entity_type = ? AND entity_id = ? AND lifted_at IS NULL`).bind(type, id).first<Row>();
  return r ? { reason: String(r.reason), withdrawnAt: String(r.withdrawnAt) } : null;
}

/** Public list (no reviewer identities): read by the app to block calculators and mark pages. */
export async function publicWithdrawals(db: Database) {
  const { results } = await db.prepare(`SELECT entity_type AS "entityType", entity_id AS "entityId", reason, withdrawn_at AS "withdrawnAt" FROM legal_withdrawals WHERE lifted_at IS NULL ORDER BY withdrawn_at DESC LIMIT 500`).all<Row>();
  return results.map((r) => ({ entityType: String(r.entityType), entityId: String(r.entityId), reason: String(r.reason), withdrawnAt: String(r.withdrawnAt) }));
}

/** The withdrawal that blocks a calculator (whole rule set, or this calculator only), if any. */
export async function calculatorWithdrawal(db: Database, ruleSetId: string, head?: string | null) {
  const ids = [ruleSetId, ...(head ? [`${ruleSetId}#${head}`] : [])];
  const r = await db.prepare(`SELECT entity_id AS "entityId", reason, withdrawn_at AS "withdrawnAt" FROM legal_withdrawals WHERE entity_type = 'calculator_rules' AND lifted_at IS NULL AND entity_id IN (${ids.map(() => "?").join(", ")}) LIMIT 1`)
    .bind(...ids).first<Row>();
  return r ? { entityId: String(r.entityId), reason: String(r.reason), withdrawnAt: String(r.withdrawnAt) } : null;
}

// ------------------------------------------------------------------ audit chain
/** Recomputes every hash. Returns the first broken row, or null when the chain is intact. */
export async function verifyAuditChain(db: Database) {
  const broken = await db.prepare(`SELECT seq FROM (
      SELECT seq, hash, prev_hash, lag(hash) OVER (ORDER BY seq) AS prior, lag(seq) OVER (ORDER BY seq) AS prior_seq,
        encode(sha256(convert_to(concat_ws('|', prev_hash, id, occurred_at, actor_user_id, action, coalesce(entity_type, ''), coalesce(entity_id, ''), coalesce(request_id, ''), details_json), 'UTF8')), 'hex') AS expected
      FROM legal_audit_log) x
    WHERE hash <> expected OR prev_hash <> coalesce(prior, 'genesis') OR seq <> coalesce(prior_seq, 0) + 1 ORDER BY seq LIMIT 1`).first<Row>();
  const count = await db.prepare(`SELECT count(*)::int AS n FROM legal_audit_log`).first<Row>();
  return { entries: Number(count?.n ?? 0), intact: !broken, brokenAt: broken ? Number(broken.seq) : null };
}

// ------------------------------------------------------------------ administrator view
export async function registerOverview(db: Database, actor: string, canApprove: boolean) {
  const [pending, recent, withdrawals, disputed, conflicts, counts, audit, chain] = await Promise.all([
    db.prepare(`${REQUEST_SELECT} WHERE status = 'pending' ORDER BY prepared_at`).all<Row>(),
    db.prepare(`${REQUEST_SELECT} WHERE status <> 'pending' ORDER BY coalesce(decided_at, prepared_at) DESC LIMIT 30`).all<Row>(),
    db.prepare(`SELECT id, entity_type AS "entityType", entity_id AS "entityId", reason, withdrawn_by AS "withdrawnBy", withdrawn_at AS "withdrawnAt" FROM legal_withdrawals WHERE lifted_at IS NULL ORDER BY withdrawn_at DESC`).all<Row>(),
    db.prepare(`SELECT entity_type AS "entityType", entity_id AS "entityId", instrument_title AS title, note, recorded_by AS "recordedBy", recorded_at AS "recordedAt" FROM legal_register WHERE superseded_at IS NULL AND content_class = 'disputed' ORDER BY recorded_at DESC`).all<Row>(),
    db.prepare(`SELECT a.id, a.principal_act AS "principalAct", a.provision, a.bill_figure AS "billFigure", a.reported_figure AS "reportedFigure", a.verification_status AS status, a.evidence
      FROM legislation_amendments a WHERE a.figures_differ = 1 AND a.withdrawn = 0 AND a.verification_status <> 'verified' ORDER BY a.position`).all<Row>(),
    db.prepare(`SELECT 'section' AS t, count(*) FILTER (WHERE verification_status = 'verified')::int AS verified, count(*) FILTER (WHERE withdrawn = 1)::int AS withdrawn, count(*) FILTER (WHERE disputed = 1)::int AS disputed, count(*)::int AS total FROM legislation_sections
      UNION ALL SELECT 'law_version', count(*) FILTER (WHERE verification_status = 'verified')::int, count(*) FILTER (WHERE withdrawn = 1)::int, count(*) FILTER (WHERE disputed = 1)::int, count(*)::int FROM legislation_law_versions
      UNION ALL SELECT 'schedule', count(*) FILTER (WHERE verification_status = 'verified')::int, count(*) FILTER (WHERE withdrawn = 1)::int, count(*) FILTER (WHERE disputed = 1)::int, count(*)::int FROM legislation_schedules
      UNION ALL SELECT 'amendment', count(*) FILTER (WHERE verification_status = 'verified')::int, count(*) FILTER (WHERE withdrawn = 1)::int, count(*) FILTER (WHERE disputed = 1 OR (figures_differ = 1 AND verification_status <> 'verified'))::int, count(*)::int FROM legislation_amendments
      UNION ALL SELECT 'knowledge', count(*) FILTER (WHERE status = 'verified')::int, count(*) FILTER (WHERE withdrawn = 1)::int, count(*) FILTER (WHERE disputed = 1)::int, count(*)::int FROM knowledge_records
      UNION ALL SELECT 'holiday', count(*) FILTER (WHERE verified_by IS NOT NULL)::int, count(*) FILTER (WHERE withdrawn = 1)::int, count(*) FILTER (WHERE disputed = 1)::int, count(*)::int FROM public_holidays
      UNION ALL SELECT 'rule_set', count(*) FILTER (WHERE approved_for_computation = 1)::int, count(*) FILTER (WHERE withdrawn = 1)::int, count(*) FILTER (WHERE disputed = 1)::int, count(*)::int FROM procedure_rule_sets
      UNION ALL SELECT 'provision', count(*) FILTER (WHERE approved_for_computation = 1)::int, count(*) FILTER (WHERE withdrawn = 1)::int, count(*) FILTER (WHERE disputed = 1)::int, count(*)::int FROM law_provision_versions
      UNION ALL SELECT 'case_law', count(*) FILTER (WHERE summary_status = 'approved' OR appeal_status <> 'unverified')::int, count(*) FILTER (WHERE withdrawn = 1)::int, count(*) FILTER (WHERE disputed = 1)::int, count(*)::int FROM tax_case_law`).all<Row>(),
    db.prepare(`SELECT seq, occurred_at AS "occurredAt", actor_user_id AS actor, action, entity_type AS "entityType", entity_id AS "entityId", request_id AS "requestId" FROM legal_audit_log ORDER BY seq DESC LIMIT 25`).all<Row>(),
    verifyAuditChain(db),
  ]);
  const decorate = (r: Row) => {
    const req = toRequest(r);
    return { ...req, preparedByMe: req.preparedBy === actor, canDecide: canApprove && req.status === "pending" && req.preparedBy !== actor };
  };
  return {
    canApprove,
    pending: pending.results.map(decorate),
    recent: recent.results.map(decorate),
    withdrawn: withdrawals.results,
    disputed: disputed.results,
    conflicts: conflicts.results,
    counts: counts.results.map((r) => ({ entityType: String(r.t), label: ENTITY_LABEL[String(r.t) as EntityType], verified: Number(r.verified), withdrawn: Number(r.withdrawn), disputed: Number(r.disputed), total: Number(r.total) })),
    audit: { ...chain, recent: audit.results },
    options: { entityTypes: ENTITY_TYPES.map((t) => ({ id: t, label: ENTITY_LABEL[t] })), categories: LEGAL_CATEGORIES.map((c) => ({ id: c, label: CATEGORY_LABEL[c], primary: PRIMARY_LAW.has(c), notEnacted: NOT_ENACTED.has(c) })),
      classes: CLASS_LABEL, calculatorRuleSets: CALCULATOR_RULE_SETS, calculatorHeads: CALCULATOR_HEADS },
  };
}

/** Everything recorded about one record: register versions (history), requests, withdrawals, audit entries. */
export async function entryHistory(db: Database, typeInput: string, id: string) {
  checkEntityId(typeInput, id);
  const type = typeInput;
  const [entity, versions, requests, withdrawals, audit] = await Promise.all([
    loadEntity(db, type, id),
    db.prepare(`SELECT version, content_class AS "contentClass", instrument_title AS "instrumentTitle", instrument_number AS "instrumentNumber", legal_category AS "legalCategory", provision,
      publication_date AS "publicationDate", commencement_date AS "commencementDate", effective_from AS "effectiveFrom", effective_to AS "effectiveTo", applicable_tax_year AS "applicableTaxYear",
      source_url AS "sourceUrl", document_reference AS "documentReference", request_id AS "requestId", prepared_by AS "preparedBy", approved_by AS "approvedBy", recorded_by AS "recordedBy",
      recorded_at AS "recordedAt", superseded_at AS "supersededAt", note FROM legal_register WHERE entity_type = ? AND entity_id = ? ORDER BY version DESC`).bind(type, id).all<Row>(),
    db.prepare(`${REQUEST_SELECT} WHERE entity_type = ? AND entity_id = ? ORDER BY prepared_at DESC`).bind(type, id).all<Row>(),
    db.prepare(`SELECT reason, withdrawn_by AS "withdrawnBy", withdrawn_at AS "withdrawnAt", lifted_by AS "liftedBy", lifted_at AS "liftedAt" FROM legal_withdrawals WHERE entity_type = ? AND entity_id = ? ORDER BY withdrawn_at DESC`).bind(type, id).all<Row>(),
    db.prepare(`SELECT seq, occurred_at AS "occurredAt", actor_user_id AS actor, action, details_json AS "detailsJson" FROM legal_audit_log WHERE entity_type = ? AND entity_id = ? ORDER BY seq`).bind(type, id).all<Row>(),
  ]);
  if (!entity) throw new RegisterError(404, "That record is not in the database.");
  const current = versions.results.find((v) => !v.supersededAt);
  return {
    entityType: type, entityId: id, title: entity.title, provision: entity.provision,
    contentClass: contentClassFor(type, { verified: entity.verified, superseded: entity.superseded, withdrawn: entity.withdrawn, disputed: entity.disputed, category: str(current?.legalCategory) ?? entity.defaultCategory }),
    versions: versions.results.map((v) => ({ ...v, classLabel: CLASS_LABEL[String(v.contentClass) as ContentClass] })),
    requests: requests.results.map(toRequest), withdrawals: withdrawals.results,
    audit: audit.results.map((a) => ({ ...a, details: JSON.parse(String(a.detailsJson ?? "{}")), detailsJson: undefined })),
  };
}
