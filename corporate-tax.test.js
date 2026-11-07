const assert = require("node:assert/strict");
const test = require("node:test");
const taxRules = require("./tax-rules.js");
const taxCalculator = require("./tax-calculator.js");
const { calculateCorporateIncomeTax, PROVISIONAL_NOTICE } = require("./corporate-tax.js");

function input(overrides = {}) {
  return {
    calculationMode: "simulation",
    taxpayerCategory: "resident-company",
    periodStart: "2026-07-01",
    periodEnd: "2027-06-30",
    accountingProfit: 100_000_000,
    addBacks: [{ description: "Unconfirmed expense adjustment", amount: 10_000_000 }],
    exemptIncome: [{ description: "User-confirmed exempt income", amount: 2_000_000 }],
    allowableDeductions: [{ description: "Other deduction", amount: 3_000_000 }],
    capitalAllowances: [{ description: "User-entered schedule", amount: 5_000_000 }],
    carriedForwardLosses: 2_000_000,
    provisionalTaxPaid: 10_000_000,
    withholdingTaxCredits: 2_000_000,
    ...overrides,
  };
}

function verifiedCompanyRegistry({
  rate = 0.25,
  effectiveFrom,
  effectiveTo,
  status = "verified",
} = {}) {
  return taxRules.createTaxRulesRegistry([{
    ruleId: "fixture-company-rate-v1",
    ruleFamilyId: "fixture-company-rate",
    taxHead: "income-tax",
    category: "company-resident-standard",
    taxpayerType: "company",
    jurisdiction: "UG",
    legislation: "Mock legislation for tests only",
    provision: "Mock provision for tests only",
    officialSourceType: "uganda-legislation",
    officialSourceUrl: "https://example.invalid/mock-legislation",
    effectiveFrom: effectiveFrom || "2024-07-01",
    effectiveTo: effectiveTo || "2025-06-30",
    effectiveDatesVerified: true,
    value: rate,
    calculationMethodology: "Test fixture only; not a Uganda tax rule.",
    status,
    reviewer: "Test reviewer",
    reviewDate: "2024-06-01",
    verifiedOn: "2024-06-01",
    ...(status === "superseded"
      ? { supersededOn: "2025-07-01", supersededBy: "fixture-company-rate-v2" }
      : {}),
    version: "fixture-v1",
    sourceReferences: [],
    reviewHistory: [],
  }]);
}

test("reconciles company income and credits using an explicit provisional simulation", () => {
  const result = calculateCorporateIncomeTax(input());

  assert.equal(result.calculationStatus, "provisional");
  assert.equal(result.filingReady, false);
  assert.equal(result.adjustedProfitBeforeLosses, 100_000_000);
  assert.equal(result.taxableIncome, 98_000_000);
  assert.equal(result.taxRate, 0.3);
  assert.equal(result.grossTaxLiability, 29_400_000);
  assert.equal(result.totalTaxCredits, 12_000_000);
  assert.equal(result.finalTaxPayable, 17_400_000);
  assert.deepEqual(result.ruleIdsUsed, ["ug-income-tax-company-resident-fy2026-27"]);
  assert.deepEqual(result.ruleVersionsUsed, ["legacy-UG-FY2026-27-v1"]);
  assert.equal(result.taxRuleSet.approvedForFiling, false);
  assert.equal(
    result.provisionalNotice,
    "PROVISIONAL COMPUTATION — LEGAL REVIEW REQUIRED — NOT APPROVED FOR FILING.",
  );
  assert.equal(result.provisionalNotice, PROVISIONAL_NOTICE);
  assert.ok(result.assumptions.length > 0);
  assert.ok(result.missingInformation.length > 0);
});

test("blocks filing mode when the period only has an unverified legacy rule", () => {
  const result = calculateCorporateIncomeTax(input({ calculationMode: "filing" }));

  assert.equal(result.calculationStatus, "blocked");
  assert.equal(result.filingReady, false);
  assert.equal(result.taxRate, null);
  assert.equal(result.grossTaxLiability, null);
  assert.equal(result.finalTaxPayable, null);
  assert.deepEqual(result.ruleIdsUsed, []);
  assert.deepEqual(result.candidateRuleIds, ["ug-income-tax-company-resident-fy2026-27"]);
});

test("development mode reconciles taxable income without applying a pending rate", () => {
  const result = calculateCorporateIncomeTax(input({ calculationMode: "development" }));

  assert.equal(result.calculationStatus, "development-only");
  assert.equal(result.taxableIncome, 98_000_000);
  assert.equal(result.taxRate, null);
  assert.equal(result.grossTaxLiability, null);
  assert.deepEqual(result.ruleIdsUsed, []);
});

test("uses a verified rule only when it covers the complete filing period", () => {
  const result = calculateCorporateIncomeTax(
    input({
      calculationMode: "filing",
      periodStart: "2024-07-01",
      periodEnd: "2025-06-30",
      reviewer: "Independent tax reviewer",
      reviewDate: "2025-07-10",
    }),
    verifiedCompanyRegistry(),
    taxCalculator,
  );

  assert.equal(result.calculationStatus, "filing-ready");
  assert.equal(result.filingReady, true);
  assert.equal(result.taxRate, 0.25);
  assert.equal(result.grossTaxLiability, 24_500_000);
  assert.deepEqual(result.ruleIdsUsed, ["fixture-company-rate-v1"]);
  assert.deepEqual(result.ruleVersionsUsed, ["fixture-v1"]);
});

test("uses a verified superseded rule for its covered historical filing period", () => {
  const result = calculateCorporateIncomeTax(
    input({
      calculationMode: "filing",
      periodStart: "2024-07-01",
      periodEnd: "2025-06-30",
      reviewer: "Independent tax reviewer",
      reviewDate: "2025-07-10",
    }),
    verifiedCompanyRegistry({ status: "superseded" }),
    taxCalculator,
  );

  assert.equal(result.calculationStatus, "filing-ready");
  assert.equal(result.filingReady, true);
  assert.equal(result.taxRate, 0.25);
  assert.equal(result.taxRuleSet.status, "superseded");
  assert.equal(result.taxRuleSet.approvedForFiling, true);
});

test("blocks filing-ready status when verified tax rules lack computation review", () => {
  const result = calculateCorporateIncomeTax(
    input({
      calculationMode: "filing",
      periodStart: "2024-07-01",
      periodEnd: "2025-06-30",
    }),
    verifiedCompanyRegistry(),
    taxCalculator,
  );

  assert.equal(result.calculationStatus, "blocked");
  assert.equal(result.grossTaxLiability, null);
  assert.equal(result.taxRuleSet.approvedForFiling, false);
  assert.ok(result.missingInformation.some((item) => item.includes("Independent computation reviewer")));
});

test("blocks filing liability when tax rules change during the period", () => {
  const registry = verifiedCompanyRegistry({
    effectiveFrom: "2024-07-01",
    effectiveTo: "2024-12-31",
  });
  const secondRule = {
    ...registry.records[0],
    ruleId: "fixture-company-rate-v2",
    effectiveFrom: "2025-01-01",
    effectiveTo: "2025-06-30",
    version: "fixture-v2",
    reviewHistory: [],
  };
  const periodRegistry = taxRules.createTaxRulesRegistry([
    registry.records[0],
    secondRule,
  ]);
  const result = calculateCorporateIncomeTax(
    input({
      calculationMode: "filing",
      periodStart: "2024-12-01",
      periodEnd: "2025-02-01",
    }),
    periodRegistry,
    taxCalculator,
  );

  assert.equal(result.calculationStatus, "blocked");
  assert.equal(result.taxLiability, undefined);
  assert.equal(result.finalTaxPayable, null);
  assert.ok(result.missingInformation.some((item) => item.includes("multiple tax-rule versions")));
  assert.deepEqual(result.candidateRuleIds, [
    "fixture-company-rate-v1",
    "fixture-company-rate-v2",
  ]);
});

test("supports loss, zero-credit and refundable-credit boundaries", () => {
  const loss = calculateCorporateIncomeTax(input({
    accountingProfit: 0,
    addBacks: [],
    exemptIncome: [],
    allowableDeductions: [],
    capitalAllowances: [],
    carriedForwardLosses: 0,
    provisionalTaxPaid: 0,
    withholdingTaxCredits: 0,
  }));
  const refund = calculateCorporateIncomeTax(input({
    accountingProfit: 10_000_000,
    addBacks: [],
    exemptIncome: [],
    allowableDeductions: [],
    capitalAllowances: [],
    carriedForwardLosses: 0,
    provisionalTaxPaid: 5_000_000,
    withholdingTaxCredits: 0,
  }));

  assert.equal(loss.taxableIncome, 0);
  assert.equal(loss.grossTaxLiability, 0);
  assert.equal(loss.finalTaxPayable, 0);
  assert.equal(refund.grossTaxLiability, 3_000_000);
  assert.equal(refund.finalTaxPayable, -2_000_000);
  assert.equal(refund.refundableCredit, 2_000_000);
});

test("rejects missing dates, invalid adjustments and excess losses", () => {
  assert.throws(() => calculateCorporateIncomeTax(input({ periodStart: "" })), RangeError);
  assert.throws(() => calculateCorporateIncomeTax(input({ addBacks: [{ description: "", amount: 1 }] })), RangeError);
  assert.throws(() => calculateCorporateIncomeTax(input({ allowableDeductions: [{ description: "Bad", amount: -1 }] })), RangeError);
  assert.throws(() => calculateCorporateIncomeTax(input({ carriedForwardLosses: 500_000_000 })), RangeError);
});