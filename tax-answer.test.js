const assert = require("node:assert/strict");
const test = require("node:test");
const { createTaxAnswerComposer } = require("./tax-answer.js");
const { createLegalSourceRegistry } = require("./legal-source-registry.js");
const { createCaseLawRegistry } = require("./case-law-registry.js");

function source(overrides = {}) {
  return {
    sourceId: "vat-section-27",
    sourceType: "legislation",
    title: "Fixture Value Added Tax Act",
    issuingAuthority: "Parliament of Uganda",
    legislation: "Fixture Value Added Tax Act",
    provision: "Section 27",
    publicationDate: "2024-01-01",
    effectiveDate: "2024-07-01",
    endDate: null,
    applicableTaxPeriods: ["2025/26"],
    officialSourceUrl: "https://example.invalid/vat-act",
    documentReference: "Fixture legislative copy, section 27",
    verificationStatus: "verified",
    lastVerificationDate: "2026-01-01",
    reviewer: "Source reviewer",
    relatedTaxHeads: ["value-added-tax"],
    ruleIds: [],
    primaryAuthority: true,
    ...overrides,
  };
}

function verifiedCase(overrides = {}) {
  return {
    caseId: "fixture-vat-case",
    caseName: "Example Taxpayer v Example Revenue Authority",
    citation: "Fixture Appeal No. 1 of 2025",
    court: "Supreme Court of Uganda",
    jurisdiction: "UG",
    judgmentDate: "2025-03-10",
    relatedTaxHeads: ["value-added-tax"],
    legalIssues: ["Input-tax evidence issue"],
    materialFacts: ["The parties disputed an input-tax claim."],
    decision: "Fixture decision.",
    legalReasoning: "Fixture reasoning.",
    relevantParagraphs: ["[12]"],
    legalPrinciple: "Fixture principle.",
    linkedLegislationSourceIds: ["vat-section-27"],
    linkedRuleIds: [],
    linkedAdvisoryIds: [],
    sourceDocument: { title: "Fixture judgment", url: "https://example.invalid/case", documentReference: "Fixture judgment paragraph 12" },
    verificationStatus: "verified",
    authorityClass: "persuasive",
    reviewer: "Case reviewer",
    reviewDate: "2026-01-01",
    ...overrides,
  };
}

function setup(sources = [source()], cases = []) {
  const legalSourceRegistry = createLegalSourceRegistry(sources);
  const caseLawRegistry = createCaseLawRegistry(cases);
  return {
    legalSourceRegistry,
    caseLawRegistry,
    composer: createTaxAnswerComposer({ legalSourceRegistry, caseLawRegistry }),
  };
}

function evidence(registry, ids, periodMatch = true) {
  return [{
    taxHead: "value-added-tax",
    taxPeriod: "2025/26",
    sources: ids.map((sourceId) => ({
      ...registry.getSourceById(sourceId),
      periodMatch,
      outdated: false,
      incomplete: false,
    })),
  }];
}

test("returns the complete structured answer schema without making an unsupported conclusion", () => {
  const { composer, legalSourceRegistry } = setup();
  const result = composer.compose({
    question: "Can I claim input VAT?",
    classification: { taxHeads: [{ id: "value-added-tax", label: "VAT" }] },
    clarification: { missingFacts: [{ field: "supportingDocuments", question: "Which documents?" }] },
    legalResearch: evidence(legalSourceRegistry, ["vat-section-27"]),
  });

  for (const key of [
    "directAnswer", "applicableTaxHead", "taxpayerOrTransaction", "taxPeriod", "legalBasis",
    "statutoryProvisions", "uraGuidance", "caseLaw", "taxTreatment", "computation",
    "assumptions", "missingInformation", "verificationStatus", "complianceImplications",
    "limitations", "citations", "auditTrail",
  ]) {
    assert.ok(Object.hasOwn(result, key), `missing response field ${key}`);
  }
  assert.match(result.directAnswer, /cannot establish a legal conclusion/i);
  assert.equal(result.citations[0].sourceId, "vat-section-27");
  assert.equal(result.taxTreatment.length, 0);
});

test("only a reviewed claim with registered verified in-period primary support is included", () => {
  const { composer, legalSourceRegistry } = setup();
  const result = composer.compose({
    question: "Can I claim input VAT?",
    classification: { taxHeads: [{ id: "value-added-tax", label: "VAT" }] },
    taxPeriod: "2025/26",
    legalResearch: evidence(legalSourceRegistry, ["vat-section-27"]),
    claims: [{
      text: "Reviewed fixture claim.",
      supportingSourceIds: ["vat-section-27"],
      supportReview: { reviewer: "Legal reviewer", reviewDate: "2026-10-01", rationale: "Reviewed against the registered provision." },
    }],
  });

  assert.equal(result.taxTreatment.length, 1);
  assert.equal(result.taxTreatment[0].text, "Reviewed fixture claim.");
  assert.deepEqual(result.taxTreatment[0].citationIds, ["legal-source:vat-section-27"]);
  assert.match(result.directAnswer, /Reviewed fixture claim/);
});

test("rejects claims with unknown, unverified, or out-of-period sources", () => {
  const pending = source({ sourceId: "pending-source", verificationStatus: "pending-review", primaryAuthority: true });
  const { composer, legalSourceRegistry } = setup([source(), pending]);
  const result = composer.compose({
    question: "Can I claim input VAT?",
    taxPeriod: "2025/26",
    legalResearch: evidence(legalSourceRegistry, ["vat-section-27", "pending-source"], false),
    claims: [
      { text: "Unknown-source claim", supportingSourceIds: ["missing-id"], supportReview: { reviewer: "R", reviewDate: "2026-10-01", rationale: "review" } },
      { text: "Pending-source claim", supportingSourceIds: ["pending-source"], supportReview: { reviewer: "R", reviewDate: "2026-10-01", rationale: "review" } },
      { text: "No-review claim", supportingSourceIds: ["vat-section-27"] },
    ],
  });

  assert.equal(result.taxTreatment.length, 0);
  assert.equal(result.rejectedClaims.length, 3);
  assert.ok(result.citations.every((citation) => citation.sourceId !== "missing-id"));
});

test("case references preserve registry classification and cannot support claims when unverified", () => {
  const unverified = {
    caseId: "unverified-case",
    caseName: "Unverified case reference",
    citation: "Unverified citation",
    jurisdiction: "UG",
    authorityClass: "unverified",
    verificationStatus: "unverified",
    sourceDocument: { url: "https://example.invalid/unverified" },
  };
  const { composer, caseLawRegistry } = setup([source()], [verifiedCase(), unverified]);
  const result = composer.compose({
    question: "Input VAT case law",
    taxPeriod: "2025/26",
    caseLaw: [caseLawRegistry.getCaseById("fixture-vat-case"), caseLawRegistry.getCaseById("unverified-case")],
    claims: [{
      text: "Case-based claim",
      supportingCaseIds: ["unverified-case"],
      supportReview: { reviewer: "Reviewer", reviewDate: "2026-10-01", rationale: "Reviewed" },
    }],
  });

  assert.equal(result.caseLaw.length, 2);
  assert.equal(result.caseLaw.find((item) => item.caseId === "unverified-case").verificationStatus, "unverified");
  assert.equal(result.taxTreatment.length, 0);
  assert.equal(result.rejectedClaims.length, 1);
});

test("computation output is passed through without recalculation and compliance is caveated", () => {
  const { composer } = setup();
  const calculatorResult = { outputVat: 18, recoverableInputVat: 0, netVat: 18 };
  const result = composer.compose({
    question: "Calculate VAT",
    calculation: { status: "completed", calculator: "calculateVat", source: "deterministic-calculator", result: calculatorResult },
  });

  assert.deepEqual(result.computation.result, calculatorResult);
  assert.equal(result.computation.source, "deterministic-calculator");
  assert.match(result.complianceImplications, /not a filing determination/i);
});
