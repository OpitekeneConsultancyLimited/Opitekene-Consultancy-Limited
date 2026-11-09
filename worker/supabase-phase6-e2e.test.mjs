// End-to-end Phase 6 practice workflow on Supabase: Postgres (PGlite) through
// the adapter, Supabase Auth tokens, Supabase invitations and Storage. Also
// drives every list/dashboard endpoint, whose SQL is built at run time and
// therefore cannot be compile-checked statically.
import test from "node:test";
import assert from "node:assert/strict";
import { harness } from "./phase6-test-harness.mjs";

test("Phase 6 practice workflow runs end to end on Supabase", { timeout: 120_000 }, async () => {
  const h = await harness();
  const admin = await h.bootstrapAdmin("admin-pg@example.invalid", "PG Synthetic Practice");
  const asAdmin = (extra = {}) => ({ token: admin.token, ...extra });
  const auditCount = (action) => h.count("SELECT COUNT(*) AS n FROM phase6_audit_log WHERE action = ?", action);

  // Clients (+ case-insensitive ordering, duplicate TIN, changes()-guarded update).
  const clientA = (await h.call("/api/phase6/clients", asAdmin({ method: "POST",
    body: { legalBusinessName: "beta Synthetic Ltd", tin: "PG-TIN-1", entityType: "company", taxpayerCategory: "company" } }), 201)).json.client;
  await h.call("/api/phase6/clients", asAdmin({ method: "POST",
    body: { legalBusinessName: "Alpha Synthetic Ltd", tin: "PG-TIN-2", entityType: "company", taxpayerCategory: "sme" } }), 201);
  await h.call("/api/phase6/clients", asAdmin({ method: "POST",
    body: { legalBusinessName: "Dup", tin: "PG-TIN-1", entityType: "company", taxpayerCategory: "company" } }), 409);
  const listed = (await h.call("/api/phase6/clients", asAdmin(), 200)).json.clients;
  assert.deepEqual(listed.map((c) => c.legalBusinessName), ["Alpha Synthetic Ltd", "beta Synthetic Ltd"], "COLLATE NOCASE ordering");
  await h.call("/api/phase6/clients?search=ALPHA", asAdmin(), 200);
  await h.call(`/api/phase6/clients/${clientA.clientId}`, asAdmin({ method: "PATCH", body: { legalBusinessName: "Beta Synthetic Limited" } }), 200);
  assert.equal(await auditCount("client.updated"), 1, "changes() guard let the audit insert through");
  await h.call(`/api/phase6/clients/${clientA.clientId}/tax-profile`, asAdmin({ method: "PUT",
    body: { taxpayerType: "company", payeObligation: false, whtAgentStatus: false } }), 201);

  // Invite a reviewer through Supabase; they sign in with Supabase.
  await h.call("/api/phase6/users", asAdmin({ method: "POST",
    body: { email: "reviewer-pg@example.invalid", role: "reviewer", clientIds: [clientA.clientId] } }), 201);
  const asReviewer = { token: await h.signIn("reviewer-pg@example.invalid") };
  await h.call("/api/phase6/users", asAdmin(), 200);

  // Document upload to Supabase Storage, review, proposal.
  const form = new FormData();
  form.set("clientId", clientA.clientId);
  form.set("documentType", "purchase-invoice");
  form.set("taxPeriod", "2025/26");
  form.set("file", new File([new TextEncoder().encode("%PDF-1.6 synthetic evidence")], "support.pdf", { type: "application/pdf" }));
  const document = (await h.call("/api/phase6/documents", asAdmin({ method: "POST", body: form, json: false }), 201)).json.document;
  await h.call("/api/phase6/documents", asAdmin(), 200);
  await h.call(`/api/phase6/documents?clientId=${clientA.clientId}&status=pending-review`, asAdmin(), 200);

  // Compliance with evidence (dynamic IN lists).
  const obligation = (await h.call("/api/phase6/compliance", asAdmin({ method: "POST",
    body: { clientId: clientA.clientId, taxObligationType: "vat", taxPeriod: "2025/26", outstandingAmount: 0,
      filingDeadline: new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10), supportingDocuments: [document.documentId] } }), 201)).json.obligation;
  assert.deepEqual(obligation.supportingDocuments, [document.documentId]);
  assert.equal((await h.call(`/api/phase6/compliance?clientId=${clientA.clientId}`, asAdmin(), 200)).json.obligations.length, 1);
  await h.call(`/api/phase6/compliance/${obligation.obligationId}`, asAdmin(), 200);

  await h.call(`/api/phase6/documents/${document.documentId}/review`, asAdmin({ method: "POST", body: { decision: "reviewed", notes: "ok" } }), 200);
  const proposal = (await h.call(`/api/phase6/documents/${document.documentId}/proposals`, asAdmin({ method: "POST",
    body: { taxPeriod: "2025/26", taxHead: "value-added-tax", field: "invoice.amount", proposedValue: 0, sourcePage: 1, confidence: 0.8 } }), 201)).json.proposal;
  assert.equal((await h.call(`/api/phase6/proposals/${proposal.proposalId}`, { ...asReviewer, method: "PATCH", body: { decision: "accepted" } }, 200)).json.proposal.confirmedValue, 0);

  // Engagements.
  await h.call("/api/phase6/engagements", asAdmin({ method: "POST", body: { clientId: clientA.clientId, title: "FY25/26 VAT", serviceType: "vat-compliance" } }), 201);
  assert.equal((await h.call("/api/phase6/engagements", asAdmin(), 200)).json.engagements.length, 1);
  await h.call(`/api/phase6/engagements?clientId=${clientA.clientId}`, asAdmin(), 200);

  // Scenario (versioned PATCH guarded by changes()), report and review.
  const scenario = (await h.call("/api/phase6/scenarios", asAdmin({ method: "POST", body: {
    clientId: clientA.clientId, taxPeriod: "2025/26", documentIds: [document.documentId],
    inputSnapshot: { scenario: "other", eventDate: "2026-10-01", amount: 0, direction: "income", partyType: "company", supplierVat: "unknown", vatTreatment: "unknown" },
  } }), 201)).json.scenario;
  assert.deepEqual(scenario.inputSnapshot.associatedDocumentIds, [document.documentId]);
  await h.call("/api/phase6/scenarios", asAdmin(), 200);
  await h.call(`/api/phase6/scenarios?clientId=${clientA.clientId}&status=draft`, asAdmin(), 200);
  assert.equal((await h.call(`/api/phase6/scenarios/${scenario.scenarioId}`, asAdmin({ method: "PATCH", body: { status: "under-review" } }), 200)).json.scenario.version, 2);
  assert.equal(await h.count("SELECT COUNT(*) AS n FROM phase6_scenario_versions WHERE scenario_id = ?", scenario.scenarioId), 2);

  const report = (await h.call("/api/phase6/reports", asAdmin({ method: "POST",
    body: { scenarioId: scenario.scenarioId, question: "Review this synthetic scenario.", facts: {} } }), 201)).json.report;
  await h.call("/api/phase6/reports", asAdmin(), 200);
  await h.call(`/api/phase6/reports?clientId=${clientA.clientId}&status=review-required`, asAdmin(), 200);
  await h.call(`/api/phase6/reports/${report.reportId}/review`, asAdmin({ method: "POST", body: { decision: "approve" } }), 403);
  await h.call(`/api/phase6/reports/${report.reportId}/review`, { ...asReviewer, method: "POST", body: { decision: "approve", notes: "Reviewed." } }, 200);

  // Dashboards: org-wide admin, client-scoped admin, access-scoped reviewer.
  const dashboard = (await h.call("/api/phase6/dashboard", asAdmin(), 200)).json;
  assert.equal(dashboard.totalClients, 2);
  await h.call(`/api/phase6/dashboard?clientId=${clientA.clientId}`, asAdmin(), 200);
  await h.call("/api/phase6/dashboard", asReviewer, 200);
  await h.call("/api/phase6/clients", asReviewer, 200);
  await h.call("/api/phase6/scenarios", asReviewer, 200);
  await h.call("/api/phase6/reports", asReviewer, 200);
  await h.call("/api/phase6/compliance", asReviewer, 403); // reviewers have compliance:update only

  // A tax consultant assigned to one client exercises the access-scoped list SQL.
  await h.call("/api/phase6/users", asAdmin({ method: "POST",
    body: { email: "consultant-pg@example.invalid", role: "tax-consultant", clientIds: [clientA.clientId] } }), 201);
  const asConsultant = { token: await h.signIn("consultant-pg@example.invalid") };
  assert.equal((await h.call("/api/phase6/compliance", asConsultant, 200)).json.obligations.length, 1);
  assert.equal((await h.call("/api/phase6/engagements", asConsultant, 200)).json.engagements.length, 1);
  assert.equal((await h.call("/api/phase6/clients", asConsultant, 200)).json.clients.length, 1, "only the assigned client");
  await h.call("/api/phase6/documents", asConsultant, 200);
  await h.call("/api/phase6/dashboard", asConsultant, 200);

  // Tenant isolation.
  const now = new Date().toISOString();
  await h.db.prepare("INSERT INTO phase6_organizations (id, name, created_at, updated_at) VALUES ('pg-other-org', 'Other', ?, ?)").bind(now, now).run();
  const other = await h.addMember("pg-other-org", "other-pg@example.invalid", "practice-admin");
  await h.call(`/api/phase6/clients/${clientA.clientId}`, { token: other.token }, 404);
  assert.equal((await h.call("/api/phase6/clients", { token: other.token }, 200)).json.clients.length, 0);

  assert.equal(h.supabase.invitations.length, 2);
  assert.ok(await h.count("SELECT COUNT(*) AS n FROM phase6_audit_log") >= 20);
  await h.close();
});
