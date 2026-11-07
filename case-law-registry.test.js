const assert = require("node:assert/strict");
const test = require("node:test");
const { taxCases } = require("./tax-advisory.js");
const {
  createCaseLawRegistry,
  caseRecordGaps,
} = require("./case-law-registry.js");

function caseFixture(overrides = {}) {
  return {
    caseId: "fixture-case-1",
    caseName: "Example Taxpayer v Example Revenue Authority",
    citation: "Fixture Civil Appeal No. 1 of 2025",
    court: "Supreme Court of Uganda",
    jurisdiction: "UG",
    judgmentDate: "2025-03-10",
    relatedTaxHeads: ["value-added-tax"],
    legalIssues: ["Whether the documented input-tax adjustment was available."],
    materialFacts: ["The parties disputed an input-tax adjustment."],
    decision: "Fixture decision summary for registry testing.",
    legalReasoning: "Fixture reasoning summary for registry testing.",
    relevantParagraphs: ["[12]", "[18]"],
    legalPrinciple: "Fixture principle used only in automated tests.",
    linkedLegislationSourceIds: ["fixture-vat-act"],
    linkedRuleIds: ["fixture-vat-rule"],
    linkedAdvisoryIds: ["fixture-vat-guidance"],
    sourceDocument: {
      title: "Fixture judgment document",
      url: "https://example.invalid/fixture-judgment",
      documentReference: "Fixture judgment, paragraph 12",
    },
    verificationStatus: "verified",
    authorityClass: "binding",
    reviewer: "Test reviewer",
    reviewDate: "2026-10-01",
    ...overrides,
  };
}

test("existing curated cases are imported without promoting their legal status", () => {
  const registry = createCaseLawRegistry();
  const imported = registry.getAllCases();

  assert.equal(imported.length, taxCases.length);
  for (const legacyCase of imported) {
    const sourceCase = taxCases.find((item) => item.id === legacyCase.caseId);
    assert.equal(legacyCase.verificationStatus, "unverified");
    assert.equal(legacyCase.authorityClass, "unverified");
    assert.equal(legacyCase.caseName, sourceCase.name);
    assert.equal(legacyCase.sourceDocument.url, sourceCase.sourceUrl);
    assert.equal(legacyCase.legalPrinciple, null);
  }
});

test("verified records preserve structured issues, reasoning, paragraphs and cross-links", () => {
  const registry = createCaseLawRegistry([caseFixture()]);
  const result = registry.searchCases({
    question: "input tax adjustment",
    taxHead: "value-added-tax",
  });

  assert.equal(result.length, 1);
  assert.equal(result[0].authorityClass, "binding");
  assert.equal(result[0].legalIssues.length, 1);
  assert.deepEqual(result[0].relevantParagraphs, ["[12]", "[18]"]);
  assert.deepEqual(result[0].linkedLegislationSourceIds, ["fixture-vat-act"]);
  assert.deepEqual(result[0].linkedRuleIds, ["fixture-vat-rule"]);
  assert.deepEqual(result[0].linkedAdvisoryIds, ["fixture-vat-guidance"]);
});

test("other-jurisdiction decisions are distinguished and are not classified as Uganda binding authority", () => {
  const registry = createCaseLawRegistry([caseFixture({
    caseId: "fixture-kenya-case",
    court: "Example Court of Appeal",
    jurisdiction: "KE",
    authorityClass: "other-jurisdiction",
  })]);

  const found = registry.getCaseById("fixture-kenya-case");
  assert.equal(found.authorityClass, "other-jurisdiction");
  assert.equal(found.jurisdiction, "KE");
  assert.throws(() => createCaseLawRegistry([caseFixture({
    caseId: "invalid-kenya-binding-case",
    jurisdiction: "KE",
    authorityClass: "binding",
  })]), RangeError);
});

test("unverified references may be stored but cannot claim binding or persuasive status", () => {
  const registry = createCaseLawRegistry([{
    caseId: "unverified-reference",
    caseName: "Unverified case reference",
    citation: "Unverified citation supplied for review",
    jurisdiction: "UG",
    authorityClass: "unverified",
    verificationStatus: "unverified",
  }]);

  assert.equal(registry.getCaseById("unverified-reference").authorityClass, "unverified");
  assert.ok(caseRecordGaps(registry.getCaseById("unverified-reference")).length > 0);
  assert.throws(() => createCaseLawRegistry([caseFixture({
    caseId: "unsupported-binding-claim",
    verificationStatus: "unverified",
  })]), RangeError);
});

test("verified classification requires complete source and review metadata", () => {
  assert.throws(() => createCaseLawRegistry([caseFixture({
    sourceDocument: { url: "https://example.invalid/judgment" },
    legalReasoning: null,
  })]), RangeError);
});

test("case retrieval respects tax-head and jurisdiction filters and returns no invented match", () => {
  const registry = createCaseLawRegistry([caseFixture()]);

  assert.equal(registry.searchCases({
    question: "input tax adjustment",
    taxHead: "withholding-tax",
  }).length, 0);
  assert.equal(registry.searchCases({
    question: "fixture decision",
    jurisdiction: "KE",
  }).length, 0);
  assert.equal(registry.searchCases({ question: "fictional unrelated issue" }).length, 0);
});
