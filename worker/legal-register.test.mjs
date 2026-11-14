// Phase 2b: legal verification register, independent two-person review,
// emergency withdrawal and the protected audit trail (migration 20261114000100).
// Records here are synthetic test data; nothing in this file is a statement
// about what Ugandan law says.
import test from "node:test";
import assert from "node:assert/strict";
import { handleRequest } from "./index.mjs";
import { clearSupabaseKeyCache } from "./supabase-auth.mjs";
import { createMigratedDatabase } from "./pglite-test-support.mjs";
import { createFakeSupabase } from "./supabase-test-fakes.mjs";
import { retrieveLegislation, retrieveAmendments } from "./challenge/legislation.mts";
import { loadRuleSet } from "./challenge/store.mts";
import { computeDeadlines } from "./challenge/deadlines.mts";
import { contentClassFor, legislationClass, verifyAuditChain } from "./challenge/register.mts";
import legalStatus from "../legal-status.js";

const origin = "https://taxcomp.example.invalid";
const NOW = new Date("2026-11-14T08:00:00Z");
const S16 = "ug-rev-2024/vata/s16";
const VAT_THRESHOLD = "vat-2026-s7-registration-threshold";

async function setup() {
  clearSupabaseKeyCache();
  const { pg, db } = await createMigratedDatabase();
  const supabase = await createFakeSupabase(pg);
  const env = { UNANSWERED_QUESTIONS: db, DATABASE_PROVIDER: "supabase", ALLOWED_ORIGIN: origin, SUPABASE_URL: supabase.url, SUPABASE_FETCH: supabase.fetch,
    CHAT_LIMITER: { limit: async () => ({ success: true }) }, CHALLENGE_CLOCK: () => NOW };
  const call = async (path, { token, method = "GET", body } = {}) => {
    const headers = { Origin: origin, ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { "Content-Type": "application/json" } : {}) };
    const response = await handleRequest(new Request(`https://worker.example${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined }), env);
    return { status: response.status, json: await response.json().catch(() => ({})), headers: response.headers };
  };
  const person = async (email, { reviewer = true, approver = false } = {}) => {
    const user = await supabase.issueToken({ email });
    if (reviewer) await pg.query("INSERT INTO taxcomp.challenge_reviewers (user_id, email, can_approve_law, created_at) VALUES ($1, $2, $3, now()::text)", [user.userId, email, approver ? 1 : 0]);
    return user;
  };
  const submit = (who, body) => call("/api/challenge/review/register/requests", { token: who.token, method: "POST", body });
  const decide = (who, id, decision = "approve", note = "Checked against the source myself.") => call(`/api/challenge/review/register/requests/${id}/decision`, { token: who.token, method: "POST", body: { decision, note } });
  const withdraw = (who, entityType, entityId, reason = "Test: found to be wrong, withdrawn for correction.") => call("/api/challenge/review/register/withdrawals", { token: who.token, method: "POST", body: { entityType, entityId, reason } });
  const one = async (sql, params) => (await pg.query(sql, params)).rows[0];
  return { pg, db, env, call, person, submit, decide, withdraw, one };
}

const sectionEvidence = { entityType: "section", entityId: S16, action: "verify", legalCategory: "act", instrumentNumber: "Cap. 344 (test)",
  sourceUrl: "https://ulrc.go.ug/test/vata", evidenceNote: "Synthetic test: heading compared with the official revised edition.", effectiveFrom: "2024-07-01", effectiveTo: "2025-06-30" };

test("permissions: owners see nothing; reviewers prepare; only a different legal approver decides; only approvers withdraw", async () => {
  const t = await setup();
  const owner = await t.person("owner@example.com", { reviewer: false });
  const reviewer = await t.person("reviewer@example.com");
  const approver = await t.person("approver@example.com", { approver: true });
  assert.equal((await t.call("/api/challenge/review/register", { token: owner.token })).status, 403);
  assert.equal((await t.submit(owner, sectionEvidence)).status, 403, "ordinary users cannot submit");
  assert.equal((await t.withdraw(owner, "section", S16)).status, 403, "ordinary users cannot withdraw");
  assert.equal((await t.call("/api/challenge/review/register")).status, 401, "signed out");

  const overview = await t.call("/api/challenge/review/register", { token: reviewer.token });
  assert.equal(overview.status, 200);
  assert.equal(overview.json.canApprove, false);
  assert.ok(overview.json.counts.find((c) => c.entityType === "section").total === 701);

  const submitted = await t.submit(reviewer, sectionEvidence);
  assert.equal(submitted.status, 201, JSON.stringify(submitted.json));
  const id = submitted.json.request.id;
  assert.equal((await t.submit(reviewer, sectionEvidence)).status, 409, "one pending request per record");
  assert.equal((await t.decide(reviewer, id)).status, 403, "a reviewer without approver rights cannot decide");
  assert.equal((await t.withdraw(reviewer, "section", S16)).status, 403, "a reviewer cannot withdraw");

  // The preparer becomes an approver: still cannot decide their own request.
  await t.pg.query("UPDATE taxcomp.challenge_reviewers SET can_approve_law = 1 WHERE user_id = $1", [reviewer.userId]);
  const own = await t.decide(reviewer, id);
  assert.equal(own.status, 403);
  assert.match(own.json.error, /different legal approver/);
  const pending = (await t.call("/api/challenge/review/register", { token: reviewer.token })).json.pending.find((r) => r.id === id);
  assert.deepEqual([pending.preparedByMe, pending.canDecide], [true, false]);
  assert.equal((await t.call("/api/challenge/review/register", { token: approver.token })).json.pending.find((r) => r.id === id).canDecide, true);

  assert.equal((await t.decide(approver, id, "reject", "")).status, 400, "rejecting needs a reason");
  const approved = await t.decide(approver, id);
  assert.equal(approved.status, 200, JSON.stringify(approved.json));
  assert.equal(approved.json.contentClass, "verified_law");
  assert.equal((await t.decide(approver, id)).status, 409, "a decided request cannot be decided again");
  const row = await t.one("SELECT verification_status AS s, verified_by AS v FROM taxcomp.legislation_sections WHERE id = $1", [S16]);
  assert.deepEqual(row, { s: "verified", v: approver.userId });
  // The preparer can cancel only their own pending request.
  const other = await t.submit(reviewer, { ...sectionEvidence, entityId: "ug-rev-2024/vata/s17" });
  assert.equal((await t.call(`/api/challenge/review/register/requests/${other.json.request.id}/cancel`, { token: approver.token, method: "POST" })).status, 403);
  assert.equal((await t.call(`/api/challenge/review/register/requests/${other.json.request.id}/cancel`, { token: reviewer.token, method: "POST" })).status, 200);
  await t.pg.close();
});

test("database enforcement: no record becomes verified without an approved two-person request, whatever the code path", async () => {
  const t = await setup();
  const attempt = (requestId, verifier) => t.pg.transaction(async (tx) => {
    if (requestId) await tx.query("SELECT set_config('taxcomp.legal_request', $1, true)", [requestId]);
    await tx.query("UPDATE taxcomp.legislation_sections SET verification_status = 'verified', verified_by = $1, verified_at = 'now', official_source_url = 'https://ulrc.go.ug/x' WHERE id = $2", [verifier, S16]);
  });
  await assert.rejects(attempt(null, "anyone"), /legal_two_person_required/);
  const insert = (id, prepared, decided, status) => t.pg.query(`INSERT INTO taxcomp.legal_verification_requests (id, entity_type, entity_id, action, instrument_title, legal_category, source_url, evidence_note, prepared_by, prepared_at, status, decided_by, decided_at)
    VALUES ($1, 'section', $2, 'verify', 'Test Act', 'act', 'https://ulrc.go.ug/x', 'Synthetic evidence note.', $3, 'now', $4, $5, $6)`, [id, S16, prepared, status, decided, decided ? "now" : null]);
  // The database refuses a request decided by its preparer.
  await assert.rejects(insert("00000000-0000-4000-8000-000000000001", "same", "same", "approved"), /legal_request_two_person/);
  await insert("00000000-0000-4000-8000-000000000002", "preparer", null, "pending");
  await assert.rejects(attempt("00000000-0000-4000-8000-000000000002", "approver"), /does not authorise/, "a pending request authorises nothing");
  await t.pg.query("UPDATE taxcomp.legal_verification_requests SET status = 'approved', decided_by = 'approver', decided_at = 'now' WHERE id = '00000000-0000-4000-8000-000000000002'");
  await assert.rejects(attempt("00000000-0000-4000-8000-000000000002", "someone-else"), /does not authorise/, "the verifier must be the approver");
  await assert.rejects(t.pg.query("UPDATE taxcomp.legal_verification_requests SET evidence_note = 'Changed afterwards.' WHERE id = '00000000-0000-4000-8000-000000000002'"), /legal_record_protected/, "decided requests are frozen");
  await assert.rejects(t.pg.query("DELETE FROM taxcomp.legal_verification_requests"), /legal_record_protected/);
  await attempt("00000000-0000-4000-8000-000000000002", "approver");
  assert.equal((await t.one("SELECT verification_status AS s FROM taxcomp.legislation_sections WHERE id = $1", [S16])).s, "verified");
  // The Worker role cannot use the restore bypass.
  await t.pg.exec("SET ROLE taxcomp_worker");
  await assert.rejects(t.pg.transaction(async (tx) => {
    await tx.query("SET LOCAL taxcomp.restore = 'on'");
    await tx.query("UPDATE taxcomp.knowledge_records SET status = 'verified', reviewed_by = 'w', reviewed_at = 'now' WHERE id = 'intl.beps'");
  }), /legal_two_person_required/);
  await t.pg.exec("RESET ROLE");
  await t.pg.close();
});

test("legal classes: Bills never verify law; commentary is never verified law; conflicts show as disputed; disputes demote", async () => {
  const t = await setup();
  const reviewer = await t.person("reviewer@example.com");
  const approver = await t.person("approver@example.com", { approver: true });
  for (const legalCategory of ["bill", "budget_speech", "press_report"]) {
    const r = await t.submit(reviewer, { ...sectionEvidence, legalCategory });
    assert.equal(r.status, 400, legalCategory);
    assert.match(r.json.error, /not enacted law/);
  }
  assert.equal((await t.submit(reviewer, { ...sectionEvidence, sourceUrl: undefined, documentReference: undefined })).status, 400, "an authoritative source is required");
  assert.equal((await t.submit(reviewer, { ...sectionEvidence, effectiveFrom: "2025-07-01", effectiveTo: "2024-06-30" })).status, 400, "effective period order");

  // Public classes before any review.
  const amendments = (await t.call("/api/legislation/amendments")).json.amendments;
  const threshold = amendments.find((a) => a.id === VAT_THRESHOLD);
  assert.equal(threshold.legalClass, "disputed", "Bill and reported figures differ: a disputed position until verified");
  assert.ok(amendments.some((a) => a.evidence === "bill_only" && a.legalClass === "proposed_legislation"), "Bill-only changes are proposed legislation");
  assert.equal((await t.call("/api/legislation/vata/sections/16")).json.section.legalClass, "pending_verification");

  // Verify a section, then dispute it: it stops being presented as verified.
  const id = (await t.submit(reviewer, sectionEvidence)).json.request.id;
  await t.decide(approver, id);
  assert.equal((await t.call("/api/legislation/vata/sections/16")).json.section.legalClass, "verified_law");
  const disputed = await t.call("/api/challenge/review/register/disputes", { token: reviewer.token, method: "POST", body: { entityType: "section", entityId: S16, note: "Test: a reviewer found a conflicting official text." } });
  assert.equal(disputed.status, 201);
  const after = (await t.call("/api/legislation/vata/sections/16")).json.section;
  assert.deepEqual([after.legalClass, after.verificationStatus], ["disputed", "under_review"], "a dispute demotes a verified record");

  // Pure helpers.
  assert.equal(contentClassFor("knowledge", { verified: true, category: "act" }), "professional_commentary");
  assert.equal(contentClassFor("knowledge", { verified: true, category: "ura_guidance" }), "administrative_guidance");
  assert.equal(legislationClass("superseded"), "superseded");
  assert.equal(legislationClass("verified", { withdrawn: 1 }), "withdrawn");
  await t.pg.close();
});

test("history: every approved state is a new version with its effective period; old versions are kept and cannot be edited or deleted", async () => {
  const t = await setup();
  const reviewer = await t.person("reviewer@example.com");
  const approver = await t.person("approver@example.com", { approver: true });
  await t.decide(approver, (await t.submit(reviewer, sectionEvidence)).json.request.id);
  await t.call("/api/challenge/review/register/disputes", { token: reviewer.token, method: "POST", body: { entityType: "section", entityId: S16, note: "Test dispute after verification." } });
  const history = await t.call(`/api/challenge/review/register/entry?type=section&id=${encodeURIComponent(S16)}`, { token: reviewer.token });
  assert.equal(history.status, 200);
  const versions = history.json.versions;
  assert.deepEqual(versions.map((v) => [v.version, v.contentClass, Boolean(v.supersededAt)]), [[2, "disputed", false], [1, "verified_law", true]]);
  const v1 = versions.find((v) => v.version === 1);
  assert.deepEqual([v1.effectiveFrom, v1.effectiveTo, v1.preparedBy, v1.approvedBy, v1.legalCategory], ["2024-07-01", "2025-06-30", reviewer.userId, approver.userId, "act"]);
  await assert.rejects(t.pg.query("UPDATE taxcomp.legal_register SET note = 'rewritten' WHERE version = 1"), /legal_record_protected/);
  await assert.rejects(t.pg.query("DELETE FROM taxcomp.legal_register"), /legal_record_protected/);
  await assert.rejects(t.pg.query(`INSERT INTO taxcomp.legal_register (id, entity_type, entity_id, version, content_class, legal_category, recorded_by, recorded_at) VALUES ('x', 'section', 'x', 1, 'verified_law', 'bill', 'a', 'now')`), /legal_register_verified_law/, "verified law needs two people and a primary source");
  await t.pg.close();
});

test("emergency withdrawal: served nowhere (API, search, AI retrieval, amendments, knowledge, holidays, deadlines, calculators); reinstating needs two people", async () => {
  const t = await setup();
  const reviewer = await t.person("reviewer@example.com");
  const approver = await t.person("approver@example.com", { approver: true });
  const second = await t.person("second@example.com", { approver: true });
  const owner = await t.person("owner@example.com", { reviewer: false });

  // Section: before and after.
  assert.equal((await t.call("/api/legislation/vata/sections/16")).status, 200);
  const before = await retrieveLegislation(t.db, "Where is the place of supply of services for VAT?", { today: "2026-11-14" });
  assert.ok(before.provisions.some((p) => p.id === S16), "retrieval finds it before");
  assert.equal((await t.withdraw(approver, "section", S16, "")).status, 400, "a reason is required");
  const w = await t.withdraw(approver, "section", S16, "Test: heading found to be wrong.");
  assert.equal(w.status, 201, JSON.stringify(w.json));
  assert.equal((await t.withdraw(approver, "section", S16)).status, 409);
  const gone = await t.call("/api/legislation/vata/sections/16");
  assert.equal(gone.status, 410);
  assert.match(gone.json.error, /withdrawn.*heading found to be wrong/);
  assert.equal(gone.headers.get("Cache-Control"), "no-store", "never cached");
  assert.equal((await t.call("/api/legislation/vata")).headers.get("Cache-Control"), "no-store");
  assert.ok(!(await t.call("/api/legislation/vata/sections?pageSize=200")).json.sections.some((s) => s.id === S16), "not listed");
  assert.ok(!(await t.call("/api/legislation/search?q=16&law=vata")).json.results.some((s) => s.id === S16), "not searchable");
  const afterAi = await retrieveLegislation(t.db, "Where is the place of supply of services for VAT?", { today: "2026-11-14" });
  assert.ok(!afterAi.provisions.some((p) => p.id === S16), "the AI assistant never receives it");

  // Whole law version: the law and all its sections.
  await t.withdraw(approver, "law_version", "ug-rev-2024/tpca", "Test: whole Act withdrawn.");
  assert.equal((await t.call("/api/legislation/tpca")).status, 410);
  assert.ok(!(await t.call("/api/legislation?pageSize=100")).json.laws.some((l) => l.id === "tpca"));
  assert.ok(!(await t.call("/api/legislation/search?q=objection")).json.results.some((s) => s.lawId === "tpca"));

  // Amendment.
  await t.withdraw(approver, "amendment", VAT_THRESHOLD, "Test: amendment record withdrawn.");
  assert.ok(!(await t.call("/api/legislation/amendments")).json.amendments.some((a) => a.id === VAT_THRESHOLD));
  assert.ok(!(await retrieveAmendments(t.db, "VAT registration threshold 2026 value added tax registration", ["vata"])).some((a) => a.id === VAT_THRESHOLD));

  // Knowledge (verified first, then withdrawn): users stop seeing it.
  await t.decide(second, (await t.call("/api/challenge/review/knowledge/intl.foreign-tax-credit/decision", { token: reviewer.token, method: "POST", body: { decision: "verify", note: "Synthetic test: checked against chapter 4." } })).json.request.id);
  assert.ok((await t.call("/api/challenge/knowledge?q=foreign+tax+credit", { token: owner.token })).json.results.length);
  await t.withdraw(approver, "knowledge", "intl.foreign-tax-credit", "Test: note withdrawn.");
  assert.deepEqual((await t.call("/api/challenge/knowledge?q=foreign+tax+credit", { token: owner.token })).json.results, []);
  assert.equal((await t.one("SELECT status FROM taxcomp.knowledge_records WHERE id = 'intl.foreign-tax-credit'")).status, "draft", "the verified flag is removed too");

  // Holiday and deadline rules.
  await t.withdraw(approver, "holiday", "2026-12-25|Christmas Day", "Test: holiday date withdrawn.");
  assert.ok(!(await t.call("/api/challenge/law", { token: owner.token })).json.holidays.some((d) => d.date === "2026-12-25"));
  await t.withdraw(approver, "rule_set", "objections-2026.v1", "Test: time limits under correction.");
  const rules = await loadRuleSet(t.db);
  assert.ok(rules.withdrawn, "the withdrawn set is returned (the seed rules are not used instead)");
  const deadlines = computeDeadlines({ today: "2026-11-14", dateServed: "2026-11-01", objectionFiledOn: null, decisionServedOn: null, taxAssessed: 1000000, taxNotInDispute: 0 }, rules);
  assert.deepEqual([deadlines.objection.dueDate, deadlines.objection.daysLeft, deadlines.tatPayment.amount], [null, null, null], "no dates are computed");
  assert.match(deadlines.objection.message, /withdrawn the deadline rules/);

  // Calculators: public list, the impact tool and the browser check.
  await t.withdraw(approver, "calculator_rules", "UG-FY2026-27-v1#paye", "Test: PAYE bands under correction.");
  assert.equal((await t.withdraw(approver, "calculator_rules", "UG-FY9999-v1", "Test: unknown rule set.")).status, 404);
  const list = await t.call("/api/legislation/withdrawals");
  assert.equal(list.status, 200);
  assert.equal(list.headers.get("Cache-Control"), "no-store");
  assert.ok(list.json.withdrawals.some((x) => x.entityType === "calculator_rules" && x.entityId === "UG-FY2026-27-v1#paye"));
  assert.ok(list.json.withdrawals.every((x) => !("withdrawnBy" in x)), "reviewer identities are not published");
  const impact = await t.call("/api/impact", { method: "POST", body: { scenario: "paye_change" } });
  assert.equal(impact.status, 200);
  assert.equal(impact.json.status, "withdrawn");
  assert.deepEqual(impact.json.outcomes, [], "no figures");
  legalStatus.setWithdrawals(list.json.withdrawals);
  assert.ok(legalStatus.calculatorBlock("paye", "UG-FY2026-27-v1"), "the PAYE calculator is blocked");
  assert.equal(legalStatus.calculatorBlock("vat", "UG-FY2026-27-v1"), null, "other calculators still work");

  // Overview shows withdrawn material to reviewers.
  const overview = (await t.call("/api/challenge/review/register", { token: reviewer.token })).json;
  assert.equal(overview.withdrawn.length, 7);

  // Reinstatement: prepared by one, approved by another; the record returns as pending verification, not verified.
  const reinstate = await t.submit(reviewer, { entityType: "section", entityId: S16, action: "reinstate", legalCategory: "act", sourceUrl: "https://ulrc.go.ug/test/vata", evidenceNote: "Test: corrected heading checked." });
  assert.equal(reinstate.status, 201);
  assert.equal((await t.call("/api/legislation/vata/sections/16")).status, 410, "still withdrawn until approved");
  assert.equal((await t.decide(reviewer, reinstate.json.request.id)).status, 403);
  assert.equal((await t.decide(second, reinstate.json.request.id)).status, 200);
  const back = await t.call("/api/legislation/vata/sections/16");
  assert.equal(back.status, 200);
  assert.equal(back.json.section.legalClass, "pending_verification", "reinstated material needs a fresh verification");
  await t.pg.close();
});

test("audit trail: every action is recorded in a hash chain; tampering is detected", async () => {
  const t = await setup();
  const reviewer = await t.person("reviewer@example.com");
  const approver = await t.person("approver@example.com", { approver: true });
  const id = (await t.submit(reviewer, sectionEvidence)).json.request.id;
  await t.decide(approver, id);
  await t.withdraw(approver, "section", S16, "Test: withdrawn after verification.");
  const rows = (await t.pg.query("SELECT seq, action, actor_user_id AS actor, entity_id AS e, prev_hash, hash FROM taxcomp.legal_audit_log ORDER BY seq")).rows;
  assert.deepEqual(rows.map((r) => [r.seq, r.action, r.actor]), [[1, "request.submit", reviewer.userId], [2, "request.approve", approver.userId], [3, "entity.withdraw", approver.userId]]);
  assert.equal(rows[0].prev_hash, "genesis");
  assert.equal(rows[1].prev_hash, rows[0].hash);
  assert.deepEqual(await verifyAuditChain(t.db), { entries: 3, intact: true, brokenAt: null });
  await assert.rejects(t.pg.query("UPDATE taxcomp.legal_audit_log SET action = 'request.reject' WHERE seq = 2"), /legal_record_protected/);
  await assert.rejects(t.pg.query("DELETE FROM taxcomp.legal_audit_log WHERE seq = 3"), /legal_record_protected/);
  await t.pg.exec("SET ROLE taxcomp_worker");
  await assert.rejects(t.pg.query("DELETE FROM taxcomp.legal_audit_log"), /permission denied/, "the Worker role has no DELETE");
  await t.pg.exec("RESET ROLE");
  // A database owner who switches the protection off and edits a row is caught by the chain.
  await t.pg.exec("ALTER TABLE taxcomp.legal_audit_log DISABLE TRIGGER legal_audit_log_protect");
  await t.pg.query("UPDATE taxcomp.legal_audit_log SET details_json = '{}' WHERE seq = 2");
  await t.pg.exec("ALTER TABLE taxcomp.legal_audit_log ENABLE TRIGGER legal_audit_log_protect");
  assert.deepEqual(await verifyAuditChain(t.db), { entries: 3, intact: false, brokenAt: 2 });
  const overview = (await t.call("/api/challenge/review/register", { token: reviewer.token })).json;
  assert.equal(overview.audit.intact, false, "reviewers are told");
  await t.pg.close();
});
