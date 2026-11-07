"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  ClientStatus,
  createClientRecord,
  validateClientRecord,
} = require("./client-model.js");
const { createClientManagementService } = require("./client-management.js");
const { ClientTaxProfile, createClientTaxProfileRecord } = require("./client-tax-profiles.js");
const {
  CalendarEntry,
  ComplianceStatus,
  TaxObligationType,
  createCalendarEntryRecord,
  filterComplianceEntries,
  getPaidComplianceEntries,
  transitionComplianceEntry,
} = require("./compliance-calendar.js");
const {
  DocumentStatus,
  DocumentType,
  createDocumentRecord,
  isValidFileSize,
  isValidFileType,
  transitionDocumentRecord,
} = require("./document-management.js");
const {
  TaxHead,
  TransactionStatus,
  createDocumentAnalysisProposal,
  reviewDocumentAnalysisProposal,
} = require("./document-to-tax-analysis.js");
const { buildClientDashboard } = require("./client-dashboards.js");
const {
  ScenarioStatus,
  createAuditEvent,
  createClientReportRecord,
  createScenarioRecord,
  transitionScenario,
} = require("./phase6-records.js");

const now = "2026-11-04T12:00:00.000Z";

test("client records are versioned, practice-scoped, and timestamped", () => {
  const client = createClientRecord({
    clientId: "fixture-client-1",
    practiceId: "fixture-practice-1",
    legalBusinessName: "Example Test Company",
    tin: "1234567890",
  }, { now });

  assert.equal(client.schemaVersion, 1);
  assert.equal(client.practiceId, "fixture-practice-1");
  assert.equal(client.status, ClientStatus.Active);
  assert.equal(client.createdAt, now);
  assert.equal(client.updatedAt, now);
  assert.equal(client.archivedAt, null);
});

test("client records reject missing ownership, invalid enums, and malformed timestamps", () => {
  const base = {
    schemaVersion: 1,
    clientId: "fixture-client-1",
    practiceId: "fixture-practice-1",
    legalBusinessName: "Example Test Company",
    tin: null,
    entityType: "company",
    taxpayerCategory: "company",
    status: "active",
    createdAt: now,
    updatedAt: now,
    archivedAt: null,
  };

  assert.throws(() => createClientRecord({ ...base, practiceId: " " }, { now }), /practiceId/);
  assert.throws(() => validateClientRecord({ ...base, entityType: "unknown" }), /entityType/);
  assert.throws(() => validateClientRecord({ ...base, createdAt: "2026-11-04" }), /UTC ISO timestamp/);
});

test("client archive state and archive timestamp must agree", () => {
  const record = createClientRecord({
    clientId: "fixture-client-1",
    practiceId: "fixture-practice-1",
    legalBusinessName: "Example Test Company",
    status: ClientStatus.Archived,
    archivedAt: now,
  }, { now });

  assert.equal(record.status, ClientStatus.Archived);
  assert.equal(record.archivedAt, now);
  assert.throws(() => validateClientRecord({ ...record, archivedAt: null }), /require archivedAt/);
});

function memoryClientRepository() {
  const clients = new Map();
  return {
    async findById(practiceId, clientId) {
      return clients.get(`${practiceId}:${clientId}`) || null;
    },
    async findByTin(practiceId, tin) {
      return [...clients.values()].find((client) => client.practiceId === practiceId && client.tin === tin) || null;
    },
    async listByPractice(practiceId) {
      return [...clients.values()].filter((client) => client.practiceId === practiceId);
    },
    async insert(client) {
      const key = `${client.practiceId}:${client.clientId}`;
      if (clients.has(key)) throw new Error("duplicate client");
      clients.set(key, client);
      return client;
    },
    async replace(client) {
      const key = `${client.practiceId}:${client.clientId}`;
      if (!clients.has(key)) return null;
      clients.set(key, client);
      return client;
    },
  };
}

test("client service scopes repository calls, rejects duplicate TINs, and archives", async () => {
  const repository = memoryClientRepository();
  let id = 0;
  const service = createClientManagementService({
    repository,
    createId: () => `fixture-client-${++id}`,
    clock: () => new Date(now),
  });
  const first = await service.create("fixture-practice-1", {
    legalBusinessName: "Example Test Company",
    tin: "1234567890",
    entityType: "company",
    taxpayerCategory: "company",
  });

  assert.equal(first.practiceId, "fixture-practice-1");
  assert.equal((await service.get("fixture-practice-2", first.clientId)), null);
  await assert.rejects(() => service.create("fixture-practice-1", {
    legalBusinessName: "Duplicate Test Company",
    tin: "1234567890",
  }), /TIN already exists/);
  await assert.rejects(() => service.create("fixture-practice-1", {
    practiceId: "forged-practice",
    legalBusinessName: "Forged Scope",
  }), /practiceId is server-managed/);

  const archived = await service.archive("fixture-practice-1", first.clientId);
  assert.equal(archived.status, ClientStatus.Archived);
  assert.equal(archived.archivedAt, now);
});

test("client tax profiles preserve false values and validate versioned ownership", () => {
  const profile = createClientTaxProfileRecord({
    practiceId: "fixture-practice-1",
    clientId: "fixture-client-1",
    payeObligation: false,
    whtAgentStatus: false,
    notes: "",
  }, { now });

  assert.equal(profile.schemaVersion, 1);
  assert.equal(profile.payeObligation, false);
  assert.equal(profile.whtAgentStatus, false);
  assert.equal(profile.createdAt, now);
  assert.throws(() => createClientTaxProfileRecord({ clientId: "fixture-client-1" }, { now }), /practiceId/);
  assert.throws(() => createClientTaxProfileRecord({
    practiceId: "fixture-practice-1",
    clientId: "fixture-client-1",
    vatRegistrationEffectiveDate: "2026-02-30",
  }, { now }), /valid ISO date/);
  assert.equal(new ClientTaxProfile("fixture-client-1", { practiceId: "fixture-practice-1" }, { now }).validate(), true);
});

function calendarEntry(overrides = {}) {
  return createCalendarEntryRecord({
    obligationId: "fixture-obligation-1",
    practiceId: "fixture-practice-1",
    clientId: "fixture-client-1",
    taxObligationType: TaxObligationType.VAT,
    taxPeriod: "2025/26",
    filingDeadline: "2026-08-15",
    paymentDeadline: "2026-08-15",
    outstandingAmount: 0,
    ...overrides,
  }, { now });
}

test("compliance records validate versioned ownership, periods, and unverified deadlines", () => {
  const entry = calendarEntry({ deadlineVerificationStatus: "verified" });
  assert.equal(entry.schemaVersion, 1);
  assert.equal(entry.taxPeriod, "2025/26");
  assert.equal(entry.deadlineVerificationStatus, "unverified");
  assert.equal(entry.outstandingAmount, 0);
  assert.equal(new CalendarEntry({ ...entry }).validate(), true);
  assert.throws(() => calendarEntry({ taxPeriod: "2025/2026" }), /YYYY\/YY/);
  assert.throws(() => calendarEntry({ paymentDeadline: "2026-02-30" }), /valid ISO date/);
  assert.throws(() => calendarEntry({ outstandingAmount: -1 }), /non-negative/);
});

test("compliance transitions are explicit and payment filters include paid records", () => {
  const entry = calendarEntry();
  const prepared = transitionComplianceEntry(entry, { filingStatus: ComplianceStatus.Prepared }, { now });
  assert.equal(prepared.filingStatus, ComplianceStatus.Prepared);
  assert.equal(prepared.statusHistory.length, 1);
  assert.throws(() => transitionComplianceEntry(prepared, { filingStatus: ComplianceStatus.Upcoming }, { now }), /Invalid filing status transition/);

  const paid = transitionComplianceEntry(entry, { paymentStatus: ComplianceStatus.Paid }, { now });
  assert.equal(getPaidComplianceEntries([entry, paid]).length, 1);
  assert.equal(filterComplianceEntries([entry, paid], { practiceId: "fixture-practice-1", clientId: "fixture-client-1" }).length, 2);
  assert.equal(filterComplianceEntries([entry], { practiceId: "other-practice" }).length, 0);
});

test("compliance deadline comparisons use explicit calendar dates", () => {
  const entry = new CalendarEntry(calendarEntry());
  assert.equal(entry.isFilingDeadlineOverdue("2026-08-15"), false);
  assert.equal(entry.isFilingDeadlineOverdue("2026-08-16"), true);
  assert.equal(entry.isPaymentDeadlineOverdue("2026-08-16"), true);
});

function documentRecord(overrides = {}) {
  return createDocumentRecord({
    documentId: "fixture-document-1",
    practiceId: "fixture-practice-1",
    clientId: "fixture-client-1",
    documentType: DocumentType.PurchaseInvoice,
    fileName: "invoice.pdf",
    contentType: "application/pdf",
    sizeBytes: 1024,
    taxPeriod: "2025/26",
    ...overrides,
  }, { now });
}

test("document metadata enforces ownership, file limits, and pending review", () => {
  const document = documentRecord({ status: DocumentStatus.Reviewed });
  assert.equal(document.schemaVersion, 1);
  assert.equal(document.practiceId, "fixture-practice-1");
  assert.equal(document.status, DocumentStatus.PendingReview);
  assert.equal(isValidFileType("invoice.pdf", "application/pdf"), true);
  assert.equal(isValidFileType("invoice.pdf", "text/html"), false);
  assert.equal(isValidFileSize(1024, DocumentType.PurchaseInvoice), true);
  assert.equal(isValidFileSize(-1, DocumentType.PurchaseInvoice), false);
  assert.throws(() => documentRecord({ fileName: "../invoice.pdf" }), /basename/);
  assert.throws(() => documentRecord({ fileName: ".pdf" }), /basename/);
  assert.throws(() => documentRecord({ contentType: undefined }), /contentType/);
  assert.throws(() => documentRecord({ sha256: 12345 }), /hexadecimal digest/);
  assert.throws(() => documentRecord({ sizeBytes: 10 * 1024 * 1024 + 1 }), /exceeds/);
  assert.throws(() => documentRecord({ contentType: "text/html" }), /Unsupported/);
});

test("document metadata transitions require review and retain reviewer history", () => {
  const pending = documentRecord();
  const reviewed = transitionDocumentRecord(pending, {
    decision: DocumentStatus.Reviewed,
    reviewerId: "fixture-reviewer",
  }, { now });
  assert.equal(reviewed.status, DocumentStatus.Reviewed);
  assert.equal(reviewed.reviewHistory[0].actorId, "fixture-reviewer");
  const archived = transitionDocumentRecord(reviewed, {
    decision: DocumentStatus.Archived,
    reviewerId: "fixture-reviewer",
  }, { now });
  assert.equal(archived.status, DocumentStatus.Archived);
  assert.throws(() => transitionDocumentRecord(pending, { decision: DocumentStatus.Reviewed }, { now }), /reviewerId/);
  assert.throws(() => transitionDocumentRecord(reviewed, {
    decision: DocumentStatus.PendingReview,
    reviewerId: "fixture-reviewer",
  }, { now }), /Invalid document status transition/);
});

test("document analysis stays proposed until a human confirms or corrects it", () => {
  const proposal = createDocumentAnalysisProposal({
    proposalId: "fixture-proposal-1",
    practiceId: "fixture-practice-1",
    clientId: "fixture-client-1",
    documentId: "fixture-document-1",
    taxPeriod: "2025/26",
    taxHead: TaxHead.ValueAddedTax,
    field: "invoice.amount",
    proposedValue: 0,
    sourcePage: 1,
    confidence: 0.8,
    status: TransactionStatus.Accepted,
  }, { now });
  assert.equal(proposal.status, TransactionStatus.Proposed);
  assert.equal(proposal.confirmedValue, null);
  const accepted = reviewDocumentAnalysisProposal(proposal, {
    decision: TransactionStatus.Accepted,
    reviewerId: "fixture-reviewer",
  }, { now });
  assert.equal(accepted.confirmedValue, 0);
  assert.equal(accepted.status, TransactionStatus.Accepted);
  const corrected = reviewDocumentAnalysisProposal(proposal, {
    decision: TransactionStatus.Corrected,
    reviewerId: "fixture-reviewer",
    correctedValue: 1200,
  }, { now });
  assert.equal(corrected.confirmedValue, 1200);
  assert.throws(() => reviewDocumentAnalysisProposal(proposal, {
    decision: TransactionStatus.Accepted,
  }, { now }), /reviewerId/);
  assert.throws(() => createDocumentAnalysisProposal({
    proposalId: "bad",
    practiceId: "fixture-practice-1",
    clientId: "fixture-client-1",
    documentId: "fixture-document-1",
    taxHead: TaxHead.ValueAddedTax,
    field: "invoice.amount",
    proposedValue: 10,
    sourcePage: 0,
    confidence: 1.1,
  }, { now }), /sourcePage/);
});

test("client dashboard aggregates only a single practice and client scope", () => {
  const client = createClientRecord({
    clientId: "fixture-client-1",
    practiceId: "fixture-practice-1",
    legalBusinessName: "Example Test Company",
  }, { now });
  const dashboard = buildClientDashboard({
    practiceId: "fixture-practice-1",
    clientId: "fixture-client-1",
    client,
    obligations: [calendarEntry({ filingStatus: ComplianceStatus.Overdue })],
    documents: [documentRecord()],
    scenarios: [{ practiceId: "fixture-practice-1", clientId: "fixture-client-1", status: "draft" }],
    asOf: "2026-11-04",
  });
  assert.deepEqual(dashboard.counts, {
    openObligations: 1,
    overdueObligations: 1,
    documentsPendingReview: 1,
    draftScenarios: 1,
  });
  assert.throws(() => buildClientDashboard({
    practiceId: "fixture-practice-1",
    clientId: "fixture-client-1",
    client,
    obligations: [{ practiceId: "other-practice", clientId: "fixture-client-1" }],
  }), /outside the requested dashboard scope/);
});

test("scenario, report, and audit records are versioned and remain review-gated", () => {
  const scenario = createScenarioRecord({
    scenarioId: "fixture-scenario-1",
    practiceId: "fixture-practice-1",
    clientId: "fixture-client-1",
    taxPeriod: "2025/26",
    inputSnapshot: { amount: 0, vatRegistered: false },
    resultSnapshot: { taxHeads: [{ status: "review-required" }], finalTaxPayable: null },
    sourceIds: ["pending-source-fixture"],
  }, { now });
  assert.equal(scenario.status, ScenarioStatus.Draft);
  assert.equal(scenario.inputSnapshot.vatRegistered, false);
  assert.equal(transitionScenario(scenario, ScenarioStatus.UnderReview, { now }).status, ScenarioStatus.UnderReview);
  assert.throws(() => transitionScenario(scenario, "approved", { now }), /Invalid scenario status transition/);

  const report = createClientReportRecord({
    reportId: "fixture-report-1",
    practiceId: "fixture-practice-1",
    clientId: "fixture-client-1",
    reportType: "tax-research",
    status: "issued",
    sourceIds: ["pending-source-fixture"],
  }, { now });
  assert.equal(report.status, "review-required");
  assert.equal(report.legalVerificationStatus, "not-established");
  const audit = createAuditEvent({
    eventId: "fixture-event-1",
    practiceId: "fixture-practice-1",
    actorId: "fixture-server-principal",
    action: "client.read",
    resourceType: "client",
    resourceId: "fixture-client-1",
    occurredAt: now,
    metadata: { source: "synthetic-test" },
  });
  assert.equal(audit.actorId, "fixture-server-principal");
  assert.throws(() => createAuditEvent({ ...audit, actorId: " " }), /actorId/);
});