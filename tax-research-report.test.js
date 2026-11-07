const assert = require("node:assert/strict");
const test = require("node:test");
const {
  createTaxResearchReportService,
  toPrintableHtml,
  toCitationCsv,
} = require("./tax-research-report.js");
const { createLegalSourceRegistry } = require("./legal-source-registry.js");
const { createCaseLawRegistry } = require("./case-law-registry.js");

function reportService() {
  return createTaxResearchReportService({
    legalSourceRegistry: createLegalSourceRegistry([{
      sourceId: "fixture",
      sourceType: "legislation",
      title: "Fixture Act",
      issuingAuthority: "Parliament of Uganda",
      legislation: "Fixture Act",
      provision: "Section 1",
      publicationDate: "2025-01-01",
      effectiveDate: "2025-07-01",
      endDate: null,
      applicableTaxPeriods: ["2025/26"],
      officialSourceUrl: "https://example.invalid/fixture-act",
      documentReference: "Fixture Act copy, section 1",
      verificationStatus: "verified",
      lastVerificationDate: "2026-01-01",
      reviewer: "Report test reviewer",
      relatedTaxHeads: ["value-added-tax"],
      ruleIds: [],
      primaryAuthority: true,
    }]),
    caseLawRegistry: createCaseLawRegistry([]),
    clock: () => new Date("2026-11-03T00:00:00.000Z"),
  });
}

function answerFixture(overrides = {}) {
  return {
    directAnswer: "No verified legal conclusion is available.",
    applicableTaxHead: ["value-added-tax"],
    taxpayerOrTransaction: { supplier: "Example Ltd" },
    taxPeriod: "2025/26",
    legalBasis: {
      statutoryProvisions: [],
      uraGuidance: [],
      judicialSources: [],
      secondaryCommentary: [],
    },
    statutoryProvisions: [],
    uraGuidance: [],
    caseLaw: [],
    taxTreatment: [],
    computation: { status: "not-requested", result: null },
    assumptions: ["No confidential client identifiers were supplied."],
    missingInformation: [{ field: "transactionDate", question: "When did the transaction occur?", why: "Effective dates matter." }],
    verificationStatus: { adequateVerifiedPrimaryAuthority: false },
    complianceImplications: "Not a filing determination.",
    limitations: ["Citations identify source records but do not validate support."],
    citations: [{
      citationId: "legal-source:fixture",
      sourceId: "fixture",
      title: "Fixture Act",
      authorityType: "legislation",
      provision: "Section 1",
      verificationStatus: "verified",
      effectiveFrom: "2025-07-01",
      effectiveTo: null,
      documentReference: "Fixture Act copy, section 1",
      url: "https://example.invalid/fixture-act",
    }],
    auditTrail: { sourceIds: ["fixture"], caseIds: [] },
    ...overrides,
  };
}

test("builds a structured professional research report with explicit caveats", () => {
  const report = reportService().buildResearchReport({
    answer: answerFixture(),
    question: "What VAT applies to this supply?",
    client: { name: "Example taxpayer", type: "company" },
    facts: { amount: 0, vatRegistered: false },
    risks: ["Confirm supplier registration."],
    recommendations: ["Obtain the transaction invoice."],
    reportDate: "2026-11-03",
  });

  assert.equal(report.taxPeriod, "2025/26");
  assert.equal(report.client.name, "Example taxpayer");
  assert.equal(report.facts.amount, 0);
  assert.equal(report.facts.vatRegistered, false);
  assert.equal(report.issues.length, 1);
  assert.equal(report.legalSources[0].sourceId, "fixture");
  assert.equal(report.risks[0], "Confirm supplier registration.");
  assert.equal(report.recommendations[0].text, "Obtain the transaction invoice.");
  assert.equal(report.recommendations[0].reviewRequired, true);
  assert.match(report.disclaimer, /not a formal legal opinion/i);
  assert.equal(report.reportDate, "2026-11-03");
});

test("printable HTML escapes user and source content and retains only HTTPS links", () => {
  const report = reportService().buildResearchReport({
    answer: answerFixture({ directAnswer: "<script>alert(1)</script>" }),
    question: "<img src=x onerror=alert(1)>",
  });
  const html = toPrintableHtml(report);

  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /&lt;img/);
  assert.match(html, /https:\/\/example\.invalid\/fixture-act/);
  assert.match(html, /not a formal legal opinion/i);
});

test("citation CSV quotes values and preserves source status and document references", () => {
  const report = reportService().buildResearchReport({ answer: answerFixture(), question: "VAT report" });
  const csv = toCitationCsv(report);

  assert.match(csv, /"Citation ID","Source ID","Title","Authority Type","Verification Status"/);
  assert.match(csv, /"legal-source:fixture","fixture","Fixture Act","legislation","verified"/);
  assert.match(csv, /Fixture Act copy, section 1/);
  assert.match(toCitationCsv({ ...report, legalSources: [] }), /Citation ID/);
});

test("rejects citations that do not resolve to the legal-source registry", () => {
  const answer = answerFixture({
    citations: [{ citationId: "legal-source:invented", sourceId: "invented", title: "Invented", authorityType: "legislation" }],
  });
  assert.throws(() => reportService().buildResearchReport({ answer, question: "VAT report" }), RangeError);
});

test("CSV neutralizes spreadsheet formulas from source metadata", () => {
  const report = reportService().buildResearchReport({
    answer: answerFixture({ directAnswer: "=HYPERLINK(\"https://example.invalid\")" }),
    question: "VAT report",
  });
  const csv = toCitationCsv({
    ...report,
    legalSources: report.legalSources.map((source) => ({ ...source, title: "=1+1" })),
  });

  assert.match(csv, /"'=1\+1"/);
});

test("rejects incomplete report inputs rather than creating unsupported tax reports", () => {
  const service = reportService();
  assert.throws(() => service.buildResearchReport({ question: "VAT" }), TypeError);
  assert.throws(() => service.buildResearchReport({ answer: answerFixture(), question: " " }), TypeError);
  assert.throws(() => service.buildResearchReport({ answer: answerFixture(), question: "VAT", facts: [] }), TypeError);
});
