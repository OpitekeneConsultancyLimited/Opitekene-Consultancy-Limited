const assert = require("node:assert/strict");
const test = require("node:test");
const taxRules = require("./tax-rules.js");
const { calculateIndustrialBuildingDeduction, PROVISIONAL_NOTICE } = require("./industrial-building.js");

function input(overrides = {}) {
  return {
    calculationMode: "simulation",
    taxpayerType: "company",
    periodStart: "2026-07-01",
    periodEnd: "2027-06-30",
    buildingDescription: "Example production building",
    owner: "Example taxpayer",
    constructionExpenditure: 100_000_000,
    qualifyingConstructionCosts: 80_000_000,
    constructionStarted: "2024-01-01",
    constructionCompleted: "2025-01-01",
    firstUsed: "2025-02-01",
    buildingUse: "Manufacturing use entered by user",
    previousDeductions: 5_000_000,
    qualificationConfirmed: true,
    simulationRatePercent: 5,
    simulationMethod: "straight-line",
    periodUsePercent: 100,
    ...overrides,
  };
}

function verifiedIndustrialRuleRegistry(overrides = {}) {
  return taxRules.createTaxRulesRegistry([{
    ruleId: "fixture-industrial-building-v1",
    ruleFamilyId: "fixture-industrial-building",
    taxHead: "income-tax",
    category: "industrial-building-deduction",
    taxpayerType: "company",
    jurisdiction: "UG",
    legislation: "Mock legislation for tests only",
    provision: "Mock provision for tests only",
    officialSourceType: "uganda-legislation",
    officialSourceUrl: "https://example.invalid/mock-industrial-building",
    effectiveFrom: "2024-07-01",
    effectiveTo: "2025-06-30",
    effectiveDatesVerified: true,
    value: { rate: 0.05, method: "straight-line" },
    calculationMethodology: "Test fixture only; not a Uganda tax rule.",
    status: "verified",
    reviewer: "Test reviewer",
    reviewDate: "2024-06-01",
    verifiedOn: "2024-06-01",
    version: "fixture-v1",
    sourceReferences: [],
    reviewHistory: [],
    ...overrides,
  }]);
}

test("runs an explicitly parameterized provisional scenario without claiming qualification", () => {
  const result = calculateIndustrialBuildingDeduction(input());

  assert.equal(result.calculationStatus, "provisional");
  assert.equal(result.filingReady, false);
  assert.equal(result.qualificationStatus, "user-confirmed-for-review-only");
  assert.equal(result.remainingQualifyingCosts, 75_000_000);
  assert.equal(result.estimatedDeduction, 3_750_000);
  assert.equal(result.ruleStatus, "pending-review");
  assert.deepEqual(result.ruleIdsUsed, ["ug-industrial-building-deduction-company-fy2026-27"]);
  assert.equal(result.legislation, null);
  assert.equal(result.provision, null);
  assert.equal(result.provisionalNotice, PROVISIONAL_NOTICE);
});

test("does not calculate an unsupported filing liability or infer qualification", () => {
  const filing = calculateIndustrialBuildingDeduction(input({
    calculationMode: "filing",
    qualificationConfirmed: true,
  }));
  const unconfirmed = calculateIndustrialBuildingDeduction(input({
    qualificationConfirmed: false,
  }));

  assert.equal(filing.calculationStatus, "blocked");
  assert.equal(filing.estimatedDeduction, null);
  assert.equal(filing.provisionalNotice, PROVISIONAL_NOTICE);
  assert.equal(unconfirmed.calculationStatus, "blocked");
  assert.equal(unconfirmed.estimatedDeduction, null);
  assert.equal(unconfirmed.qualificationStatus, "not-established");
  assert.ok(unconfirmed.missingInformation.some((item) => item.includes("commercial use alone")));
});

test("uses a verified rule only when it covers the complete period and no event is unresolved", () => {
  const result = calculateIndustrialBuildingDeduction(
    input({
      calculationMode: "filing",
      periodStart: "2024-07-01",
      periodEnd: "2025-06-30",
      reviewer: "Independent tax reviewer",
      reviewDate: "2025-07-10",
      simulationRatePercent: undefined,
      simulationMethod: undefined,
      periodUsePercent: 100,
    }),
    verifiedIndustrialRuleRegistry(),
  );

  assert.equal(result.calculationStatus, "filing-ready");
  assert.equal(result.filingReady, true);
  assert.equal(result.estimatedDeduction, 3_750_000);
  assert.deepEqual(result.ruleIdsUsed, ["fixture-industrial-building-v1"]);
  assert.deepEqual(result.ruleVersionsUsed, ["fixture-v1"]);
  assert.equal(result.provision, "Mock provision for tests only");
});

test("blocks filing-ready status for disposal and change-of-use events", () => {
  const registry = verifiedIndustrialRuleRegistry();
  const disposal = calculateIndustrialBuildingDeduction(input({
    calculationMode: "filing",
    periodStart: "2024-07-01",
    periodEnd: "2025-06-30",
    disposalDate: "2025-03-01",
  }), registry);
  const changeOfUse = calculateIndustrialBuildingDeduction(input({
    calculationMode: "filing",
    periodStart: "2024-07-01",
    periodEnd: "2025-06-30",
    changeOfUseDate: "2025-03-01",
    reviewer: "Independent tax reviewer",
    reviewDate: "2025-07-10",
  }), registry);

  assert.equal(disposal.calculationStatus, "blocked");
  assert.equal(disposal.estimatedDeduction, null);
  assert.equal(changeOfUse.calculationStatus, "blocked");
  assert.equal(changeOfUse.estimatedDeduction, null);
});

test("verified building rules still require independent case review before filing-ready status", () => {
  const result = calculateIndustrialBuildingDeduction(input({
    calculationMode: "filing",
    periodStart: "2024-07-01",
    periodEnd: "2025-06-30",
  }), verifiedIndustrialRuleRegistry());

  assert.equal(result.calculationStatus, "blocked");
  assert.equal(result.estimatedDeduction, null);
  assert.ok(result.missingInformation.some((item) => item.includes("Independent computation reviewer")));
});

test("supports zero amounts and rejects missing dates or inconsistent costs", () => {
  const zero = calculateIndustrialBuildingDeduction(input({
    constructionExpenditure: 0,
    qualifyingConstructionCosts: 0,
    previousDeductions: 0,
    simulationRatePercent: 0,
  }));
  assert.equal(zero.estimatedDeduction, 0);
  assert.ok(zero.missingInformation.some((item) => item.includes("No qualifying")));
  assert.throws(() => calculateIndustrialBuildingDeduction(input({ constructionStarted: "" })), RangeError);
  assert.throws(() => calculateIndustrialBuildingDeduction(input({ qualifyingConstructionCosts: 100_000_001 })), RangeError);
  assert.throws(() => calculateIndustrialBuildingDeduction(input({ previousDeductions: 80_000_001 })), RangeError);
  assert.throws(() => calculateIndustrialBuildingDeduction(input({ simulationRatePercent: 101 })), RangeError);
});