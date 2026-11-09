// End-to-end Phase 6 practice workflow against real Postgres (PGlite) through
// the Supabase adapter. Mirrors the synthetic workflow in phase6-api.test.mjs
// and additionally drives every list/dashboard endpoint, whose SQL is built at
// run time and therefore cannot be compile-checked statically.
import test from "node:test";
import assert from "node:assert/strict";
import { handlePhase6Request } from "./phase6-api.mjs";
import { hashPassword } from "./phase6-auth.mjs";
import { createMigratedDatabase } from "./pglite-test-support.mjs";

const origin = "https://taxcomp.example.invalid";
const bootstrapSecret = "synthetic-bootstrap-secret-at-least-32-bytes";
const password = "SyntheticPassword-2026";

function request(path, { method = "GET", body, cookie, csrf, bootstrap, raw = false } = {}) {
  const headers = { Origin: origin };
  if (body !== undefined && !raw) headers["Content-Type"] = "application/json";
  if (cookie) headers.Cookie = cookie;
  if (csrf) headers["X-CSRF-Token"] = csrf;
  if (bootstrap) headers["X-Phase6-Bootstrap"] = bootstrap;
  return new Request(`https://worker.example${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: raw ? body : JSON.stringify(body) }),
  });
}

test("Phase 6 practice workflow runs end to end on Supabase Postgres", { timeout: 120_000 }, async () => {
  const { pg, db } = await createMigratedDatabase();
  const objects = new Map();
  let resetToken = null;
  const bindings = {
    UNANSWERED_QUESTIONS: db,
    ALLOWED_ORIGIN: origin,
    PHASE6_BOOTSTRAP_SECRET: bootstrapSecret,
    PHASE6_OPERATIONS_ENABLED: "true",
    PHASE6_SECURITY_REVIEWED: "true",
    PHASE6_DATA_AT_REST_REVIEWED: "true",
    PHASE6_BACKUP_RESTORE_VERIFIED: "true",
    CHAT_LIMITER: { limit: async () => ({ success: true }) },
    PHASE6_TEST_MAILER: { async sendPasswordReset({ token }) { resetToken = token; } },
    PHASE6_DOCUMENTS: {
      async put(key, bytes) { objects.set(key, new Uint8Array(bytes)); },
      async get(key) { const bytes = objects.get(key); return bytes ? { body: new Blob([bytes]).stream() } : null; },
      async delete(key) { objects.delete(key); },
    },
    PHASE6_MALWARE_SCANNER: { async fetch() { return new Response(JSON.stringify({ clean: true })); } },
  };
  const call = async (path, options, expected) => {
    const response = await handlePhase6Request(request(path, options), bindings);
    const text = await response.text();
    if (expected !== undefined) assert.equal(response.status, expected, `${options?.method || "GET"} ${path}: ${text}`);
    return { status: response.status, headers: response.headers, json: text ? JSON.parse(text) : null };
  };
  const auditCount = async (action) =>
    (await db.prepare("SELECT COUNT(*) AS n FROM phase6_audit_log WHERE action = ?").bind(action).first()).n;

  // Bootstrap and admin login.
  const boot = await call("/api/phase6/auth/bootstrap", {
    method: "POST", bootstrap: bootstrapSecret,
    body: { organizationName: "PG Synthetic Practice", email: "admin-pg@example.invalid", password },
  }, 201);
  const organizationId = boot.json.organization.organizationId;
  await call("/api/phase6/auth/bootstrap", {
    method: "POST", bootstrap: bootstrapSecret,
    body: { organizationName: "Again", email: "second@example.invalid", password },
  });
  assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM phase6_organizations").first()).n, 1, "bootstrap runs once");
  const adminLogin = await call("/api/phase6/auth/login", {
    method: "POST", body: { email: "ADMIN-pg@example.invalid", password, organizationId },
  }, 200);
  const admin = { cookie: adminLogin.headers.get("Set-Cookie").split(";")[0], csrf: adminLogin.json.csrfToken };
  const asAdmin = (extra = {}) => ({ cookie: admin.cookie, csrf: admin.csrf, ...extra });
  await call("/api/phase6/auth/me", asAdmin(), 200);

  // Clients (+ case-insensitive ordering and changes()-guarded update).
  const clientA = (await call("/api/phase6/clients", asAdmin({ method: "POST",
    body: { legalBusinessName: "beta Synthetic Ltd", tin: "PG-TIN-1", entityType: "company", taxpayerCategory: "company" } }), 201)).json.client;
  await call("/api/phase6/clients", asAdmin({ method: "POST",
    body: { legalBusinessName: "Alpha Synthetic Ltd", tin: "PG-TIN-2", entityType: "company", taxpayerCategory: "sme" } }), 201);
  const duplicateTin = await call("/api/phase6/clients", asAdmin({ method: "POST",
    body: { legalBusinessName: "Dup", tin: "PG-TIN-1", entityType: "company", taxpayerCategory: "company" } }));
  assert.equal(duplicateTin.status, 409, "duplicate TIN is a conflict, not a server error");
  const listed = (await call("/api/phase6/clients", asAdmin(), 200)).json.clients;
  assert.deepEqual(listed.map((c) => c.legalBusinessName), ["Alpha Synthetic Ltd", "beta Synthetic Ltd"], "COLLATE NOCASE ordering");
  await call(`/api/phase6/clients?search=ALPHA`, asAdmin(), 200);
  await call(`/api/phase6/clients/${clientA.clientId}`, asAdmin({ method: "PATCH", body: { legalBusinessName: "Beta Synthetic Limited" } }), 200);
  assert.equal(await auditCount("client.updated"), 1, "changes() guard let the audit insert through");
  await call(`/api/phase6/clients/${clientA.clientId}/tax-profile`, asAdmin({ method: "PUT",
    body: { taxpayerType: "company", payeObligation: false, whtAgentStatus: false } }), 201);
  await call(`/api/phase6/clients/${clientA.clientId}/tax-profile`, asAdmin(), 200);

  // Invite a reviewer, password reset, login.
  const invited = (await call("/api/phase6/users", asAdmin({ method: "POST",
    body: { email: "reviewer-pg@example.invalid", role: "reviewer", clientIds: [clientA.clientId] } }), 201)).json.user;
  assert.ok(resetToken);
  await call("/api/phase6/auth/password-reset/confirm", { method: "POST", body: { token: resetToken, password: "ReviewerPgPassword-2026" } }, 200);
  const reviewerLogin = await call("/api/phase6/auth/login", {
    method: "POST", body: { email: invited.email, password: "ReviewerPgPassword-2026", organizationId },
  }, 200);
  const reviewer = { cookie: reviewerLogin.headers.get("Set-Cookie").split(";")[0], csrf: reviewerLogin.json.csrfToken };
  const asReviewer = (extra = {}) => ({ cookie: reviewer.cookie, csrf: reviewer.csrf, ...extra });
  await call("/api/phase6/users", asAdmin(), 200);

  // Document upload, review, proposal.
  const form = new FormData();
  form.set("clientId", clientA.clientId);
  form.set("documentType", "purchase-invoice");
  form.set("taxPeriod", "2025/26");
  form.set("file", new File([new TextEncoder().encode("%PDF-1.6 synthetic evidence")], "support.pdf", { type: "application/pdf" }));
  const uploadResponse = await handlePhase6Request(new Request("https://worker.example/api/phase6/documents", {
    method: "POST", headers: { Origin: origin, Cookie: admin.cookie, "X-CSRF-Token": admin.csrf }, body: form,
  }), bindings);
  assert.equal(uploadResponse.status, 201, await uploadResponse.clone().text());
  const document = (await uploadResponse.json()).document;
  await call("/api/phase6/documents", asAdmin(), 200);
  await call(`/api/phase6/documents?clientId=${clientA.clientId}&status=pending-review`, asAdmin(), 200);
  await call(`/api/phase6/documents/${document.documentId}/versions`, asAdmin(), 200);

  // Compliance obligation with evidence (dynamic IN lists).
  const obligation = (await call("/api/phase6/compliance", asAdmin({ method: "POST",
    body: { clientId: clientA.clientId, taxObligationType: "vat", taxPeriod: "2025/26", outstandingAmount: 0,
      filingDeadline: new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10), supportingDocuments: [document.documentId] } }), 201)).json.obligation;
  assert.deepEqual(obligation.supportingDocuments, [document.documentId]);
  const compliance = (await call(`/api/phase6/compliance?clientId=${clientA.clientId}`, asAdmin(), 200)).json;
  assert.equal(compliance.obligations.length, 1);
  await call(`/api/phase6/compliance/${obligation.obligationId}`, asAdmin(), 200);

  await call(`/api/phase6/documents/${document.documentId}/review`, asAdmin({ method: "POST", body: { decision: "reviewed", notes: "ok" } }), 200);
  const proposal = (await call(`/api/phase6/documents/${document.documentId}/proposals`, asAdmin({ method: "POST",
    body: { taxPeriod: "2025/26", taxHead: "value-added-tax", field: "invoice.amount", proposedValue: 0, sourcePage: 1, confidence: 0.8 } }), 201)).json.proposal;
  const accepted = await call(`/api/phase6/proposals/${proposal.proposalId}`, asReviewer({ method: "PATCH", body: { decision: "accepted" } }), 200);
  assert.equal(accepted.json.proposal.confirmedValue, 0);

  // Engagements.
  await call("/api/phase6/engagements", asAdmin({ method: "POST", body: { clientId: clientA.clientId, title: "FY25/26 VAT", serviceType: "vat-compliance" } }), 201);
  assert.equal((await call("/api/phase6/engagements", asAdmin(), 200)).json.engagements.length, 1);
  await call(`/api/phase6/engagements?clientId=${clientA.clientId}`, asAdmin(), 200);

  // Scenario (+ versioned PATCH guarded by changes()), report and review.
  const scenario = (await call("/api/phase6/scenarios", asAdmin({ method: "POST", body: {
    clientId: clientA.clientId, taxPeriod: "2025/26", documentIds: [document.documentId],
    inputSnapshot: { scenario: "other", eventDate: "2026-10-01", amount: 0, direction: "income", partyType: "company", supplierVat: "unknown", vatTreatment: "unknown" },
  } }), 201)).json.scenario;
  await call("/api/phase6/scenarios", asAdmin(), 200);
  await call(`/api/phase6/scenarios?clientId=${clientA.clientId}&status=draft`, asAdmin(), 200);
  const patched = await call(`/api/phase6/scenarios/${scenario.scenarioId}`, asAdmin({ method: "PATCH", body: { status: "under-review" } }), 200);
  assert.equal(patched.json.scenario.version, 2);
  const versions = await db.prepare("SELECT COUNT(*) AS n FROM phase6_scenario_versions WHERE scenario_id = ?").bind(scenario.scenarioId).first();
  assert.equal(versions.n, 2, "version row written through the changes() guard");

  const report = (await call("/api/phase6/reports", asAdmin({ method: "POST",
    body: { scenarioId: scenario.scenarioId, question: "Review this synthetic scenario.", facts: {} } }), 201)).json.report;
  assert.equal(report.status, "review-required");
  await call("/api/phase6/reports", asAdmin(), 200);
  await call(`/api/phase6/reports?clientId=${clientA.clientId}&status=review-required`, asAdmin(), 200);
  await call(`/api/phase6/reports/${report.reportId}/review`, asAdmin({ method: "POST", body: { decision: "approve" } }), 403);
  await call(`/api/phase6/reports/${report.reportId}/review`, asReviewer({ method: "POST", body: { decision: "approve", notes: "Reviewed." } }), 200);
  await call(`/api/phase6/reports/${report.reportId}`, asAdmin(), 200);

  // Dashboard as admin (org-wide) and as the restricted reviewer (access-scoped SQL).
  const dashboard = (await call("/api/phase6/dashboard", asAdmin(), 200)).json;
  assert.equal(dashboard.clients?.totalClients ?? dashboard.totalClients ?? dashboard.clientCounts?.totalClients, 2, JSON.stringify(dashboard).slice(0, 400));
  await call(`/api/phase6/dashboard?clientId=${clientA.clientId}`, asAdmin(), 200);
  await call("/api/phase6/dashboard", asReviewer(), 200);
  await call("/api/phase6/clients", asReviewer(), 200);
  await call("/api/phase6/scenarios", asReviewer(), 200);
  await call("/api/phase6/reports", asReviewer(), 200);
  await call("/api/phase6/compliance", asReviewer(), 403); // reviewers have compliance:update only

  // A tax consultant assigned to one client exercises the access-scoped list SQL.
  resetToken = null;
  const consultantUser = (await call("/api/phase6/users", asAdmin({ method: "POST",
    body: { email: "consultant-pg@example.invalid", role: "tax-consultant", clientIds: [clientA.clientId] } }), 201)).json.user;
  await call("/api/phase6/auth/password-reset/confirm", { method: "POST", body: { token: resetToken, password: "ConsultantPgPassword-2026" } }, 200);
  const consultantLogin = await call("/api/phase6/auth/login", {
    method: "POST", body: { email: consultantUser.email, password: "ConsultantPgPassword-2026", organizationId },
  }, 200);
  const asConsultant = { cookie: consultantLogin.headers.get("Set-Cookie").split(";")[0] };
  assert.equal((await call("/api/phase6/compliance", asConsultant, 200)).json.obligations.length, 1);
  assert.equal((await call("/api/phase6/engagements", asConsultant, 200)).json.engagements.length, 1);
  assert.equal((await call("/api/phase6/clients", asConsultant, 200)).json.clients.length, 1, "only the assigned client");
  await call("/api/phase6/documents", asConsultant, 200);
  await call("/api/phase6/dashboard", asConsultant, 200);
  await call("/api/phase6/governance/readiness", asAdmin(), 200);

  // Tenant isolation: a second organization cannot see the first one's client.
  const now = new Date().toISOString();
  await db.batch([
    db.prepare("INSERT INTO phase6_organizations (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)").bind("pg-other-org", "Other", now, now),
    db.prepare("INSERT INTO phase6_users (id, email, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
      .bind("pg-other-user", "other-pg@example.invalid", await hashPassword("OtherOrgPassword-2026", { iterations: 100_000 }), now, now),
    db.prepare("INSERT INTO phase6_memberships (organization_id, user_id, role, created_at) VALUES (?, ?, 'practice-admin', ?)").bind("pg-other-org", "pg-other-user", now),
  ]);
  const otherLogin = await call("/api/phase6/auth/login", {
    method: "POST", body: { email: "other-pg@example.invalid", password: "OtherOrgPassword-2026", organizationId: "pg-other-org" },
  }, 200);
  const otherCookie = otherLogin.headers.get("Set-Cookie").split(";")[0];
  await call(`/api/phase6/clients/${clientA.clientId}`, { cookie: otherCookie }, 404);
  assert.equal((await call("/api/phase6/clients", { cookie: otherCookie }, 200)).json.clients.length, 0);

  // Lockout after repeated failures, then logout revokes the session.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await call("/api/phase6/auth/login", { method: "POST", body: { email: "other-pg@example.invalid", password: "WrongPassword-2026", organizationId: "pg-other-org" } }, 401);
  }
  const locked = await db.prepare("SELECT status FROM phase6_users WHERE id = ?").bind("pg-other-user").first();
  assert.equal(locked.status, "locked");
  await call("/api/phase6/auth/logout", { method: "POST", cookie: admin.cookie, csrf: admin.csrf }, 200);
  await call("/api/phase6/auth/me", { cookie: admin.cookie }, 401);

  assert.ok((await db.prepare("SELECT COUNT(*) AS n FROM phase6_audit_log").first()).n >= 20);
  await pg.close();
});
