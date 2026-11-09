// Phase 6 API on Supabase: real Postgres (PGlite) with the Supabase schema,
// Supabase Auth access tokens (real ES256 signatures) and Supabase Storage
// (fake HTTP API). Replaces the earlier cookie/CSRF tests on a hand-written D1
// fake; every behaviour those tests covered is still asserted here.
import assert from "node:assert/strict";
import test from "node:test";
import { bootstrapSecret, harness, origin } from "./phase6-test-harness.mjs";
test("Phase 6 API restricts origins, needs a Supabase token and uses bearer-token CORS", async () => {
  const h = await harness();
  assert.equal((await h.call("/api/phase6/clients", { originValue: "https://evil.example" })).status, 403);
  assert.equal((await h.call("/api/phase6/clients")).status, 401);
  const forged = (await h.supabase.issueToken({ email: "f@example.invalid", forgeWithOtherKey: true })).token;
  assert.equal((await h.call("/api/phase6/clients", { token: forged })).status, 401);
  const expired = (await h.supabase.issueToken({ email: "e@example.invalid", expiresInSeconds: -300 })).token;
  assert.equal((await h.call("/api/phase6/clients", { token: expired })).status, 401);
  const options = await h.raw("/api/phase6/clients", { method: "OPTIONS" });
  assert.equal(options.status, 204);
  assert.equal(options.headers.get("Access-Control-Allow-Credentials"), null, "no cookies, so no credentialed CORS");
  assert.match(options.headers.get("Access-Control-Allow-Headers"), /Authorization/);
  assert.match(options.headers.get("Access-Control-Allow-Headers"), /X-Organization-Id/);
  for (const retired of ["/api/phase6/auth/login", "/api/phase6/auth/password-reset/request", "/api/phase6/auth/password-reset/confirm"]) {
    assert.equal((await h.call(retired, { method: "POST", body: {} })).status, 410, retired);
  }
  await h.close();
});

test("Phase 6 APIs stay disabled unless the security gate flags and Supabase Auth are configured", async () => {
  const h = await harness();
  const token = await h.signIn("admin@example.invalid");
  delete h.bindings.PHASE6_BACKUP_RESTORE_VERIFIED;
  const gated = await h.call("/api/phase6/auth/bootstrap", { method: "POST", token, bootstrap: bootstrapSecret, body: { organizationName: "Synthetic" } });
  assert.equal(gated.status, 503);
  assert.match(gated.json.error, /security, at-rest protection, and backup\/restore/);
  h.bindings.PHASE6_BACKUP_RESTORE_VERIFIED = "true";
  delete h.bindings.DATABASE_PROVIDER;
  const onD1 = await h.call("/api/phase6/auth/me", { token });
  assert.equal(onD1.status, 503);
  assert.match(onD1.json.error, /requires the Supabase database/);
  h.bindings.DATABASE_PROVIDER = "supabase";
  delete h.bindings.SUPABASE_URL;
  const noAuth = await h.call("/api/phase6/auth/me", { token });
  assert.equal(noAuth.status, 503);
  await h.close();
});

test("signed-in users without a membership, or with several, must be resolved first", async () => {
  const h = await harness();
  const admin = await h.bootstrapAdmin("admin@example.invalid", "Alpha Practice");
  const strangerToken = await h.signIn("stranger@example.invalid");
  const stranger = await h.call("/api/phase6/clients", { token: strangerToken });
  assert.equal(stranger.status, 403);
  assert.match(stranger.json.error, /No active organization membership/);
  const me = await h.call("/api/phase6/auth/me", { token: strangerToken }, 200);
  assert.equal(me.json.principal, null);

  const now = new Date().toISOString();
  await h.db.prepare("INSERT INTO phase6_organizations (id, name, created_at, updated_at) VALUES ('org-beta', 'Beta Practice', ?, ?)").bind(now, now).run();
  await h.db.prepare("INSERT INTO phase6_memberships (organization_id, user_id, role, created_at) VALUES ('org-beta', ?, 'reviewer', ?)").bind(admin.userId, now).run();
  const ambiguous = await h.call("/api/phase6/clients", { token: admin.token });
  assert.equal(ambiguous.status, 403);
  assert.deepEqual(ambiguous.json.organizations.map((o) => o.organizationName), ["Alpha Practice", "Beta Practice"]);
  assert.equal((await h.call("/api/phase6/clients", { token: admin.token, org: admin.organizationId })).status, 200);
  assert.equal((await h.call("/api/phase6/users", { token: admin.token, org: "org-beta" })).status, 403, "reviewer role in Beta");
  await h.close();
});

test("launch-readiness endpoint is authenticated, admin-scoped, and audited", async () => {
  const h = await harness();
  const admin = await h.bootstrapAdmin("admin@example.invalid", "Synthetic Practice");
  const result = await h.call("/api/phase6/governance/readiness", { token: admin.token }, 200);
  assert.equal(result.json.readiness.status, "blocked");
  assert.equal(result.json.readiness.launchEligible, false);
  assert.equal(result.json.readiness.billingEnabled, false);
  assert.equal(await h.count("SELECT COUNT(*) AS n FROM phase6_audit_log WHERE action = 'governance.readiness-viewed'"), 1);
  await h.close();
});

test("authenticated client CRUD is tenant-scoped and audited", async () => {
  const h = await harness();
  const admin = await h.bootstrapAdmin("admin@example.invalid", "Synthetic Practice");
  const as = (extra = {}) => ({ token: admin.token, ...extra });

  const created = await h.call("/api/phase6/clients", as({ method: "POST", body: {
    legalBusinessName: "Synthetic Client", tin: "SYNTHETIC-TIN-01", registrationNumber: "SYNTHETIC-REG-01", entityType: "company", taxpayerCategory: "company",
  } }), 201);
  const client = created.json.client;
  assert.equal(client.practiceId, admin.organizationId);
  assert.equal(client.registrationNumber, "SYNTHETIC-REG-01");
  assert.equal(await h.count("SELECT COUNT(*) AS n FROM phase6_audit_log"), 1);

  const updated = await h.call(`/api/phase6/clients/${client.clientId}`, as({ method: "PATCH", body: { legalBusinessName: "Synthetic Client Updated", registrationNumber: "SYNTHETIC-REG-02" } }), 200);
  assert.equal(updated.json.client.registrationNumber, "SYNTHETIC-REG-02");
  assert.equal((await h.call("/api/phase6/clients?name=updated&entityType=company", as(), 200)).json.clients.length, 1);
  assert.equal((await h.call("/api/phase6/clients?name=no-match", as(), 200)).json.clients.length, 0);

  await h.call(`/api/phase6/clients/${client.clientId}/tax-profile`, as({ method: "PUT", body: {
    vatRegistrationStatus: "not_registered", payeObligation: false, whtAgentStatus: false, taxpayerType: "company", filingFrequency: "quarterly",
  } }), 201);
  const profile = (await h.call(`/api/phase6/clients/${client.clientId}/tax-profile`, as(), 200)).json.profile;
  assert.equal(profile.payeObligation, false);
  assert.equal(profile.whtAgentStatus, false);
  assert.equal(profile.practiceId, admin.organizationId);

  const obligation = (await h.call("/api/phase6/compliance", as({ method: "POST", body: {
    clientId: client.clientId, taxObligationType: "vat", taxPeriod: "2025/26", filingDeadline: "2026-08-15", paymentDeadline: "2026-08-15",
    outstandingAmount: 0, deadlineVerificationStatus: "verified",
  } }), 201)).json.obligation;
  assert.equal(obligation.deadlineVerificationStatus, "unverified", "users cannot self-verify deadlines");
  assert.equal((await h.call(`/api/phase6/compliance?clientId=${client.clientId}`, as(), 200)).json.obligations.length, 1);
  const transitioned = (await h.call(`/api/phase6/compliance/${obligation.obligationId}`, as({ method: "PATCH", body: { filingStatus: "prepared" } }), 200)).json.obligation;
  assert.equal(transitioned.filingStatus, "prepared");
  assert.equal(transitioned.statusHistory[0].actorId, admin.userId);

  assert.equal((await h.call("/api/phase6/clients", as(), 200)).json.clients.length, 1);
  assert.equal((await h.call("/api/phase6/clients", as({ method: "POST", body: { practiceId: "another-practice", legalBusinessName: "Forged Scope" } }))).status, 400);
  assert.equal((await h.call(`/api/phase6/clients/${client.clientId}`, as())).status, 200);
  assert.equal((await h.call("/api/phase6/clients", as({ method: "POST", body: { legalBusinessName: "Dup", tin: "SYNTHETIC-TIN-01", entityType: "company", taxpayerCategory: "company" } }))).status, 409);

  // Another organization cannot see this client.
  const now = new Date().toISOString();
  await h.db.prepare("INSERT INTO phase6_organizations (id, name, created_at, updated_at) VALUES ('synthetic-org-b', 'Other Synthetic Practice', ?, ?)").bind(now, now).run();
  const other = await h.addMember("synthetic-org-b", "second@example.invalid", "practice-admin");
  assert.equal((await h.call(`/api/phase6/clients/${client.clientId}`, { token: other.token })).status, 404);
  assert.deepEqual((await h.call("/api/phase6/clients", { token: other.token }, 200)).json.clients, []);
  await h.close();
});

test("documents go to private Supabase Storage, are scanned, versioned and reviewed", async () => {
  const unconfigured = await harness({ storage: false, serviceKey: false });
  const firstAdmin = await unconfigured.bootstrapAdmin("docs@example.invalid", "Document Practice");
  const firstClient = (await unconfigured.call("/api/phase6/clients", { token: firstAdmin.token, method: "POST", body: { legalBusinessName: "C", entityType: "company", taxpayerCategory: "company" } }, 201)).json.client;
  const noStorage = new FormData();
  noStorage.set("clientId", firstClient.clientId);
  noStorage.set("documentType", "purchase-invoice");
  noStorage.set("file", new File([new TextEncoder().encode("%PDF-1.7 x")], "a.pdf", { type: "application/pdf" }));
  assert.equal((await unconfigured.call("/api/phase6/documents", { token: firstAdmin.token, method: "POST", body: noStorage, json: false })).status, 503, "no storage or scanner -> unavailable");
  await unconfigured.close();

  const h = await harness();
  const admin = await h.bootstrapAdmin("docs@example.invalid", "Document Test Practice");
  const as = (extra = {}) => ({ token: admin.token, ...extra });
  const client = (await h.call("/api/phase6/clients", as({ method: "POST", body: { legalBusinessName: "Synthetic Document Client", entityType: "company", taxpayerCategory: "company" } }), 201)).json.client;

  const pdfBytes = new TextEncoder().encode("%PDF-1.7 synthetic test document");
  const form = new FormData();
  form.set("clientId", client.clientId);
  form.set("documentType", "purchase-invoice");
  form.set("taxPeriod", "2025/26");
  form.set("file", new File([pdfBytes], "invoice.pdf", { type: "application/pdf" }));
  const document = (await h.call("/api/phase6/documents", as({ method: "POST", body: form, json: false }), 201)).json.document;
  assert.equal(document.status, "pending-review");
  assert.equal(h.scanned(), pdfBytes.byteLength);
  assert.equal(Object.hasOwn(document, "objectKey"), false, "storage keys are never exposed");
  assert.equal(h.supabase.objects.size, 1, "stored in Supabase Storage");
  assert.equal(new TextDecoder().decode([...h.supabase.objects.values()][0]), "%PDF-1.7 synthetic test document");

  await h.call("/api/phase6/compliance", as({ method: "POST", body: { clientId: client.clientId, taxObligationType: "vat", taxPeriod: "2025/26", outstandingAmount: 0, supportingDocuments: [document.documentId] } }), 201);
  const obligations = (await h.call(`/api/phase6/compliance?clientId=${client.clientId}`, as(), 200)).json.obligations;
  assert.deepEqual(obligations[0].supportingDocuments, [document.documentId]);
  assert.equal(obligations[0].deadlineVerificationStatus, "unverified");

  const download = await h.raw(`/api/phase6/documents/${document.documentId}/download`, as());
  assert.equal(download.status, 200);
  assert.equal(download.headers.get("Cache-Control"), "no-store, private");
  assert.match(download.headers.get("Content-Disposition"), /attachment/);
  assert.equal(new TextDecoder().decode(await download.arrayBuffer()), "%PDF-1.7 synthetic test document");

  const versionForm = new FormData();
  versionForm.set("file", new File([new TextEncoder().encode("%PDF-2.0 synthetic replacement")], "invoice-v2.pdf", { type: "application/pdf" }));
  versionForm.set("taxPeriod", "2025/26");
  const versioned = (await h.call(`/api/phase6/documents/${document.documentId}/versions`, as({ method: "POST", body: versionForm, json: false }), 201)).json.document;
  assert.equal(versioned.version, 2);
  assert.equal(versioned.status, "pending-review");
  assert.equal(h.supabase.objects.size, 2, "versions are separate objects");
  assert.equal((await h.call(`/api/phase6/documents/${document.documentId}/versions`, as(), 200)).json.versions.length, 2);
  const oldVersion = await h.raw(`/api/phase6/documents/${document.documentId}/versions/1/download`, as());
  assert.equal(new TextDecoder().decode(await oldVersion.arrayBuffer()), "%PDF-1.7 synthetic test document");

  const unsafeForm = new FormData();
  unsafeForm.set("clientId", client.clientId);
  unsafeForm.set("documentType", "purchase-invoice");
  unsafeForm.set("file", new File([new TextEncoder().encode("<html>not a PDF</html>")], "unsafe.pdf", { type: "application/pdf" }));
  assert.equal((await h.call("/api/phase6/documents", as({ method: "POST", body: unsafeForm, json: false }))).status, 400);
  assert.equal(h.supabase.objects.size, 2, "rejected upload never reaches storage");

  assert.equal((await h.call(`/api/phase6/documents/${document.documentId}/review`, as({ method: "POST", body: { decision: "reviewed", notes: "Synthetic reviewer inspected the fixture." } }), 200)).json.document.status, "reviewed");
  const proposal = (await h.call(`/api/phase6/documents/${document.documentId}/proposals`, as({ method: "POST",
    body: { taxPeriod: "2025/26", taxHead: "value-added-tax", field: "invoice.amount", proposedValue: 0, sourcePage: 1, confidence: 0.9 } }), 201)).json.proposal;
  assert.equal(proposal.status, "proposed");
  const accepted = await h.call(`/api/phase6/proposals/${proposal.proposalId}`, as({ method: "PATCH", body: { decision: "accepted" } }), 200);
  assert.equal(accepted.json.proposal.confirmedValue, 0);

  // A user from another organization cannot download it.
  const now = new Date().toISOString();
  await h.db.prepare("INSERT INTO phase6_organizations (id, name, created_at, updated_at) VALUES ('org-x', 'X', ?, ?)").bind(now, now).run();
  const outsider = await h.addMember("org-x", "outsider@example.invalid", "practice-admin");
  assert.equal((await h.raw(`/api/phase6/documents/${document.documentId}/download`, { token: outsider.token })).status, 404);
  await h.close();
});

test("scenarios run existing tax analysis and reports require separate review", async () => {
  const h = await harness();
  const author = await h.bootstrapAdmin("author@example.invalid", "Scenario Test Practice");
  const as = (extra = {}) => ({ token: author.token, ...extra });
  const client = (await h.call("/api/phase6/clients", as({ method: "POST", body: { legalBusinessName: "Synthetic Scenario Client", entityType: "company", taxpayerCategory: "company" } }), 201)).json.client;

  const scenario = (await h.call("/api/phase6/scenarios", as({ method: "POST", body: {
    clientId: client.clientId, taxPeriod: "2025/26",
    inputSnapshot: { scenario: "other", eventDate: "2026-10-01", amount: 0, direction: "income", partyType: "company", supplierVat: "unknown", vatTreatment: "unknown", employmentRelationship: "unknown" },
  } }), 201)).json.scenario;
  assert.equal(scenario.resultSnapshot.finalTaxPayable, null);
  assert.equal(await h.count("SELECT COUNT(*) AS n FROM phase6_scenario_versions"), 1);
  assert.equal((await h.call(`/api/phase6/scenarios/${scenario.scenarioId}`, as({ method: "PATCH", body: { status: "under-review" } }), 200)).json.scenario.version, 2);

  const report = (await h.call("/api/phase6/reports", as({ method: "POST", body: { scenarioId: scenario.scenarioId, question: "Review this synthetic scenario.", facts: { amount: 0 } } }), 201)).json.report;
  assert.equal(report.status, "review-required");
  assert.equal(report.legalVerificationStatus, "not-established");
  assert.equal((await h.call(`/api/phase6/reports/${report.reportId}/review`, as({ method: "POST", body: { decision: "approve" } }))).status, 403, "authors cannot approve their own report");

  const reviewer = await h.addMember(author.organizationId, "reviewer@example.invalid", "reviewer", [client.clientId]);
  const reviewed = await h.call(`/api/phase6/reports/${report.reportId}/review`, { token: reviewer.token, method: "POST", body: { decision: "approve", notes: "Reviewed synthetic report." } }, 200);
  assert.equal(reviewed.json.report.status, "approved");
  assert.equal(await h.count("SELECT COUNT(*) AS n FROM phase6_report_versions"), 2);

  const html = await h.call(`/api/phase6/reports/${report.reportId}/download?format=html`, { token: reviewer.token }, 200);
  assert.match(html.text, /not a formal legal opinion/i);
  assert.match(html.text, /No verified legal source has been linked/);
  assert.match((await h.call(`/api/phase6/reports/${report.reportId}/download?format=csv`, { token: reviewer.token }, 200)).text, /Citation ID/);
  assert.equal((await h.call(`/api/phase6/reports/${report.reportId}`, { token: reviewer.token }, 200)).json.report.legalVerificationStatus, "not-established");

  const engagement = (await h.call("/api/phase6/engagements", as({ method: "POST", body: { clientId: client.clientId, title: "Synthetic annual review", serviceType: "tax-review" } }), 201)).json.engagement;
  assert.equal(engagement.status, "pending");
  await h.call(`/api/phase6/engagements/${engagement.engagementId}`, as({ method: "PATCH", body: { status: "active" } }), 200);
  await h.call(`/api/phase6/engagements/${engagement.engagementId}`, as({ method: "PATCH", body: { status: "completed" } }), 200);
  const dashboard = (await h.call(`/api/phase6/dashboard?clientId=${client.clientId}`, as(), 200)).json;
  assert.equal(dashboard.totalClients, 1);
  assert.equal(dashboard.activeClients, 1);
  assert.equal(dashboard.completedEngagements, 1);
  assert.match(dashboard.deadlineCaveat, /do not establish statutory accuracy/i);
  await h.close();
});

test("invitations use Supabase Auth, and roles/client assignments are scoped", async () => {
  const h = await harness();
  const admin = await h.bootstrapAdmin("admin-users@example.invalid", "User Test Practice");
  const as = (extra = {}) => ({ token: admin.token, ...extra });
  const client = (await h.call("/api/phase6/clients", as({ method: "POST", body: { legalBusinessName: "Assigned Synthetic Client", entityType: "company", taxpayerCategory: "company" } }), 201)).json.client;

  const invited = (await h.call("/api/phase6/users", as({ method: "POST", body: { email: "Consultant@Example.invalid", role: "tax-consultant", clientIds: [client.clientId] } }), 201)).json.user;
  assert.equal(invited.email, "consultant@example.invalid");
  assert.equal(invited.status, "invited");
  assert.equal(invited.invitationEmailSent, true);
  assert.deepEqual(h.supabase.invitations.map((i) => [i.email, i.redirectTo]), [["consultant@example.invalid", origin]]);
  assert.equal(await h.count("SELECT COUNT(*) AS n FROM phase6_client_access WHERE user_id = ?", invited.userId), 1);
  assert.equal((await h.call("/api/phase6/users", as({ method: "POST", body: { email: "consultant@example.invalid", role: "accountant" } }))).status, 409, "already a member");
  const practiceAdmin = await h.addMember(admin.organizationId, "practice-admin@example.invalid", "practice-admin");
  for (const role of ["system-admin", "practice-admin", "owner"]) {
    assert.equal((await h.call("/api/phase6/users", { token: practiceAdmin.token, method: "POST", body: { email: "x@example.invalid", role } })).status, 403,
      `a practice admin cannot grant ${role}`);
  }
  assert.equal(h.supabase.invitations.length, 1, "refused invitations send no email");

  // The invitee accepts in Supabase and signs in: same Supabase user id.
  const consultantToken = await h.signIn("consultant@example.invalid");
  assert.equal((await h.call("/api/phase6/clients", { token: consultantToken }, 200)).json.clients.length, 1);
  assert.equal((await h.call("/api/phase6/users", { token: consultantToken })).status, 403);

  assert.equal((await h.call(`/api/phase6/users/${invited.userId}`, as({ method: "PATCH", body: { role: "reviewer" } }), 200)).json.role, "reviewer");
  await h.call(`/api/phase6/users/${invited.userId}/clients`, as({ method: "PUT", body: { clientIds: [] } }), 200);
  assert.equal(await h.count("SELECT COUNT(*) AS n FROM phase6_client_access WHERE user_id = ?", invited.userId), 0);
  await h.call(`/api/phase6/users/${invited.userId}`, as({ method: "PATCH", body: { status: "inactive" } }), 200);
  assert.equal((await h.call("/api/phase6/clients", { token: consultantToken })).status, 403, "deactivation applies immediately");

  // Someone who already has a Supabase account is linked without another email.
  await h.signIn("existing@example.invalid");
  const linked = (await h.call("/api/phase6/users", as({ method: "POST", body: { email: "existing@example.invalid", role: "accountant" } }), 201)).json.user;
  assert.equal(linked.invitationEmailSent, false);
  assert.equal(h.supabase.invitations.length, 1);

  const users = (await h.call("/api/phase6/users", as(), 200)).json.users;
  assert.deepEqual(users.map((u) => u.email).sort(),
    ["admin-users@example.invalid", "consultant@example.invalid", "existing@example.invalid", "practice-admin@example.invalid"]);
  await h.close();

  const noKey = await harness({ serviceKey: false });
  const otherAdmin = await noKey.bootstrapAdmin("admin@example.invalid", "No Key Practice");
  assert.equal((await noKey.call("/api/phase6/users", { token: otherAdmin.token, method: "POST", body: { email: "a@example.invalid", role: "accountant" } })).status, 503);
  await noKey.close();
});
