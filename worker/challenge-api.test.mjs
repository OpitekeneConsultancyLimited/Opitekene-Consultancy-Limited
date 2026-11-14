// Challenge an Assessment API on a real Postgres (PGlite) with real ES256
// Supabase tokens and the fake Supabase Storage. Covers the brief's
// cross-user / signed-out tests (required fix 2), uploads, deletion, audit,
// the deadline banners (DL-1/2/3), LAW-1 and REV-1 end to end.
import test from "node:test";
import assert from "node:assert/strict";
import { handleRequest } from "./index.mjs";
import { clearSupabaseKeyCache } from "./supabase-auth.mjs";
import { createMigratedDatabase } from "./pglite-test-support.mjs";
import { createFakeSupabase } from "./supabase-test-fakes.mjs";

const origin = "https://taxcomp.example.invalid";
const NOW = new Date("2026-11-10T09:00:00Z");
const NOTICE = `UGANDA REVENUE AUTHORITY
NOTICE OF ADDITIONAL ASSESSMENT - INCOME TAX
TIN: 1000123456
Tax period: 01/07/2026 to 31/07/2026
Date of assessment: 15/09/2026
Principal tax: UGX 18,400,000
Penal tax at 20%: UGX 3,680,000
Interest at 2% per month for 6 months: UGX 2,208,000
Total amount due: UGX 24,288,000
Reasons: Expenses claimed were not supported by invoices.

Issued under section 22 of the Tax Procedures Code Act.`;

// A stand-in for the ClamAV scanner: flags any file containing this marker
// (never the real EICAR string, which antivirus on a developer PC would quarantine).
export const FAKE_MALWARE_MARKER = "TAXCOMP-TEST-MALWARE-MARKER";
function fakeScanner(state) {
  return {
    async fetch(_url, init) {
      state.scans += 1;
      if (state.mode === "down") throw new Error("scanner unreachable");
      if (state.mode === "error") return new Response("bad gateway", { status: 502 });
      const text = new TextDecoder().decode(init.body);
      return Response.json(text.includes(FAKE_MALWARE_MARKER) ? { clean: false, signature: "Test.Marker" } : { clean: true });
    },
  };
}

async function setup({ storage = true, scanner = "up" } = {}) {
  clearSupabaseKeyCache();
  const { pg, db } = await createMigratedDatabase();
  const supabase = await createFakeSupabase(pg);
  const scan = { scans: 0, mode: scanner };
  const env = {
    UNANSWERED_QUESTIONS: db, DATABASE_PROVIDER: "supabase", ALLOWED_ORIGIN: origin,
    SUPABASE_URL: supabase.url, SUPABASE_FETCH: supabase.fetch,
    ...(storage ? { SUPABASE_SERVICE_ROLE_KEY: supabase.serviceKey } : {}),
    ...(scanner !== "none" ? { PHASE6_MALWARE_SCANNER: fakeScanner(scan) } : {}),
    CHAT_LIMITER: { limit: async () => ({ success: true }) },
    CHALLENGE_CLOCK: () => NOW,
  };
  const call = async (path, { method = "GET", body, token, raw, contentType, headers = {}, originValue = origin } = {}) => {
    const init = { method, headers: { ...headers } };
    if (originValue) init.headers.Origin = originValue;
    if (token) init.headers.Authorization = `Bearer ${token}`;
    if (raw !== undefined) { init.headers["Content-Type"] = contentType; init.body = raw; }
    else if (body !== undefined) { init.headers["Content-Type"] = "application/json"; init.body = JSON.stringify(body); }
    const response = await handleRequest(new Request(`https://worker.example${path}`, init), env);
    const type = response.headers.get("Content-Type") || "";
    return { status: response.status, body: type.includes("json") ? await response.json() : new Uint8Array(await response.arrayBuffer()), headers: response.headers };
  };
  const user = async (email) => {
    const { token, userId } = await supabase.issueToken({ email, aal: "aal2" });
    return { token, userId };
  };
  return { pg, db, env, supabase, call, user, scan };
}

async function newCase(t, who) {
  await t.call("/api/challenge/consent", { method: "POST", token: who.token, body: { version: "2026-11-10", accept: true } });
  const created = await t.call("/api/challenge/cases", { method: "POST", token: who.token });
  assert.equal(created.status, 201);
  return created.body.view.case.id;
}

async function confirmAll(t, who, caseId) {
  const read = await t.call(`/api/challenge/cases/${caseId}/read`, { method: "POST", token: who.token, body: { text: NOTICE } });
  assert.equal(read.status, 200, JSON.stringify(read.body));
  const fields = read.body.view.confirmations.filter((f) => f.extractedValue !== null).map((f) => ({ field: f.fieldName, action: "confirm" }));
  const done = await t.call(`/api/challenge/cases/${caseId}/fields`, { method: "POST", token: who.token, body: { fields } });
  assert.equal(done.status, 200, JSON.stringify(done.body));
  return done.body.view;
}

test("signed-out visitors and foreign origins get nothing", async () => {
  const t = await setup();
  for (const [path, method] of [["/api/challenge/me", "GET"], ["/api/challenge/cases", "POST"], ["/api/challenge/law", "GET"], ["/api/challenge/case-law", "GET"],
    ["/api/challenge/cases/00000000-0000-4000-8000-000000000000", "GET"], ["/api/challenge/review/queue", "GET"]]) {
    assert.equal((await t.call(path, { method })).status, 401, `${method} ${path}`);
  }
  const owner = await t.user("owner@example.com");
  assert.equal((await t.call("/api/challenge/me", { token: owner.token, originValue: "https://evil.example" })).status, 403);
  const forged = await t.supabase.issueToken({ email: "x@example.com", forgeWithOtherKey: true });
  assert.equal((await t.call("/api/challenge/me", { token: forged.token })).status, 401);
  await t.pg.close();
});

test("consent is required before the first case; the record uses confirmed figures only", async () => {
  const t = await setup();
  const owner = await t.user("owner@example.com");
  assert.equal((await t.call("/api/challenge/cases", { method: "POST", token: owner.token })).status, 428);
  const caseId = await newCase(t, owner);
  const read = await t.call(`/api/challenge/cases/${caseId}/read`, { method: "POST", token: owner.token, body: { text: NOTICE } });
  assert.equal(read.body.source, "text-reader", "no AI key configured: built-in reader");
  assert.equal(read.body.view.case.principal, null, "nothing is used before confirmation");
  assert.equal(read.body.view.readyForAnalysis, false);
  assert.ok(read.body.view.pendingFields.includes("principal"));
  const view = await confirmAll(t, owner, caseId);
  assert.equal(view.case.principal, 18_400_000);
  assert.equal(view.readyForAnalysis, true);
  assert.match(view.explanation.owner[0], /URA says you owe UGX 24,288,000 in income tax/);
  // Corrections are validated.
  assert.equal((await t.call(`/api/challenge/cases/${caseId}/fields`, { method: "POST", token: owner.token, body: { fields: [{ field: "period_end", action: "correct", value: "31/07/2026" }] } })).status, 400);
  const corrected = await t.call(`/api/challenge/cases/${caseId}/fields`, { method: "POST", token: owner.token, body: { fields: [{ field: "principal", action: "correct", value: "17000000" }] } });
  assert.equal(corrected.body.view.case.principal, 17_000_000);
  await t.pg.close();
});

test("DL-1 / DL-2 / DL-3 through the API, and LAW-1 on the case", async () => {
  const t = await setup();
  const owner = await t.user("owner@example.com");
  const caseId = await newCase(t, owner);
  let view = await confirmAll(t, owner, caseId);
  assert.equal(view.deadlines.objection.state, "unknown", "DL-3");
  assert.match(view.nextStep, /date you received the notice/);
  assert.equal((await t.call(`/api/challenge/cases/${caseId}`, { method: "PATCH", token: owner.token, body: { dateServed: "2026-12-01" } })).status, 400, "no future dates");
  view = (await t.call(`/api/challenge/cases/${caseId}`, { method: "PATCH", token: owner.token, body: { dateServed: "2026-10-01", serviceMethod: "email" } })).body.view;
  assert.equal(view.deadlines.objection.daysLeft, 5, "DL-1");
  assert.equal(view.deadlines.objection.state, "urgent");
  assert.equal(view.deadlines.provisionalLabel, "Provisional: rules pending legal review");
  view = (await t.call(`/api/challenge/cases/${caseId}`, { method: "PATCH", token: owner.token, body: { dateServed: "2026-09-21" } })).body.view;
  assert.equal(view.deadlines.objection.state, "possibly_lapsed", "DL-2");
  assert.equal(view.deadlines.lateObjection.offered, true);
  assert.equal(view.review.required, true);
  assert.ok(view.review.reasons.some((r) => r.code === "deadline-lapsed"));
  // LAW-1 on the case (July 2026 income tax).
  assert.deepEqual(view.law.amendmentsApplied.map((a) => a.id).sort(), ["ita-amendment-2026", "tpca-amendment-2026"]);
  assert.ok(view.law.notes.some((n) => /assented on 20 August 2026/.test(n.text)));
  const law = await t.call("/api/challenge/law?taxHead=income_tax&periodStart=2026-07-01&periodEnd=2026-07-31", { token: owner.token });
  assert.ok(law.body.resolution.notes.some((n) => /20 August 2026/.test(n.text)));
  assert.equal(law.body.ruleSet.approvedForComputation, false, "seed rules are never approved");
  await t.pg.close();
});

test("a second user cannot read, change, delete or download another user's case (required fix 2)", async () => {
  const t = await setup();
  const owner = await t.user("owner@example.com");
  const other = await t.user("other@example.com");
  const caseId = await newCase(t, owner);
  await confirmAll(t, owner, caseId);
  const upload = await t.call(`/api/challenge/cases/${caseId}/documents`, { method: "POST", token: owner.token, raw: new TextEncoder().encode("%PDF-1.7 synthetic"), contentType: "application/pdf", headers: { "X-Document-Type": "assessment", "X-File-Name": "notice.pdf" } });
  assert.equal(upload.status, 201);
  const docId = upload.body.document.id;
  await newCase(t, other);
  const attempts = [
    [`/api/challenge/cases/${caseId}`, "GET"], [`/api/challenge/cases/${caseId}`, "PATCH", { dateServed: "2026-10-01" }], [`/api/challenge/cases/${caseId}`, "DELETE"],
    [`/api/challenge/cases/${caseId}/fields`, "POST", { fields: [{ field: "principal", action: "correct", value: "1" }] }],
    [`/api/challenge/cases/${caseId}/items`, "PUT", { items: [] }], [`/api/challenge/cases/${caseId}/read`, "POST", { text: NOTICE }],
    [`/api/challenge/cases/${caseId}/pack`, "GET"], [`/api/challenge/cases/${caseId}/documents/${docId}`, "GET"],
  ];
  for (const [path, method, body] of attempts) {
    assert.equal((await t.call(path, { method, token: other.token, body })).status, 404, `${method} ${path}`);
  }
  const mine = await t.call("/api/challenge/me", { token: other.token });
  assert.equal(mine.body.cases.length, 1);
  assert.ok(!mine.body.cases.some((c) => c.id === caseId));
  const still = await t.call(`/api/challenge/cases/${caseId}`, { token: owner.token });
  assert.equal(still.body.view.case.principal, 18_400_000, "unchanged");
  // A reviewer who is not assigned to the case cannot see it either.
  const reviewer = await t.user("reviewer@example.com");
  await t.pg.query("INSERT INTO taxcomp.challenge_reviewers (user_id, email, created_at) VALUES ($1, $2, $3)", [reviewer.userId, "reviewer@example.com", NOW.toISOString()]);
  assert.equal((await t.call(`/api/challenge/cases/${caseId}`, { token: reviewer.token })).status, 404);
  assert.equal((await t.call("/api/challenge/review/queue", { token: owner.token })).status, 403);
  await t.pg.close();
});

test("the public API roles cannot read any TaxComp table, old or new", async () => {
  const t = await setup();
  // Worst case: someone exposes the schema to the Data API.
  await t.pg.exec("GRANT USAGE ON SCHEMA taxcomp TO anon, authenticated");
  for (const role of ["anon", "authenticated"]) {
    for (const table of ["challenge_cases", "challenge_documents", "challenge_audit_log", "law_provision_versions", "billing_accounts", "phase6_clients", "phase6_documents", "phase6_audit_log", "unanswered_questions"]) {
      await t.pg.exec(`SET ROLE ${role}`);
      await assert.rejects(t.pg.query(`SELECT * FROM taxcomp.${table} LIMIT 1`), /permission denied/, `${role} ${table}`);
      await assert.rejects(t.pg.query(`DELETE FROM taxcomp.${table}`), /permission denied/, `${role} delete ${table}`);
      await t.pg.exec("RESET ROLE");
    }
  }
  const grants = await t.pg.query(`SELECT count(*)::int AS n FROM information_schema.role_table_grants WHERE table_schema = 'taxcomp' AND grantee IN ('anon', 'authenticated')`);
  assert.equal(grants.rows[0].n, 0);
  const buckets = await t.pg.query("SELECT id, public FROM storage.buckets ORDER BY id");
  assert.deepEqual(buckets.rows, [{ id: "assessment-documents", public: false }, { id: "phase6-documents", public: false }]);
  await t.pg.close();
});

test("uploads are type-checked, stored per owner folder, and one-click delete removes rows and files but keeps the audit trail", async () => {
  const t = await setup();
  const owner = await t.user("owner@example.com");
  const caseId = await newCase(t, owner);
  const bad = await t.call(`/api/challenge/cases/${caseId}/documents`, { method: "POST", token: owner.token, raw: new TextEncoder().encode("not a pdf"), contentType: "application/pdf", headers: { "X-Document-Type": "assessment" } });
  assert.equal(bad.status, 415);
  assert.equal((await t.call(`/api/challenge/cases/${caseId}/documents`, { method: "POST", token: owner.token, raw: new Uint8Array([1, 2]), contentType: "application/zip" })).status, 415);
  const ok = await t.call(`/api/challenge/cases/${caseId}/documents`, { method: "POST", token: owner.token, raw: new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]), contentType: "image/jpeg", headers: { "X-Document-Type": "assessment", "X-File-Name": encodeURIComponent("phone photo.jpg") } });
  assert.equal(ok.status, 201);
  const key = `assessment-documents/${owner.userId}/${caseId}/${ok.body.document.id}`;
  assert.ok(t.supabase.objects.has(key), "stored under the owner's folder in the private bucket");
  const download = await t.call(`/api/challenge/cases/${caseId}/documents/${ok.body.document.id}`, { token: owner.token });
  assert.equal(download.status, 200);
  assert.deepEqual([...download.body], [0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
  // A photo cannot be read without an AI provider: clean error, no raw output.
  const read = await t.call(`/api/challenge/cases/${caseId}/read`, { method: "POST", token: owner.token, body: { documentId: ok.body.document.id } });
  assert.equal(read.status, 422);
  assert.match(read.body.error, /could not read this file automatically/);
  const deleted = await t.call(`/api/challenge/cases/${caseId}`, { method: "DELETE", token: owner.token });
  assert.equal(deleted.status, 200);
  assert.ok(!t.supabase.objects.has(key), "file deleted");
  for (const table of ["challenge_cases", "challenge_documents", "challenge_field_confirmations"]) {
    const n = await t.pg.query(`SELECT count(*)::int AS n FROM taxcomp.${table}`);
    assert.equal(n.rows[0].n, 0, table);
  }
  const trail = await t.pg.query("SELECT action FROM taxcomp.challenge_audit_log WHERE case_id = $1 ORDER BY occurred_at, action", [caseId]);
  assert.ok(trail.rows.map((r) => r.action).includes("case.delete"));
  await t.pg.close();
});

test("N17: every upload is malware-scanned before storage; infected files and scanner outages store nothing", async () => {
  const t = await setup();
  const owner = await t.user("owner@example.com");
  const caseId = await newCase(t, owner);
  const upload = (text) => t.call(`/api/challenge/cases/${caseId}/documents`, { method: "POST", token: owner.token, raw: new TextEncoder().encode(text), contentType: "text/plain", headers: { "X-Document-Type": "correspondence" } });
  const objectsBefore = t.supabase.objects.size;

  const clean = await upload("Letter from URA about the assessment.");
  assert.equal(clean.status, 201);
  assert.equal(t.scan.scans, 1, "scanned once, before storage");
  const stored = await t.pg.query("SELECT scan_status, sha256 FROM taxcomp.challenge_documents WHERE id = $1", [clean.body.document.id]);
  assert.equal(stored.rows[0].scan_status, "clean");
  assert.match(stored.rows[0].sha256, /^[0-9a-f]{64}$/);

  const infected = await upload(`Looks harmless ${FAKE_MALWARE_MARKER}`);
  assert.equal(infected.status, 422);
  assert.match(infected.body.error, /failed the malware check and was not saved/);
  assert.equal(t.supabase.objects.size, objectsBefore + 1, "the infected file never reached storage");

  t.scan.mode = "down";
  const outage = await upload("Another letter.");
  assert.equal(outage.status, 503, "fails safe when the scanner cannot be reached");
  assert.match(outage.body.error, /not available right now, so the file was not saved/);
  t.scan.mode = "error";
  assert.equal((await upload("And another.")).status, 503, "a scanner error is not treated as clean");
  assert.equal(t.supabase.objects.size, objectsBefore + 1);
  const rows = await t.pg.query("SELECT count(*)::int AS n FROM taxcomp.challenge_documents WHERE case_id = $1", [caseId]);
  assert.equal(rows.rows[0].n, 1);

  const trail = await t.pg.query("SELECT details_json FROM taxcomp.challenge_audit_log WHERE case_id = $1 AND action = 'document.rejected' ORDER BY occurred_at", [caseId]);
  // The test clock is frozen, so compare as sorted lists.
  assert.deepEqual(trail.rows.map((r) => JSON.parse(r.details_json).scan).sort(), ["infected", "unavailable", "unavailable"]);
  const events = await t.pg.query("SELECT outcome, details_json FROM taxcomp.security_events WHERE event_type = 'upload.scan'");
  assert.deepEqual(events.rows.map((r) => r.outcome).sort(), ["error", "error", "refused"]);
  assert.ok(!events.rows.some((r) => r.details_json.includes("Looks harmless")), "file contents are never logged");

  // A record that never passed a scan (for example from before this check) is neither served nor read.
  await t.pg.query(`INSERT INTO taxcomp.challenge_documents (id, case_id, owner_user_id, storage_path, doc_type, file_name, content_type, size_bytes, uploaded_at)
    VALUES ('00000000-0000-4000-8000-0000000000aa', $1, $2, 'x/y/z', 'other', 'old.txt', 'text/plain', 3, $3)`, [caseId, owner.userId, NOW.toISOString()]);
  const oldDownload = await t.call(`/api/challenge/cases/${caseId}/documents/00000000-0000-4000-8000-0000000000aa`, { token: owner.token });
  assert.equal(oldDownload.status, 409);
  const oldRead = await t.call(`/api/challenge/cases/${caseId}/read`, { method: "POST", token: owner.token, body: { documentId: "00000000-0000-4000-8000-0000000000aa" } });
  assert.equal(oldRead.status, 409);
  await t.pg.close();
});

test("N17: with storage but no scanner, uploads stay switched off", async () => {
  const t = await setup({ scanner: "none" });
  const owner = await t.user("owner@example.com");
  const caseId = await newCase(t, owner);
  assert.equal((await t.call("/api/challenge/me", { token: owner.token })).body.uploadsEnabled, false);
  const res = await t.call(`/api/challenge/cases/${caseId}/documents`, { method: "POST", token: owner.token, raw: new TextEncoder().encode("%PDF-1.7"), contentType: "application/pdf" });
  assert.equal(res.status, 503);
  assert.match(res.body.error, /paused until malware scanning is switched on/);
  assert.equal(t.supabase.objects.size, 0);
  await t.pg.close();
});

test("M4: staff need two-step sign-in; without it a reviewer is an ordinary user and is told why", async () => {
  const t = await setup();
  const owner = await t.user("owner@example.com");
  const caseId = await newCase(t, owner);
  const weak = await t.supabase.issueToken({ email: "reviewer@example.com", aal: "aal1" });
  await t.pg.query("INSERT INTO taxcomp.challenge_reviewers (user_id, email, can_approve_law, created_at) VALUES ($1, $2, 1, $3)", [weak.userId, "reviewer@example.com", NOW.toISOString()]);
  await t.pg.query("UPDATE taxcomp.challenge_cases SET assigned_reviewer_id = $1 WHERE id = $2", [weak.userId, caseId]);

  const me = await t.call("/api/challenge/me", { token: weak.token });
  assert.equal(me.body.reviewer, false);
  assert.equal(me.body.canApproveLaw, false);
  assert.equal(me.body.staffMfaRequired, true);
  assert.match(me.body.staffMfaMessage, /two-step sign-in/);
  const queue = await t.call("/api/challenge/review/queue", { token: weak.token });
  assert.equal(queue.status, 403);
  assert.equal(queue.body.code, "mfa_required");
  assert.equal((await t.call(`/api/challenge/cases/${caseId}`, { token: weak.token })).status, 404, "an assigned case is hidden until two-step sign-in");
  const refused = await t.pg.query("SELECT outcome, actor_user_id FROM taxcomp.security_events WHERE event_type = 'staff.mfa'");
  assert.equal(refused.rows.length, 1);
  assert.equal(refused.rows[0].actor_user_id, weak.userId);

  const strong = await t.supabase.issueToken({ email: "reviewer@example.com", userId: weak.userId, aal: "aal2" });
  assert.equal((await t.call("/api/challenge/review/queue", { token: strong.token })).status, 200);
  assert.equal((await t.call(`/api/challenge/cases/${caseId}`, { token: strong.token })).status, 200);
  assert.equal((await t.call("/api/challenge/me", { token: strong.token })).body.staffMfaRequired, false);
  // Owners never need it.
  const plain = await t.supabase.issueToken({ email: "owner@example.com", userId: owner.userId, aal: "aal1" });
  assert.equal((await t.call(`/api/challenge/cases/${caseId}`, { token: plain.token })).status, 200);
  await t.pg.close();
});

test("uploads answer 503 (not a crash) when storage is not configured", async () => {
  const t = await setup({ storage: false });
  const owner = await t.user("owner@example.com");
  const caseId = await newCase(t, owner);
  const res = await t.call(`/api/challenge/cases/${caseId}/documents`, { method: "POST", token: owner.token, raw: new TextEncoder().encode("%PDF-1.7"), contentType: "application/pdf" });
  assert.equal(res.status, 503);
  assert.equal((await t.call("/api/challenge/me", { token: owner.token })).body.uploadsEnabled, false);
  await t.pg.close();
});

test("REV-1: disputed principal above the threshold blocks the pack until a reviewer signs off; staff actions are audited", async () => {
  const t = await setup();
  const owner = await t.user("owner@example.com");
  const reviewer = await t.user("reviewer@example.com");
  await t.pg.query("INSERT INTO taxcomp.challenge_reviewers (user_id, email, created_at) VALUES ($1, $2, $3)", [reviewer.userId, "reviewer@example.com", NOW.toISOString()]);
  const caseId = await newCase(t, owner);
  await confirmAll(t, owner, caseId);
  // Free plan: pack blocked by plan.
  assert.deepEqual((await t.call(`/api/challenge/cases/${caseId}/pack`, { token: owner.token })).body.blockedBecause, ["plan"]);
  // Paid plan (self-service).
  await t.pg.query("INSERT INTO taxcomp.billing_accounts (user_id, email, created_at, updated_at) VALUES ($1, 'owner@example.com', $2, $2)", [owner.userId, NOW.toISOString()]);
  await t.pg.query(`INSERT INTO taxcomp.billing_subscriptions (id, user_id, plan_id, status, current_period_start, current_period_end, created_at, updated_at)
    VALUES ('s1', $1, 'individual-monthly', 'active', '2026-11-01T00:00:00.000Z', '2026-12-01T00:00:00.000Z', $2, $2)`, [owner.userId, NOW.toISOString()]);
  await t.call(`/api/challenge/cases/${caseId}`, { method: "PATCH", token: owner.token, body: { dateServed: "2026-10-20" } });
  const small = await t.call(`/api/challenge/cases/${caseId}/pack`, { token: owner.token });
  assert.equal(small.status, 200, "below the threshold: self-service pack");
  assert.equal(small.body.pack.documents[0].id, "objection-letter", "DL-1: the objection is the first item in the pack");
  // Raise the disputed principal above UGX 50,000,000.
  const big = await t.call(`/api/challenge/cases/${caseId}/fields`, { method: "POST", token: owner.token, body: { fields: [{ field: "principal", action: "correct", value: "75000000" }] } });
  assert.equal(big.body.view.review.required, true);
  assert.equal(big.body.view.case.assignedReviewerId, reviewer.userId, "assigned to the reviewer");
  const blocked = await t.call(`/api/challenge/cases/${caseId}/pack`, { token: owner.token });
  assert.equal(blocked.status, 403);
  assert.deepEqual(blocked.body.blockedBecause, ["review"]);
  // Free outputs stay available on the record.
  const record = await t.call(`/api/challenge/cases/${caseId}`, { token: owner.token });
  assert.ok(record.body.view.checklist.length >= 5 && record.body.view.explanation.owner.length && record.body.view.deadlines.objection);
  // Reviewer queue, view and sign-off.
  const queue = await t.call("/api/challenge/review/queue", { token: reviewer.token });
  assert.deepEqual(queue.body.cases.map((c) => c.id), [caseId]);
  assert.equal((await t.call(`/api/challenge/cases/${caseId}`, { token: reviewer.token })).status, 200);
  const signed = await t.call(`/api/challenge/review/cases/${caseId}`, { method: "POST", token: reviewer.token, body: { decision: "approve", note: "Checked grounds and dates." } });
  assert.equal(signed.body.view.review.signedOff, true);
  const pack = await t.call(`/api/challenge/cases/${caseId}/pack`, { token: owner.token });
  assert.equal(pack.status, 200);
  // Any later change re-opens review.
  await t.call(`/api/challenge/cases/${caseId}`, { method: "PATCH", token: owner.token, body: { taxAccepted: 1000000 } });
  assert.equal((await t.call(`/api/challenge/cases/${caseId}/pack`, { token: owner.token })).status, 403);
  const trail = await t.pg.query("SELECT actor_role AS role, action FROM taxcomp.challenge_audit_log WHERE case_id = $1 AND actor_role = 'reviewer' ORDER BY occurred_at", [caseId]);
  assert.deepEqual(trail.rows.map((r) => r.action).sort(), ["case.view", "review.signoff"]);
  // The audit log is append-only for the Worker role.
  await t.pg.exec("SET ROLE taxcomp_worker");
  await assert.rejects(t.pg.query("DELETE FROM taxcomp.challenge_audit_log"), /permission denied/);
  await assert.rejects(t.pg.query("UPDATE taxcomp.challenge_audit_log SET action = 'x'"), /permission denied/);
  await t.pg.exec("RESET ROLE");
  await t.pg.close();
});

test("approving law or rules needs two people: a reviewer prepares, a different approver decides; text must be real", async () => {
  const t = await setup();
  const reviewer = await t.user("reviewer@example.com");
  const approver = await t.user("approver@example.com");
  await t.pg.query("INSERT INTO taxcomp.challenge_reviewers (user_id, email, created_at) VALUES ($1, $2, $3)", [reviewer.userId, "reviewer@example.com", NOW.toISOString()]);
  const decide = (who, id, decision = "approve") => t.call(`/api/challenge/review/register/requests/${id}/decision`, { method: "POST", token: who.token, body: { decision, note: "Checked against the Act." } });
  // Rules: prepared by the reviewer (202), never applied by them.
  const rules = await t.call("/api/challenge/review/rules/objections-2026.v1/approve", { method: "POST", token: reviewer.token, body: {} });
  assert.equal(rules.status, 202, JSON.stringify(rules.body));
  assert.equal((await decide(reviewer, rules.body.request.id)).status, 403, "a reviewer without approver rights cannot decide");
  assert.equal((await t.call("/api/challenge/review/law/tpca.interest.2026", { method: "POST", token: reviewer.token, body: { text: "TODO_VERIFY: paste" } })).status, 400);
  assert.equal((await t.call("/api/challenge/review/law/tpca.interest.2026/approve", { method: "POST", token: reviewer.token, body: {} })).status, 409, "text must be verified first");
  assert.equal((await t.call("/api/challenge/review/law/tpca.interest.2026", { method: "POST", token: reviewer.token, body: { text: "Official text pasted from ULII by the reviewer (synthetic test text)." } })).status, 200);
  const law = await t.call("/api/challenge/review/law/tpca.interest.2026/approve", { method: "POST", token: reviewer.token, body: { computation: { kind: "simple-monthly", ratePercentPerMonth: 1 } } });
  assert.equal(law.status, 202);
  // The reviewer becomes an approver: still cannot approve what they prepared, or the text they entered.
  await t.pg.query("UPDATE taxcomp.challenge_reviewers SET can_approve_law = 1");
  assert.equal((await decide(reviewer, law.body.request.id)).status, 403, "the preparer cannot approve");
  await t.pg.query("INSERT INTO taxcomp.challenge_reviewers (user_id, email, can_approve_law, created_at) VALUES ($1, $2, 1, $3)", [approver.userId, "approver@example.com", NOW.toISOString()]);
  assert.equal((await decide(approver, law.body.request.id)).status, 200);
  assert.equal((await decide(approver, rules.body.request.id)).status, 200);
  const row = await t.pg.query("SELECT approved_for_computation AS a, approved_by AS b FROM taxcomp.law_provision_versions WHERE id = 'tpca.interest.2026'");
  assert.deepEqual(row.rows[0], { a: 1, b: approver.userId }, "the independent approver is recorded");
  assert.equal((await t.pg.query("SELECT approved_by AS b FROM taxcomp.procedure_rule_sets WHERE version = 'objections-2026.v1'")).rows[0].b, approver.userId);
  // The approver cannot approve a provision whose text they entered.
  assert.equal((await t.call("/api/challenge/review/law/ita.deductions.pre-2026", { method: "POST", token: approver.token, body: { text: "Official text pasted by the approver (synthetic test text)." } })).status, 200);
  const deductions = await t.call("/api/challenge/review/law/ita.deductions.pre-2026/approve", { method: "POST", token: reviewer.token, body: {} });
  assert.equal(deductions.status, 202, JSON.stringify(deductions.body));
  const byAuthor = await decide(approver, deductions.body.request.id);
  assert.equal(byAuthor.status, 403, "the author of the text cannot be its approver");
  assert.match(byAuthor.body.error, /wrote or entered this content/);
  await t.pg.close();
});

const PAYE_NOTICE = `UGANDA REVENUE AUTHORITY
NOTICE OF ADDITIONAL ASSESSMENT - PAY AS YOU EARN (PAYE)
TIN: 1000654321
Tax period: 01/07/2026 to 31/07/2026
Date of assessment: 15/09/2026
Principal tax: UGX 6,300,000
Penal tax at 20%: UGX 1,260,000
Interest at 2% per month for 2 months: UGX 252,000
Total amount due: UGX 7,812,000
Reasons: Transport and housing allowances paid to employees were not included in PAYE computations.`;

const WHT_NOTICE = `UGANDA REVENUE AUTHORITY
WITHHOLDING TAX ASSESSMENT
TIN: 1000777888
Tax period: 01/08/2026 to 31/08/2026
Date of assessment: 20/09/2026
Principal tax: UGX 4,500,000
Total amount due: UGX 4,500,000
Reasons: Failure to withhold tax on payments to contractors. The taxpayer is a withholding agent.`;

async function paidPlan(t, who, email) {
  await t.pg.query("INSERT INTO taxcomp.billing_accounts (user_id, email, created_at, updated_at) VALUES ($1, $2, $3, $3)", [who.userId, email, NOW.toISOString()]);
  await t.pg.query(`INSERT INTO taxcomp.billing_subscriptions (id, user_id, plan_id, status, current_period_start, current_period_end, created_at, updated_at)
    VALUES ($1, $2, 'individual-monthly', 'active', '2026-11-01T00:00:00.000Z', '2026-12-01T00:00:00.000Z', $3, $3)`, [`s-${who.userId}`, who.userId, NOW.toISOString()]);
}

test("PAYE and withholding tax assessments: read, classify, research and pack", async () => {
  const t = await setup();
  const owner = await t.user("employer@example.com");
  await paidPlan(t, owner, "employer@example.com");
  const run = async (notice, expectedHead, item) => {
    const caseId = await newCase(t, owner);
    const read = await t.call(`/api/challenge/cases/${caseId}/read`, { method: "POST", token: owner.token, body: { text: notice } });
    assert.equal(read.status, 200, JSON.stringify(read.body));
    assert.equal(read.body.view.confirmations.find((f) => f.fieldName === "tax_head").extractedValue, expectedHead);
    const fields = read.body.view.confirmations.filter((f) => f.extractedValue !== null).map((f) => ({ field: f.fieldName, action: "confirm" }));
    await t.call(`/api/challenge/cases/${caseId}/fields`, { method: "POST", token: owner.token, body: { fields } });
    await t.call(`/api/challenge/cases/${caseId}`, { method: "PATCH", token: owner.token, body: { dateServed: "2026-10-20" } });
    const saved = await t.call(`/api/challenge/cases/${caseId}/items`, { method: "PUT", token: owner.token, body: { items: [item] } });
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    const pack = await t.call(`/api/challenge/cases/${caseId}/pack`, { token: owner.token });
    assert.equal(pack.status, 200, JSON.stringify(pack.body));
    return { view: saved.body.view, pack: pack.body.pack };
  };

  const paye = await run(PAYE_NOTICE, "paye", { category: "employment_income", description: "Transport allowances treated as pay", uraAmount: 6300000, taxpayerAmount: 0, facts: { hasRecords: false } });
  assert.match(paye.view.explanation.owner[0], /PAYE \(the income tax an employer must take from staff pay/);
  const payeItem = paye.view.reconciliation.items[0];
  assert.equal(payeItem.outcome, "insufficient_evidence");
  assert.ok(payeItem.evidenceGap.includes("payslips and payroll records for the period"));
  assert.ok(paye.view.research[0].provisions.some((p) => p.provisionId === "ita.paye-employment-income.2026"), "July 2026 PAYE uses the 2026 version");
  assert.ok(paye.view.law.statutes.some((s) => s.id === "ita"));
  assert.match(paye.pack.documents[0].title, /PAYE assessment/);
  assert.ok(JSON.stringify(paye.pack).includes("PAY AS YOU EARN (PAYE)"));

  const wht = await run(WHT_NOTICE, "wht", { category: "withholding", description: "Payments to contractors", uraAmount: 4500000, taxpayerAmount: 0, facts: { hasRecords: true, legalArgument: "The contractors held valid exemption certificates." } });
  const whtItem = wht.view.reconciliation.items[0];
  assert.equal(whtItem.outcome, "arguable_legal_ground");
  assert.deepEqual(wht.view.research[0].provisions.map((p) => p.provisionId).filter((id) => id.startsWith("ita.wht")).sort(), ["ita.wht-agent-liability.2026", "ita.wht-payments.2026"]);
  assert.match(wht.pack.documents[0].title, /withholding tax assessment/);
  // Nothing new is approved for computation.
  const approved = await t.pg.query("SELECT count(*)::int AS n FROM taxcomp.law_provision_versions WHERE approved_for_computation = 1");
  assert.equal(approved.rows[0].n, 0);
  // The database refuses unknown taxes and categories.
  await assert.rejects(t.pg.query("UPDATE taxcomp.challenge_cases SET tax_head = 'stamp_duty'"), /check constraint/);
  await t.pg.close();
});

test("A3: seeded holidays start unverified; reviewers add them, only approvers confirm them, with a source; all audited", async () => {
  const t = await setup();
  const owner = await t.user("owner@example.com");
  const law = await t.call("/api/challenge/law", { token: owner.token });
  assert.equal(law.status, 200);
  const christmas = law.body.holidays.find((day) => day.date === "2026-12-25");
  assert.deepEqual({ name: christmas.name, verified: christmas.verified }, { name: "Christmas Day", verified: false });
  assert.ok(law.body.holidays.every((day) => !day.verified), "nothing seeded is verified");
  assert.ok(!law.body.holidays.some((day) => /Eid/.test(day.name)), "Eid dates are gazetted yearly, never seeded");

  assert.equal((await t.call("/api/challenge/review/holidays", { method: "POST", token: owner.token, body: { date: "2027-03-10", name: "Eid al-Fitr" } })).status, 403, "owners are not reviewers");
  const reviewer = await t.user("reviewer@example.com");
  await t.pg.query("INSERT INTO taxcomp.challenge_reviewers (user_id, email, created_at) VALUES ($1, $2, $3)", [reviewer.userId, "reviewer@example.com", NOW.toISOString()]);
  assert.equal((await t.call("/api/challenge/review/holidays", { method: "POST", token: reviewer.token, body: { date: "2027-3-10", name: "Eid al-Fitr" } })).status, 400);
  assert.equal((await t.call("/api/challenge/review/holidays", { method: "POST", token: reviewer.token, body: { date: "2027-03-10", name: "Eid al-Fitr" } })).status, 200);
  const verify = (body) => t.call("/api/challenge/review/holidays/verify", { method: "POST", token: reviewer.token, body });
  assert.equal((await verify({ date: "2027-03-10", name: "Eid al-Fitr" })).status, 400, "a source link is required");
  assert.equal((await verify({ date: "2027-03-11", name: "Eid al-Fitr", sourceUrl: "https://example.org/gazette" })).status, 404);
  const prepared = await verify({ date: "2027-03-10", name: "Eid al-Fitr", sourceUrl: "https://example.org/gazette" });
  assert.equal(prepared.status, 202, "prepared; a different legal approver must confirm it");
  // The reviewer who ADDED the holiday cannot confirm it, even as an approver.
  await t.pg.query("UPDATE taxcomp.challenge_reviewers SET can_approve_law = 1");
  const decide = (who) => t.call(`/api/challenge/review/register/requests/${prepared.body.request.id}/decision`, { method: "POST", token: who.token, body: { decision: "approve", note: "Gazette checked." } });
  assert.equal((await decide(reviewer)).status, 403);
  const approver = await t.user("approver@example.com");
  await t.pg.query("INSERT INTO taxcomp.challenge_reviewers (user_id, email, can_approve_law, created_at) VALUES ($1, $2, 1, $3)", [approver.userId, "approver@example.com", NOW.toISOString()]);
  assert.equal((await decide(approver)).status, 200);

  const row = await t.pg.query("SELECT verified_by AS v, source_url AS s, added_by AS a FROM taxcomp.public_holidays WHERE holiday_date = '2027-03-10'");
  assert.deepEqual(row.rows[0], { v: approver.userId, s: "https://example.org/gazette", a: reviewer.userId });
  const actions = await t.pg.query("SELECT action FROM taxcomp.challenge_audit_log WHERE action LIKE 'holiday.%' ORDER BY occurred_at, action");
  assert.deepEqual(actions.rows.map((r) => r.action).sort(), ["holiday.add", "holiday.verify.request"]);
  await t.pg.close();
});

test("CASE-1 (harness): reviewer-curated decisions are found by a plain-English search, each with a ULII link", async () => {
  const t = await setup();
  const reviewer = await t.user("reviewer@example.com");
  await t.pg.query("INSERT INTO taxcomp.challenge_reviewers (user_id, email, created_at) VALUES ($1, $2, $3)", [reviewer.userId, "reviewer@example.com", NOW.toISOString()]);
  // Synthetic test records (not real decisions); production data is entered by a reviewer from ULII.
  for (const [id, tags, terms] of [["synthetic-a", ["expense-deductibility", "burden-of-proof"], "expenses disallowed lack of evidence receipts"],
    ["synthetic-b", ["burden-of-proof"], "taxpayer failed to prove expenses records"], ["synthetic-c", ["penal-tax"], "penal tax waiver"]]) {
    const saved = await t.call("/api/challenge/review/case-law", { method: "POST", token: reviewer.token, body: { id, citation: `Synthetic ${id}`, parties: "Test v URA", sourceUrl: `https://ulii.org/test/${id}`, issueTags: tags, searchTerms: terms } });
    assert.equal(saved.status, 200);
  }
  assert.equal((await t.call("/api/challenge/review/case-law", { method: "POST", token: reviewer.token, body: { id: "bad-one", citation: "x", parties: "y", sourceUrl: "https://ulii.org/x", issueTags: ["expense-deductibility"], decision: "You will win this." } })).status, 500, "unsafe summaries are refused");
  const owner = await t.user("owner@example.com");
  const found = await t.call(`/api/challenge/case-law?q=${encodeURIComponent("expenses disallowed for lack of evidence")}`, { token: owner.token });
  const ids = found.body.results.map((r) => r.id);
  assert.ok(ids.length >= 3, `found ${ids.join(", ")}`);
  assert.equal(ids[0], "synthetic-a", "expenses + evidence ranks first");
  assert.ok(ids.includes("synthetic-b"));
  assert.ok(!ids.includes("synthetic-c"), "unrelated decisions are not returned");
  assert.ok(ids.includes("quickway-property-services-ura-2023"), "the seeded TAT decision (burden of proof) is matched");
  for (const result of found.body.results) {
    assert.match(result.sourceUrl, /^https:\/\/ulii\.org\//);
    assert.equal(result.appealStatus, "unverified");
  }
  // Research on a case: an expenses item gets provisions and decisions.
  const caseId = await newCase(t, owner);
  await confirmAll(t, owner, caseId);
  const items = await t.call(`/api/challenge/cases/${caseId}/items`, { method: "PUT", token: owner.token, body: { items: [{ category: "expense", description: "Expenses disallowed for lack of evidence", uraAmount: 0, taxpayerAmount: 25000000, facts: { hasRecords: false, missingDocuments: ["supplier invoices"] } }] } });
  const research = items.body.view.research[0];
  assert.equal(items.body.view.reconciliation.items[0].outcome, "insufficient_evidence", "CLS-1 through the API");
  assert.ok(research.provisions.some((p) => p.provisionId === "ita.deductions.2026"));
  assert.ok(research.cases.length >= 2);
  assert.ok(research.cases.some((c) => c.summaryLabel === "Staff summary, unreviewed"));
  await t.pg.close();
});