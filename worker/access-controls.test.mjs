// Phase 2c (migration 20261114000200): per-person admin sign-in with two-step
// verification (N8, M4), the security event log, and the evidence-based launch
// gates (M2). People and evidence here are synthetic test data.
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { handleRequest } from "./index.mjs";
import { clearSupabaseKeyCache } from "./supabase-auth.mjs";
import { createMigratedDatabase } from "./pglite-test-support.mjs";
import { createFakeSupabase } from "./supabase-test-fakes.mjs";
import { listGates, verifyGateChain } from "./launch-gates.mjs";
import { getCommercialLaunchReadiness, requiredLaunchApprovals } from "./commercial-governance.mjs";

const SHARED = "s".repeat(40);

async function setup(extraEnv = {}) {
  clearSupabaseKeyCache();
  const { pg, db } = await createMigratedDatabase();
  const supabase = await createFakeSupabase(pg);
  const env = {
    UNANSWERED_QUESTIONS: db, DATABASE_PROVIDER: "supabase", SUPABASE_URL: supabase.url, SUPABASE_FETCH: supabase.fetch,
    SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test_key_000000000000", CHAT_LIMITER: { limit: async () => ({ success: true }) },
    ADMIN_DASHBOARD_TOKEN: SHARED, ...extraEnv,
  };
  const call = async (path, { token, method = "GET", body } = {}) => {
    const headers = { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { "Content-Type": "application/json" } : {}) };
    const response = await handleRequest(new Request(`https://worker.example${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined }), env);
    const type = response.headers.get("Content-Type") || "";
    return { status: response.status, json: type.includes("json") ? await response.json() : null, text: type.includes("html") ? await response.text() : null, headers: response.headers };
  };
  // Administrators are added by the database owner (never by the Worker), as here.
  const admin = async (email, { operate = 1, manage = 0, approve = 0, aal = "aal2", name } = {}) => {
    const user = await supabase.issueToken({ email, aal });
    await pg.query(`INSERT INTO taxcomp.admin_users (user_id, email, display_name, can_operate, can_manage_gates, can_approve_gates, added_by, added_at)
      VALUES ($1, $2, $3, $4, $5, $6, 'test owner', now()::text)`, [user.userId, email, name ?? email.split("@")[0], operate, manage, approve]);
    return user;
  };
  const events = async (type) => (await pg.query("SELECT outcome, actor_user_id, details_json FROM taxcomp.security_events WHERE event_type = $1", [type])).rows;
  return { pg, db, env, supabase, call, admin, events };
}

test("N8: admin APIs need a named administrator signed in with two-step verification", async () => {
  const t = await setup();
  const stranger = await t.supabase.issueToken({ email: "stranger@example.com", aal: "aal2" });
  const notAdmin = await t.call("/admin/questions", { token: stranger.token });
  assert.equal(notAdmin.status, 403);
  assert.deepEqual((await t.events("admin.signin")).map((e) => [e.outcome, JSON.parse(e.details_json).reason]), [["refused", "not_an_admin"]]);

  const weak = await t.admin("ops@example.com", { aal: "aal1" });
  const noTwoStep = await t.call("/admin/questions", { token: weak.token });
  assert.equal(noTwoStep.status, 403);
  assert.equal(noTwoStep.json.code, "mfa_required");

  const strong = await t.supabase.issueToken({ email: "ops@example.com", userId: weak.userId, aal: "aal2" });
  const questions = await t.call("/admin/questions", { token: strong.token });
  assert.equal(questions.status, 200);
  assert.deepEqual(questions.json.questions, []);
  const me = await t.call("/admin/me", { token: strong.token });
  assert.equal(me.status, 200);
  assert.deepEqual(me.json.admin, { displayName: "ops", email: "ops@example.com", canOperate: true, canManageGates: false, canApproveGates: false });

  const forged = await t.supabase.issueToken({ email: "ops@example.com", userId: weak.userId, aal: "aal2", forgeWithOtherKey: true });
  assert.equal((await t.call("/admin/questions", { token: forged.token })).status, 401);
  const expired = await t.supabase.issueToken({ email: "ops@example.com", userId: weak.userId, aal: "aal2", expiresInSeconds: -120 });
  assert.equal((await t.call("/admin/questions", { token: expired.token })).status, 401);

  // An administrator without the operations permission cannot open those areas.
  const gatesOnly = await t.admin("board@example.com", { operate: 0, approve: 1 });
  assert.equal((await t.call("/admin/questions", { token: gatesOnly.token })).status, 403);
  assert.equal((await t.call("/admin/gates/api", { token: gatesOnly.token })).status, 200);

  // Deactivated administrators are refused at once.
  await t.pg.query("UPDATE taxcomp.admin_users SET active = 0, deactivated_at = now()::text WHERE user_id = $1", [weak.userId]);
  assert.equal((await t.call("/admin/questions", { token: strong.token })).status, 403);
  await t.pg.close();
});

test("N8: the shared token works only while switched on, never for launch gates, and every use is logged", async () => {
  const off = await setup();
  assert.equal((await off.call("/admin/questions", { token: SHARED })).status, 401, "off unless ADMIN_SHARED_TOKEN_ENABLED is true");
  assert.equal(JSON.parse((await off.events("admin.shared_token"))[0].details_json).reason, "shared_token_disabled");
  await off.pg.close();

  const on = await setup({ ADMIN_SHARED_TOKEN_ENABLED: "true" });
  assert.equal((await on.call("/admin/questions", { token: SHARED })).status, 200);
  assert.equal((await on.call("/admin/questions", { token: "x".repeat(40) })).status, 401);
  const gates = await on.call("/admin/gates/api", { token: SHARED });
  assert.equal(gates.status, 401, "a shared token cannot be traced to a person, so it never reaches launch gates");
  assert.match(gates.json.error, /own administrator account/);
  assert.equal((await on.call("/admin/me", { token: SHARED })).status, 401);
  const logged = (await on.events("admin.shared_token")).map((e) => [e.outcome, JSON.parse(e.details_json).reason ?? "used"]).sort();
  assert.deepEqual(logged, [["allowed", "used"], ["refused", "named_admin_required"], ["refused", "named_admin_required"], ["refused", "wrong_token"]]);
  assert.ok(!(await on.pg.query("SELECT details_json FROM taxcomp.security_events")).rows.some((r) => r.details_json.includes(SHARED)), "tokens are never logged");
  await on.pg.close();
});

test("the Worker role can read admins but never add one, and cannot edit or delete security events", async () => {
  const t = await setup();
  await t.call("/admin/questions", { token: "y".repeat(40) });
  await t.pg.exec("SET ROLE taxcomp_worker");
  await assert.rejects(t.pg.query("INSERT INTO taxcomp.admin_users (user_id, email, display_name, added_by, added_at) VALUES ('00000000-0000-4000-8000-000000000001', 'x@example.com', 'X', 'worker', 'now')"), /permission denied/i);
  await assert.rejects(t.pg.query("UPDATE taxcomp.admin_users SET can_approve_gates = 1"), /permission denied/i);
  await assert.rejects(t.pg.query("UPDATE taxcomp.security_events SET outcome = 'allowed'"), /permission denied|append-only/i);
  await assert.rejects(t.pg.query("DELETE FROM taxcomp.security_events"), /permission denied|append-only/i);
  await assert.rejects(t.pg.query("DELETE FROM taxcomp.launch_gates"), /permission denied|cannot be deleted/i);
  await t.pg.exec("RESET ROLE");
  await assert.rejects(t.pg.query("UPDATE taxcomp.security_events SET outcome = 'allowed'"), /append-only/, "even the owner cannot edit an event");
  await t.pg.close();
});

test("M2: eight gates, none approved; evidence, a responsible person and an independent approver are required", async () => {
  const t = await setup();
  const today = new Date().toISOString().slice(0, 10);
  const gates = await listGates(t.db, today);
  assert.deepEqual(gates.map((g) => g.key), ["legal", "tax_calculation", "security", "privacy", "operations", "billing", "support", "public_launch"]);
  assert.ok(gates.every((g) => g.status === "not_started" && g.responsiblePerson === null && g.evidence.length === 0), "nothing seeded as approved, nobody invented");
  assert.ok(gates.every((g) => g.requiredEvidence.length >= 2));

  const manager = await t.admin("pm@example.com", { manage: 1 });
  const approverA = await t.admin("director@example.com", { approve: 1, name: "Director A" });
  const approverB = await t.admin("chair@example.com", { approve: 1, name: "Chair B" });
  const post = (who, key, action, body) => t.call(`/admin/gates/api/${key}/${action}`, { token: who.token, method: "POST", body });

  const ops = await t.admin("ops@example.com");
  assert.equal((await post(ops, "support", "details", { outstandingIssues: "x" })).status, 403, "operations admins cannot touch gates");

  assert.equal((await post(manager, "support", "submit", {})).status, 400, "no evidence yet");
  const added = await post(manager, "support", "details", { evidence: [{ title: "Support procedure v1", reference: "https://example.org/support.pdf", kind: "document" }] });
  assert.equal(added.status, 200);
  assert.equal(added.json.gate.status, "in_progress");
  assert.equal((await post(manager, "support", "details", { evidence: [{ title: "Bad link", reference: "http://example.org/x" }] })).status, 400, "links must be https");
  assert.equal((await post(manager, "support", "submit", {})).status, 400, "a responsible person must be named first");
  assert.equal((await post(manager, "support", "details", { responsiblePerson: "Test Person", outstandingIssues: "" })).status, 200);
  const submitted = await post(manager, "support", "submit", { note: "Ready." });
  assert.equal(submitted.json.gate.status, "evidence_submitted");
  assert.equal((await post(manager, "support", "details", { outstandingIssues: "late" })).status, 409, "frozen while awaiting a decision");

  assert.equal((await post(manager, "support", "decision", { decision: "approve", reviewBy: "2099-01-01", notes: "x" })).status, 403, "managers cannot approve");
  const later = new Date(Date.now() + 200 * 86_400_000).toISOString().slice(0, 10);
  assert.equal((await post(approverA, "support", "decision", { decision: "approve", reviewBy: today, notes: "Checked." })).status, 400, "review date must be after today");
  assert.equal((await post(approverA, "support", "decision", { decision: "approve", reviewBy: "2099-01-01", notes: "Checked." })).status, 400, "within 12 months");
  assert.equal((await post(approverA, "support", "decision", { decision: "approve", reviewBy: later })).status, 400, "notes required");
  const approved = await post(approverA, "support", "decision", { decision: "approve", reviewBy: later, notes: "Read the procedure and the contact page." });
  assert.equal(approved.status, 200, JSON.stringify(approved.json));
  assert.equal(approved.json.gate.status, "approved");
  assert.equal(approved.json.gate.approvedByName, "Director A");

  // The person who submitted the evidence can never approve it, even with approver rights.
  assert.equal((await post(approverB, "privacy", "details", { responsiblePerson: "Privacy Adviser", evidence: [{ title: "DPPA assessment", reference: "Doc ref PRIV-001" }] })).status, 200);
  assert.equal((await post(approverB, "privacy", "submit", {})).status, 200);
  const self = await post(approverB, "privacy", "decision", { decision: "approve", reviewBy: later, notes: "Mine." });
  assert.equal(self.status, 403);
  assert.match(self.json.error, /Independent approval is required/);
  const rejected = await post(approverA, "privacy", "decision", { decision: "reject", notes: "No PDPO registration evidence." });
  assert.equal(rejected.json.gate.status, "rejected");

  // Public launch waits on the other seven.
  assert.equal((await post(manager, "public_launch", "details", { responsiblePerson: "Board", evidence: [{ title: "Board minute", reference: "Minute 1" }] })).status, 200);
  assert.equal((await post(manager, "public_launch", "submit", {})).status, 200);
  const early = await post(approverA, "public_launch", "decision", { decision: "approve", reviewBy: later, notes: "Go." });
  assert.equal(early.status, 409);
  assert.match(early.json.error, /other seven gates/);

  // Revoking, and the protected history.
  assert.equal((await post(manager, "support", "revoke", { notes: "x" })).status, 403);
  const revoked = await post(approverB, "support", "revoke", { notes: "Support hours changed." });
  assert.equal(revoked.json.gate.status, "revoked");
  const history = await t.call("/admin/gates/api/support/history", { token: manager.token });
  assert.deepEqual(history.json.history.map((h) => h.action), ["evidence_recorded", "details_updated", "evidence_submitted", "approved", "revoked"]);
  const chain = await verifyGateChain(t.db);
  assert.equal(chain.ok, true);
  assert.ok(chain.events >= 10);
  const changes = await t.events("launch_gate.decision");
  assert.ok(changes.length >= 2, "decisions are also in the security event log");
  await t.pg.close();
});

test("M2: the database itself refuses unevidenced, self-approved or premature approvals, and detects tampering", async () => {
  const t = await setup();
  const ts = new Date().toISOString();
  const later = new Date(Date.now() + 100 * 86_400_000).toISOString().slice(0, 10);
  await assert.rejects(t.pg.query("UPDATE taxcomp.launch_gates SET status = 'approved', approved_by = 'a', approved_at = $1, review_by = $2 WHERE gate_key = 'legal'", [ts, later]), /cannot move from not_started to approved|launch_gate_approval_evidenced/);
  await t.pg.query("UPDATE taxcomp.launch_gates SET status = 'evidence_submitted', evidence_json = '[{\"title\":\"x\"}]', evidence_submitted_by = 'person-a', evidence_submitted_at = $1 WHERE gate_key = 'legal'", [ts]);
  await assert.rejects(t.pg.query("UPDATE taxcomp.launch_gates SET status = 'approved', approved_by = 'person-a', approved_at = $1, review_by = $2 WHERE gate_key = 'legal'", [ts, later]), /launch_gate_approval_evidenced/, "self-approval");
  await assert.rejects(t.pg.query("UPDATE taxcomp.launch_gates SET status = 'approved', approved_by = 'person-b', approved_at = $1 WHERE gate_key = 'legal'", [ts]), /launch_gate_approval_evidenced/, "no review date");
  await assert.rejects(t.pg.query("UPDATE taxcomp.launch_gates SET required_evidence_json = '[]' WHERE gate_key = 'legal'"), /fixed by migration/);
  await t.pg.query("UPDATE taxcomp.launch_gates SET status = 'evidence_submitted', evidence_json = '[{\"title\":\"x\"}]', evidence_submitted_by = 'person-a', evidence_submitted_at = $1 WHERE gate_key = 'public_launch'", [ts]);
  await assert.rejects(t.pg.query("UPDATE taxcomp.launch_gates SET status = 'approved', approved_by = 'person-b', approved_at = $1, review_by = $2 WHERE gate_key = 'public_launch'", [ts, later]), /other seven gates/);

  // Tampering with the gate history breaks the chain.
  const manager = await t.admin("pm@example.com", { manage: 1 });
  await t.call("/admin/gates/api/support/details", { token: manager.token, method: "POST", body: { outstandingIssues: "Hours not published." } });
  await t.call("/admin/gates/api/support/details", { token: manager.token, method: "POST", body: { outstandingIssues: "Hours published; SLA open." } });
  assert.equal((await verifyGateChain(t.db)).ok, true);
  await assert.rejects(t.pg.query("UPDATE taxcomp.launch_gate_events SET details_json = '{}'"), /append-only/);
  await t.pg.exec("ALTER TABLE taxcomp.launch_gate_events DISABLE TRIGGER launch_gate_events_protect");
  await t.pg.query("UPDATE taxcomp.launch_gate_events SET details_json = '{\"outstandingIssues\":\"nothing\"}' WHERE seq = 1");
  await t.pg.exec("ALTER TABLE taxcomp.launch_gate_events ENABLE TRIGGER launch_gate_events_protect");
  const broken = await verifyGateChain(t.db);
  assert.equal(broken.ok, false);
  assert.equal(broken.brokenAt, 1);
  await t.pg.close();
});

test("M2: an approval lapses on its review date, and launch readiness needs both the flags and the gates", async () => {
  const t = await setup();
  const ts = "2026-01-10T00:00:00.000Z";
  for (const key of ["legal", "tax_calculation", "security", "privacy", "operations", "billing", "support"]) {
    await t.pg.query("UPDATE taxcomp.launch_gates SET status = 'evidence_submitted', evidence_json = '[{\"title\":\"x\"}]', evidence_submitted_by = 'a', evidence_submitted_at = $1 WHERE gate_key = $2", [ts, key]);
    await t.pg.query("UPDATE taxcomp.launch_gates SET status = 'approved', approved_by = 'b', approved_at = $1, review_by = '2026-12-31' WHERE gate_key = $2", [ts, key]);
  }
  const flags = Object.fromEntries(requiredLaunchApprovals.map((name) => [name, "true"]));
  const inDate = await listGates(t.db, "2026-11-14");
  assert.equal(inDate.filter((g) => g.status === "approved").length, 7);
  assert.equal(getCommercialLaunchReadiness(flags, inDate).launchEligible, false, "public launch not yet approved");
  const lapsed = await listGates(t.db, "2027-01-01");
  assert.equal(lapsed.filter((g) => g.status === "expired").length, 7);
  assert.equal(lapsed[0].statusLabel, "Approval expired (review date passed)");
  await t.pg.close();
});

test("admin pages: per-response script nonce, Supabase sign-in allowed by CSP, no shared-token field on the gate page", async () => {
  const t = await setup({ ADMIN_SHARED_TOKEN_ENABLED: "true" });
  for (const path of ["/admin", "/admin/legal-sources", "/admin/gates", "/admin/efris"]) {
    const page = await t.call(path);
    assert.equal(page.status, 200, path);
    const csp = page.headers.get("Content-Security-Policy");
    const nonce = page.text.match(/<script nonce="([A-Za-z0-9]+)">/)?.[1];
    assert.ok(nonce, `${path} has a nonce`);
    assert.match(csp, new RegExp(`script-src 'nonce-${nonce}';`), path);
    assert.match(csp, new RegExp(`connect-src 'self' ${t.env.SUPABASE_URL.replace(/[.:/]/g, "\\$&")}`), path);
    assert.match(csp, /frame-ancestors 'none'/);
    assert.match(page.text, /autocomplete="one-time-code"/, `${path} asks for the two-step code`);
    const start = page.text.indexOf(">", page.text.indexOf("<script nonce=")) + 1;
    const script = page.text.slice(start, page.text.indexOf("</script>", start));
    assert.doesNotThrow(() => execFileSync(process.execPath, ["--check", "-"], { input: script, encoding: "utf8" }), `${path} script parses`);
    assert.equal(page.text.includes("Shared admin token"), path !== "/admin/gates", `${path} shared-token field`);
  }
  await t.pg.close();
});
