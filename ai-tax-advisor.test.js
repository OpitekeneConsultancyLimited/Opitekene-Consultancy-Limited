const assert = require("node:assert/strict");
const test = require("node:test");
const { createTaxAdvisor } = require("./ai-tax-advisor.js");
const { createLegalSourceRegistry } = require("./legal-source-registry.js");
const { createCaseLawRegistry } = require("./case-law-registry.js");

function legalSource(overrides = {}) {
  return {
    sourceId: "fixture-vat-act",
    sourceType: "legislation",
    title: "Fixture Value Added Tax Act",
    issuingAuthority: "Parliament of Uganda",
    legislation: "Fixture Value Added Tax Act",
    provision: "Section 27",
    publicationDate: "2024-01-01",
    effectiveDate: "2024-07-01",
    endDate: null,
    applicableTaxPeriods: ["2024/25", "2025/26"],
    officialSourceUrl: "https://example.invalid/vat-act",
    documentReference: "Fixture Act copy, section 27",
    verificationStatus: "verified",
    lastVerificationDate: "2026-01-01",
    reviewer: "Test reviewer",
    relatedTaxHeads: ["value-added-tax"],
    keywords: ["input tax", "credit", "deduction"],
    ruleIds: [],
    primaryAuthority: true,
    version: "fixture-v1",
    ...overrides,
  };
}

test("advisor orchestrates classification, clarification, legal retrieval, and local guidance", async () => {
  const advisor = createTaxAdvisor({ requestIdFactory: () => "test-request-1" });
  const result = await advisor.advise({ question: "Can I claim input VAT on this purchase?" });

  assert.equal(result.requestId, "test-request-1");
  assert.ok(result.classification.taxHeads.some((head) => head.id === "value-added-tax"));
  assert.ok(result.clarification.missingFacts.length > 0);
  assert.equal(result.legalResearch[0].adequateVerifiedAuthorityAvailable, false);
  assert.ok(result.supplementalGuidance.length > 0);
  assert.equal(result.calculation.status, "not-requested");
  assert.match(result.answer, /No adequate verified (?:legal|primary) authority/);
  assert.equal(result.answer, result.structuredAnswer.directAnswer);
  assert.ok(Object.hasOwn(result.structuredAnswer, "citations"));
  assert.equal(result.providerStatus, "not-configured");
  assert.match(result.auditRecord.questionHash, /^[a-f0-9]{64}$/);
  assert.equal(Object.hasOwn(result.auditRecord, "question"), false);
  const report = advisor.createResearchReport({
    advisorResult: result,
    question: "Can I claim input VAT on this purchase?",
    reportDate: "2026-11-03",
  });
  assert.equal(report.taxPeriod, null);
  assert.match(report.disclaimer, /not a formal legal opinion/i);
});

test("advisor retrieves registered primary sources and unverified case references without upgrading status", async () => {
  const advisor = createTaxAdvisor({
    legalSourceRegistry: createLegalSourceRegistry([legalSource()]),
    caseLawRegistry: createCaseLawRegistry(),
    requestIdFactory: () => "evidence-request",
  });
  const result = await advisor.advise({
    question: "How does input VAT work?",
    taxPeriod: "2025/26",
  });

  assert.equal(result.legalResearch[0].adequateVerifiedAuthorityAvailable, true);
  assert.equal(result.legalResearch[0].citations[0].sourceId, "fixture-vat-act");
  assert.ok(result.caseLaw.some((entry) => entry.verificationStatus === "unverified"));
  assert.ok(result.auditRecord.sourceIds.includes("fixture-vat-act"));
});

test("advisor calls an existing calculator only for an explicit structured calculation request", async () => {
  let calls = 0;
  const advisor = createTaxAdvisor({
    taxCalculator: {
      calculateVat(input) {
        calls += 1;
        assert.deepEqual(input, { standardRatedSales: 100 });
        return { outputVat: 18, netVat: 18 };
      },
    },
  });

  const noRequest = await advisor.advise({ question: "How much VAT on UGX 100?" });
  assert.equal(calls, 0);
  assert.equal(noRequest.calculation.status, "not-requested");

  const explicitRequest = await advisor.advise({
    question: "Calculate VAT on the supplied data.",
    calculatorRequest: { calculator: "calculateVat", input: { standardRatedSales: 100 } },
  });
  assert.equal(calls, 1);
  assert.deepEqual(explicitRequest.calculation.result, { outputVat: 18, netVat: 18 });
  assert.equal(explicitRequest.calculation.source, "deterministic-calculator");
  assert.equal(explicitRequest.structuredAnswer.computation.explanation.calculator, "calculateVat");
});

test("advisor delegates structured transaction analysis and preserves independent tax heads", async () => {
  let received = null;
  const advisor = createTaxAdvisor({
    multiTaxAnalysis: {
      assessTransaction(input, calculator) {
        received = { input, calculator };
        return { taxHeads: [{ key: "value-added-tax" }, { key: "withholding-tax" }], finalTaxPayable: null };
      },
    },
    taxCalculator: { calculateVat: () => ({}) },
  });
  const transaction = { scenario: "supply-of-services", eventDate: "2025-02-01", amount: 1000 };
  const result = await advisor.advise({ question: "Review this transaction", transaction });

  assert.equal(received.input, transaction);
  assert.ok(received.calculator);
  assert.equal(result.transactionAnalysis.taxHeads.length, 2);
  assert.equal(result.transactionAnalysis.finalTaxPayable, null);
  assert.equal(result.structuredAnswer.transactionAnalysis.finalTaxPayable, null);
  assert.equal(result.structuredAnswer.transactionAnalysis.noDoubleCount, true);
});

test("provider errors fall back without returning a provider draft as the answer", async () => {
  const advisor = createTaxAdvisor({
    aiProvider: { async generate() { throw new Error("provider offline"); } },
    requestIdFactory: () => "fallback-request",
  });
  const result = await advisor.advise({ question: "What VAT applies?", providerConsent: true });

  assert.equal(result.providerStatus, "unavailable");
  assert.equal(result.providerDraft, null);
  assert.match(result.answer, /No adequate verified (?:legal|primary) authority/);
  assert.equal(result.auditRecord.requestId, "fallback-request");
});

test("provider requires consent and excludes client facts by default", async () => {
  let calls = 0;
  let payload;
  const advisor = createTaxAdvisor({
    aiProvider: { async generate(value) { calls += 1; payload = value; return "untrusted draft"; } },
  });
  const withoutConsent = await advisor.advise({ question: "What VAT applies?", facts: { accountNumber: "private" } });
  assert.equal(calls, 0);
  assert.equal(withoutConsent.providerStatus, "consent-required");

  const withConsent = await advisor.advise({
    question: "What VAT applies?",
    facts: { accountNumber: "private" },
    providerConsent: true,
  });
  assert.equal(calls, 1);
  assert.equal(payload.facts, undefined);
  assert.equal(payload.transactionAnalysis, undefined);
  assert.equal(payload.calculation, undefined);
  assert.equal(withConsent.providerDraft, "untrusted draft");
  assert.notEqual(withConsent.answer, withConsent.providerDraft);
});

test("client facts reach a provider only after separate explicit sharing consent", async () => {
  let payload;
  const advisor = createTaxAdvisor({
    aiProvider: { async generate(value) { payload = value; return "draft"; } },
  });
  await advisor.advise({
    question: "What VAT applies?",
    facts: { transactionAmount: 100 },
    providerConsent: true,
    shareFactsWithProvider: true,
  });
  assert.deepEqual(payload.facts, { transactionAmount: 100 });
});

test("provider timeouts fall back and oversized or non-JSON inputs are rejected", async () => {
  const advisor = createTaxAdvisor({
    aiProvider: { generate: () => new Promise(() => {}) },
    providerTimeoutMs: 5,
  });
  const timedOut = await advisor.advise({ question: "What VAT applies?", providerConsent: true });
  assert.equal(timedOut.providerStatus, "unavailable");
  await assert.rejects(() => advisor.advise({ question: "x".repeat(1601) }), RangeError);
  await assert.rejects(() => advisor.advise({ question: "VAT", facts: { value: 1n } }), TypeError);
  await assert.rejects(() => advisor.advise({ question: "VAT", facts: { note: "x".repeat(12_001) } }), RangeError);
});

test("advisor rejects malformed calculation requests and unknown calculator methods", async () => {
  const advisor = createTaxAdvisor();
  await assert.rejects(() => advisor.advise({
    question: "Calculate tax",
    calculatorRequest: { calculator: "inventedCalculator", input: {} },
  }), RangeError);
  await assert.rejects(() => advisor.advise({
    question: "Calculate tax",
    calculatorRequest: { calculator: "calculateVat", input: [] },
  }), TypeError);
});
