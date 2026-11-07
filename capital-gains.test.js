const assert = require("node:assert/strict");
const test = require("node:test");
const taxRules = require("./tax-rules.js");
const { calculateCapitalGains, PROVISIONAL_NOTICE } = require("./capital-gains.js");

function input(overrides = {}) {
  return {
    calculationMode: "simulation",
    taxpayerType: "company",
    assetDescription: "Example asset",
    assetCategory: "business-asset",
    acquisitionDate: "2026-08-01",
    disposalDate: "2027-03-01",
    periodStart: "2026-07-01",
    periodEnd: "2027-06-30",
    acquisitionCost: 10_000_000,
    acquisitionIncidentalCosts: 500_000,
    improvementExpenditure: 2_000_000,
    disposalProceeds: 30_000_000,
    disposalIncidentalCosts: 1_000_000,
    exemptions: [{ description: "User-entered exemption", amount: 1_000_000 }],
    reliefs: [{ description: "User-entered relief", amount: 2_000_000 }],
    withholdingCredits: 200_000,
    simulationRatePercent: 10,
    classificationConfirmed: true,
    ...overrides,
  };
}

function verifiedCapitalGainsRegistry({ rate = 0.1, status = "verified" } = {}) {
  return taxRules.createTaxRulesRegistry([{
    ruleId: "fixture-capital-gains-company-v1",
    ruleFamilyId: "fixture-capital-gains-company",
    taxHead: "income-tax",
    category: "capital-gains",
    taxpayerType: "company",
    jurisdiction: "UG",
    legislation: "Mock legislation for tests only",
    provision: "Mock provision for tests only",
    officialSourceType: "uganda-legislation",
    officialSourceUrl: "https://example.invalid/mock-capital-gains",
    effectiveFrom: "2024-07-01",
    effectiveTo: "2025-06-30",
    effectiveDatesVerified: true,
    value: { rate },
    calculationMethodology: "Test fixture only; not a Uganda tax rule.",
    status,
    reviewer: "Test reviewer",
    reviewDate: "2024-06-01",
    verifiedOn: "2024-06-01",
    ...(status === "superseded"
      ? { supersededOn: "2025-07-01", supersededBy: "fixture-capital-gains-company-v2" }
      : {}),
    version: "fixture-v1",
    sourceReferences: [],
    reviewHistory: [],
  }]);
}

test("reconciles asset cost base, net proceeds, reliefs, tax, and credits in simulation", () => {
  const result = calculateCapitalGains(input());

  assert.equal(result.calculationStatus, "provisional");
  assert.equal(result.filingReady, false);
  assert.equal(result.adjustedCostBase, 12_500_000);
  assert.equal(result.netDisposalProceeds, 29_000_000);
  assert.equal(result.gainOrLoss, 16_500_000);
  assert.equal(result.chargeableGain, 13_500_000);
  assert.equal(result.ratePercent, 10);
  assert.equal(result.taxLiability, 1_350_000);
  assert.equal(result.finalTaxPayable, 1_150_000);
  assert.deepEqual(result.ruleIdsUsed, ["ug-capital-gains-company-fy2026-27"]);
  assert.equal(result.provisionalNotice, PROVISIONAL_NOTICE);
  assert.equal(result.legislation, null);
  assert.equal(result.provision, null);
});

test("blocks filing mode for pending rules and does not apply the simulation rate", () => {
  const result = calculateCapitalGains(input({ calculationMode: "filing" }));

  assert.equal(result.calculationStatus, "blocked");
  assert.equal(result.taxLiability, null);
  assert.equal(result.finalTaxPayable, null);
  assert.equal(result.ratePercent, null);
  assert.deepEqual(result.ruleIdsUsed, []);
  assert.equal(result.provisionalNotice, PROVISIONAL_NOTICE);
});

test("supports verified taxpayer-specific historical rules", () => {
  const result = calculateCapitalGains(
    input({
      calculationMode: "filing",
      simulationRatePercent: undefined,
      periodStart: "2024-07-01",
      periodEnd: "2025-06-30",
      acquisitionDate: "2024-08-01",
      disposalDate: "2025-03-01",
      reviewer: "Independent tax reviewer",
      reviewDate: "2025-07-10",
    }),
    verifiedCapitalGainsRegistry(),
  );

  assert.equal(result.calculationStatus, "filing-ready");
  assert.equal(result.ratePercent, 10);
  assert.equal(result.taxLiability, 1_350_000);
  assert.deepEqual(result.ruleVersionsUsed, ["fixture-v1"]);
});

test("verified capital-gains rules still require independent computation review", () => {
  const result = calculateCapitalGains(
    input({
      calculationMode: "filing",
      periodStart: "2024-07-01",
      periodEnd: "2025-06-30",
      acquisitionDate: "2024-08-01",
      disposalDate: "2025-03-01",
      simulationRatePercent: undefined,
    }),
    verifiedCapitalGainsRegistry(),
  );

  assert.equal(result.calculationStatus, "blocked");
  assert.equal(result.taxLiability, null);
  assert.ok(result.missingInformation.some((item) => item.includes("Independent computation reviewer")));
});

test("reports losses without applying a tax rate and distinguishes asset categories", () => {
  const result = calculateCapitalGains(input({
    assetCategory: "immovable-property",
    acquisitionCost: 20_000_000,
    acquisitionIncidentalCosts: 0,
    improvementExpenditure: 0,
    disposalProceeds: 10_000_000,
    disposalIncidentalCosts: 0,
    exemptions: [],
    reliefs: [],
    simulationRatePercent: undefined,
  }));

  assert.equal(result.assetCategory, "immovable-property");
  assert.equal(result.gainOrLoss, -10_000_000);
  assert.equal(result.grossGain, 0);
  assert.equal(result.chargeableGain, 0);
  assert.equal(result.taxLiability, null);
});

test("blocks a calculation when classification is unconfirmed or disposal is outside the period", () => {
  const unclassified = calculateCapitalGains(input({ classificationConfirmed: false }));
  const outsidePeriod = calculateCapitalGains(input({
    periodStart: "2025-07-01",
    periodEnd: "2026-06-30",
  }));

  assert.equal(unclassified.calculationStatus, "blocked");
  assert.equal(unclassified.taxLiability, null);
  assert.equal(outsidePeriod.calculationStatus, "blocked");
  assert.equal(outsidePeriod.taxLiability, null);
});

test("validates dates, cost inputs, rate bounds, and reliefs above the gain", () => {
  assert.throws(() => calculateCapitalGains(input({ acquisitionDate: "2027-04-01" })), RangeError);
  assert.throws(() => calculateCapitalGains(input({ acquisitionCost: -1 })), RangeError);
  assert.throws(() => calculateCapitalGains(input({ simulationRatePercent: 101 })), RangeError);
  assert.throws(() => calculateCapitalGains(input({ reliefs: [{ description: "Too large", amount: 20_000_000 }] })), RangeError);
});