// Evidence-based launch gates (audit finding M2). See
// docs/remediation/LAUNCH_GATE_REGISTER.md.
//
// Eight gates (taxcomp.launch_gates). For each: responsible person, required
// evidence, recorded evidence, status, approval date, outstanding issues and a
// review date. Rules, also enforced by the database:
//   * nothing is ever approved automatically: only a named administrator with
//     can_approve_gates, signed in with two-step verification, can approve;
//   * the approver cannot be the person who submitted the evidence;
//   * an approval needs evidence and a review date within 12 months; after that
//     date the gate counts as expired until it is re-approved;
//   * public launch needs the other seven gates approved and in date.
// Every change is appended to the hash-chained launch_gate_events log.

export const GATE_KEYS = Object.freeze(["legal", "tax_calculation", "security", "privacy", "operations", "billing", "support", "public_launch"]);

export const GATE_STATUS_LABEL = Object.freeze({
  not_started: "Not started",
  in_progress: "Collecting evidence",
  evidence_submitted: "Evidence submitted, awaiting approval",
  approved: "Approved",
  expired: "Approval expired (review date passed)",
  rejected: "Rejected",
  revoked: "Approval revoked",
});

const EVIDENCE_KINDS = new Set(["document", "report", "test_result", "sign_off", "other"]);
const MAX_EVIDENCE = 30;
const MAX_REVIEW_DAYS = 366;

export class GateError extends Error {
  status;
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function text(value, max, label, { required = false } = {}) {
  const cleaned = typeof value === "string" ? value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim() : "";
  if (required && !cleaned) throw new GateError(400, `${label} is required.`);
  if (cleaned.length > max) throw new GateError(400, `${label} must be ${max} characters or fewer.`);
  return cleaned;
}

function isoDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

function addDays(iso, days) {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function parse(json, fallback) {
  try { return JSON.parse(json); } catch { return fallback; }
}

/** Status shown to people: an approval past its review date is "expired". */
export function effectiveStatus(row, today) {
  if (row.status === "approved" && (!row.reviewBy || row.reviewBy < today)) return "expired";
  return row.status;
}

const SELECT_GATE = `SELECT gate_key AS "key", position, title, responsible_role AS "responsibleRole", responsible_person AS "responsiblePerson",
  required_evidence_json AS "requiredEvidenceJson", status, evidence_json AS "evidenceJson", outstanding_issues AS "outstandingIssues",
  evidence_submitted_by AS "evidenceSubmittedBy", evidence_submitted_at AS "evidenceSubmittedAt", approved_by AS "approvedBy",
  approved_by_name AS "approvedByName", approved_at AS "approvedAt", review_by AS "reviewBy", decision_notes AS "decisionNotes",
  version, updated_at AS "updatedAt" FROM launch_gates`;

function shape(row, today) {
  const status = effectiveStatus(row, today);
  return {
    key: String(row.key), position: Number(row.position), title: String(row.title),
    responsibleRole: String(row.responsibleRole), responsiblePerson: row.responsiblePerson ? String(row.responsiblePerson) : null,
    requiredEvidence: parse(String(row.requiredEvidenceJson), []), evidence: parse(String(row.evidenceJson), []),
    outstandingIssues: String(row.outstandingIssues ?? ""), status, statusLabel: GATE_STATUS_LABEL[status] ?? status,
    evidenceSubmittedBy: row.evidenceSubmittedBy ? String(row.evidenceSubmittedBy) : null, evidenceSubmittedAt: row.evidenceSubmittedAt ?? null,
    approvedBy: row.approvedBy ? String(row.approvedBy) : null, approvedByName: row.approvedByName ?? null,
    approvedAt: row.approvedAt ?? null, reviewBy: row.reviewBy ?? null, decisionNotes: String(row.decisionNotes ?? ""),
    version: Number(row.version), updatedAt: String(row.updatedAt),
  };
}

export async function listGates(db, today) {
  const { results } = await db.prepare(`${SELECT_GATE} ORDER BY position`).all();
  return (results || []).map((row) => shape(row, today));
}

async function loadGate(db, key, today) {
  if (!GATE_KEYS.includes(key)) throw new GateError(404, "Launch gate not found.");
  const row = await db.prepare(`${SELECT_GATE} WHERE gate_key = ?`).bind(key).first();
  if (!row) throw new GateError(404, "Launch gate not found.");
  return { raw: row, gate: shape(row, today) };
}

export async function gateHistory(db, key) {
  if (!GATE_KEYS.includes(key)) throw new GateError(404, "Launch gate not found.");
  const { results } = await db.prepare(`SELECT seq, occurred_at AS "occurredAt", actor_user_id AS "actorUserId", actor_email AS "actorEmail", action,
      from_status AS "fromStatus", to_status AS "toStatus", details_json AS "detailsJson"
    FROM launch_gate_events WHERE gate_key = ? ORDER BY seq`).bind(key).all();
  return (results || []).map((row) => ({ ...row, seq: Number(row.seq), details: parse(String(row.detailsJson), {}), detailsJson: undefined }));
}

/** Writes the gate update and its event in one transaction; 409 if someone changed the gate meanwhile. */
async function commit(db, key, before, sets, values, event, principal, nowIso) {
  const statements = [
    db.prepare(`UPDATE launch_gates SET ${sets.join(", ")}, updated_at = ? WHERE gate_key = ? AND version = ?`)
      .bind(...values, nowIso, key, before.version),
    db.prepare(`INSERT INTO launch_gate_events (id, gate_key, occurred_at, actor_user_id, actor_email, action, from_status, to_status, details_json)
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM launch_gates WHERE gate_key = ? AND version = ? AND updated_at = ?)`)
      .bind(crypto.randomUUID(), key, nowIso, principal.userId, principal.email ?? "", event.action, before.status, event.toStatus,
        JSON.stringify(event.details ?? {}), key, before.version + 1, nowIso),
  ];
  await db.batch(statements);
  const after = await db.prepare(`SELECT version, updated_at AS "updatedAt" FROM launch_gates WHERE gate_key = ?`).bind(key).first();
  if (Number(after?.version) !== before.version + 1 || after?.updatedAt !== nowIso) {
    throw new GateError(409, "Someone else changed this gate at the same time. Reload and try again.");
  }
}

function requirePerson(principal) {
  if (!principal || principal.kind !== "person" || !principal.userId) {
    throw new GateError(403, "Launch gates need your own administrator account with two-step sign-in.");
  }
}

/**
 * Records evidence and/or updates the responsible person and outstanding issues.
 * input: { evidence?: [{ title, reference, kind }], responsiblePerson?, outstandingIssues? }
 */
export async function recordGateDetails(db, key, input, principal, nowIso, today) {
  requirePerson(principal);
  if (!principal.canManageGates && !principal.canApproveGates) throw new GateError(403, "You do not have permission to manage launch gates.");
  const { raw, gate } = await loadGate(db, key, today);
  if (gate.status === "evidence_submitted") throw new GateError(409, "This gate is waiting for a decision. It cannot be changed until it is approved or rejected.");
  const sets = [];
  const values = [];
  const details = {};
  const added = [];
  if (Array.isArray(input.evidence) && input.evidence.length) {
    for (const item of input.evidence.slice(0, 10)) {
      const title = text(item?.title, 200, "Evidence title", { required: true });
      const reference = text(item?.reference, 500, "Evidence link or document reference", { required: true });
      if (/^https?:/i.test(reference) && !/^https:\/\/\S{4,}$/.test(reference)) throw new GateError(400, "Evidence links must start with https://.");
      const kind = EVIDENCE_KINDS.has(item?.kind) ? item.kind : "document";
      added.push({ id: crypto.randomUUID(), title, reference, kind, addedBy: principal.userId, addedByName: principal.displayName, addedAt: nowIso });
    }
    const evidence = [...gate.evidence, ...added];
    if (evidence.length > MAX_EVIDENCE) throw new GateError(400, `A gate can hold at most ${MAX_EVIDENCE} evidence items.`);
    sets.push("evidence_json = ?");
    values.push(JSON.stringify(evidence));
    details.evidenceAdded = added.map(({ title, reference, kind }) => ({ title, reference, kind }));
  }
  if (input.responsiblePerson !== undefined) {
    const person = text(input.responsiblePerson, 160, "Responsible person");
    if (person && person.length < 2) throw new GateError(400, "Enter the responsible person's full name.");
    sets.push("responsible_person = ?");
    values.push(person || null);
    details.responsiblePerson = person || null;
  }
  if (input.outstandingIssues !== undefined) {
    const issues = text(input.outstandingIssues, 4000, "Outstanding issues");
    sets.push("outstanding_issues = ?");
    values.push(issues);
    details.outstandingIssues = issues;
  }
  if (!sets.length) throw new GateError(400, "Nothing to record.");
  // An approved (or expired) gate keeps its evidence fixed: to renew it, an
  // approver revokes it first, then new evidence is recorded and submitted.
  if (raw.status === "approved" && added.length) {
    throw new GateError(409, "This gate's approval is on record with its evidence. An approver must revoke it before new evidence is added for re-approval.");
  }
  let toStatus = raw.status;
  if (["not_started", "rejected", "revoked"].includes(raw.status)) {
    sets.push("status = ?");
    values.push("in_progress");
    toStatus = "in_progress";
  }
  await commit(db, key, { version: gate.version, status: raw.status }, sets, values,
    { action: added.length ? "evidence_recorded" : "details_updated", toStatus, details }, principal, nowIso);
  return (await loadGate(db, key, today)).gate;
}

/** Marks the evidence complete and asks for a decision. The submitter cannot approve. */
export async function submitGateEvidence(db, key, input, principal, nowIso, today) {
  requirePerson(principal);
  if (!principal.canManageGates && !principal.canApproveGates) throw new GateError(403, "You do not have permission to manage launch gates.");
  const { raw, gate } = await loadGate(db, key, today);
  if (raw.status === "evidence_submitted") throw new GateError(409, "The evidence has already been submitted.");
  if (!gate.evidence.length) throw new GateError(400, "Record the evidence before submitting it for approval.");
  if (!gate.responsiblePerson) throw new GateError(400, "Name the responsible person before submitting the evidence.");
  const note = text(input?.note, 2000, "Note");
  await commit(db, key, { version: gate.version, status: raw.status },
    ["status = ?", "evidence_submitted_by = ?", "evidence_submitted_at = ?", "approved_by = NULL", "approved_by_name = NULL", "approved_at = NULL", "review_by = NULL", "decision_notes = ''"],
    ["evidence_submitted", principal.userId, nowIso],
    { action: "evidence_submitted", toStatus: "evidence_submitted", details: { note, evidenceCount: gate.evidence.length } }, principal, nowIso);
  return (await loadGate(db, key, today)).gate;
}

/** Approves or rejects submitted evidence. */
export async function decideGate(db, key, input, principal, nowIso, today) {
  requirePerson(principal);
  if (!principal.canApproveGates) throw new GateError(403, "Only a launch-gate approver can approve or reject a gate.");
  const { raw, gate } = await loadGate(db, key, today);
  if (raw.status !== "evidence_submitted") throw new GateError(409, "Only submitted evidence can be approved or rejected.");
  if (gate.evidenceSubmittedBy === principal.userId) {
    throw new GateError(403, "You submitted this evidence, so a different approver must decide. Independent approval is required.");
  }
  const decision = input?.decision;
  const notes = text(input?.notes, 4000, "Decision notes", { required: true });
  if (decision === "reject") {
    await commit(db, key, { version: gate.version, status: raw.status }, ["status = ?", "decision_notes = ?"], ["rejected", notes],
      { action: "rejected", toStatus: "rejected", details: { notes } }, principal, nowIso);
    return (await loadGate(db, key, today)).gate;
  }
  if (decision !== "approve") throw new GateError(400, "The decision must be approve or reject.");
  const reviewBy = input?.reviewBy;
  if (!isoDate(reviewBy) || reviewBy <= today) throw new GateError(400, "Set a review date after today.");
  if (reviewBy > addDays(today, MAX_REVIEW_DAYS)) throw new GateError(400, "The review date must be within 12 months.");
  if (key === "public_launch") {
    const others = (await listGates(db, today)).filter((g) => g.key !== "public_launch" && g.status !== "approved");
    if (others.length) throw new GateError(409, `Public launch needs the other seven gates approved and in date. Outstanding: ${others.map((g) => g.title).join(", ")}.`);
  }
  try {
    await commit(db, key, { version: gate.version, status: raw.status },
      ["status = ?", "approved_by = ?", "approved_by_name = ?", "approved_at = ?", "review_by = ?", "decision_notes = ?"],
      ["approved", principal.userId, principal.displayName, nowIso, reviewBy, notes],
      { action: "approved", toStatus: "approved", details: { reviewBy, notes, evidenceCount: gate.evidence.length } }, principal, nowIso);
  } catch (error) {
    if (error instanceof GateError) throw error;
    // The database refused it (for example a gate expired in between).
    throw new GateError(409, "The database refused this approval. Reload the gates and check the other approvals are still in date.");
  }
  return (await loadGate(db, key, today)).gate;
}

/** Withdraws an approval (for example when the evidence no longer holds). */
export async function revokeGate(db, key, input, principal, nowIso, today) {
  requirePerson(principal);
  if (!principal.canApproveGates) throw new GateError(403, "Only a launch-gate approver can revoke an approval.");
  const { raw, gate } = await loadGate(db, key, today);
  if (raw.status !== "approved") throw new GateError(409, "Only an approved gate can be revoked.");
  const notes = text(input?.notes, 4000, "Reason", { required: true });
  await commit(db, key, { version: gate.version, status: raw.status }, ["status = ?", "decision_notes = ?"], ["revoked", notes],
    { action: "revoked", toStatus: "revoked", details: { notes } }, principal, nowIso);
  return (await loadGate(db, key, today)).gate;
}

/** Recomputes the event hash chain; returns { ok, events, brokenAt }. */
export async function verifyGateChain(db) {
  const { results } = await db.prepare(`SELECT id, seq, gate_key AS "gateKey", occurred_at AS "occurredAt", actor_user_id AS "actorUserId", action,
      from_status AS "fromStatus", to_status AS "toStatus", details_json AS "detailsJson", prev_hash AS "prevHash", hash
    FROM launch_gate_events ORDER BY seq`).all();
  let prev = "genesis";
  for (const row of results || []) {
    const material = [prev, row.id, row.gateKey, row.occurredAt, row.actorUserId, row.action, row.fromStatus, row.toStatus, row.detailsJson].join("|");
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(material)));
    const hash = Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("");
    if (row.prevHash !== prev || row.hash !== hash) return { ok: false, events: (results || []).length, brokenAt: Number(row.seq) };
    prev = hash;
  }
  return { ok: true, events: (results || []).length, brokenAt: null };
}
