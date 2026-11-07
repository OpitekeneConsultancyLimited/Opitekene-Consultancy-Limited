const assert = require("node:assert/strict");
const test = require("node:test");
const taxRules = require("./tax-rules.js");
const taxCalculator = require("./tax-calculator.js");
const { calculateCapitalAllowanceSchedule } = require("./capital-allowances.js");

function asset(overrides = {}) {
  return {
    assetId: "FA-001",
    description: "Computer equipment",
    assetClass: "class-1",
    acquisitionDate: "2026-08-01",
    dateBroughtIntoUse: "2026-08-10",
    openingTaxWrittenDownValue: 0,
    qualifyingExpenditure: 1_000_000,
    accountingDepreciation: 200_000,
    disposalDate: null,
    disposalProceeds: 0,
    businessUsePercent: 80,
    classificationConfirmed: true,
    ...overrides,
  };
}

function input(overrides = {}) {
  return {
    calculationMode: "simulation",
    taxpayerType: "company",
    periodStart: "2026-07-01",
    periodEnd: "2027-06-30",
    assets: [asset()],
    ...overrides,
  };
}

function verifiedWearAndTearRegistry({ rate = 0.25, status = "verified" } = {}) {
  return taxRules.createTaxRulesRegistry([{
    ruleId: "fixture-wear-class-1-v1",
    ruleFamilyId: "fixture-wear-class-1",
    taxHead: "income-tax",
    category: "wear-and-tear-class-1",
    taxpayerType: "business-taxpayer",
    jurisdiction: "UG",
    legislation: "Mock legislation for tests only",
    provision: "Mock provision for tests only",
    officialSourceType: "uganda-legislation",
    officialSourceUrl: "https://example.invalid/mock-allowance",
    effectiveFrom: "2024-07-01",
    effectiveTo: "2025-06-30",
    effectiveDatesVerified: true,
    value: { id: "class-1", label: "Fixture class", rate },
    calculationMethodology: "Test fixture only; not a Uganda tax rule.",
    status,
    reviewer: "Test reviewer",
    reviewDate: "2024-06-01",
    verifiedOn: "2024-06-01",
    ...(status === "superseded"
      ? { supersededOn: "2025-07-01", supersededBy: "fixture-wear-class-1-v2" }
      : {}),
    version: "fixture-v1",
    sourceReferences: [],
    reviewHistory: [],
  }]);
}

test("groups fixed assets by class and keeps book depreciation outside the tax allowance", () => {
  const result = calculateCapitalAllowanceSchedule(input());

  assert.equal(result.calculationStatus, "provisional");
  assert.equal(result.filingReady, false);
  assert.equal(result.totalAccountingDepreciation, 200_000);
  assert.equal(result.classSchedules[0].qualifyingAdditions, 1_000_000);
  assert.equal(result.classSchedules[0].businessUseAdditions, 800_000);
  assert.equal(result.classSchedules[0].rate, 0.4);
  assert.equal(result.classSchedules[0].allowance, 320_000);
  assert.equal(result.totalAllowance, 320_000);
  assert.deepEqual(result.ruleIdsUsed, ["ug-capital-allowance-class-1-fy2026-27"]);
  assert.equal(
    result.provisionalNotice,
    "PROVISIONAL COMPUTATION — LEGAL REVIEW REQUIRED — NOT APPROVED FOR FILING.",
  );
});

test("uses opening written-down value and apportions disposals by asset business use", () => {
  const result = calculateCapitalAllowanceSchedule(input({
    assets: [asset({
      assetId: "FA-002",
      acquisitionDate: "2024-08-01",
      dateBroughtIntoUse: "2024-08-10",
      openingTaxWrittenDownValue: 2_000_000,
      qualifyingExpenditure: 0,
      accountingDepreciation: 100_000,
      disposalDate: "2027-02-01",
      disposalProceeds: 500_000,
      businessUsePercent: 50,
    })],
  }));

  assert.equal(result.classSchedules[0].openingTaxWrittenDownValue, 2_000_000);
  assert.equal(result.classSchedules[0].businessUseDisposalProceeds, 250_000);
  assert.equal(result.classSchedules[0].allowance, 700_000);
  assert.ok(result.missingInformation.some((item) => item.includes("balancing adjustment")));
});

test("blocks filing allowances when the only matching rates are pending review", () => {
  const result = calculateCapitalAllowanceSchedule(input({ calculationMode: "filing" }));

  assert.equal(result.calculationStatus, "blocked");
  assert.equal(result.filingReady, false);
  assert.equal(result.totalAllowance, null);
  assert.deepEqual(result.ruleIdsUsed, []);
  assert.equal(result.classSchedules[0].allowance, null);
});

test("development mode returns asset workings without applying a pending allowance rate", () => {
  const result = calculateCapitalAllowanceSchedule(input({ calculationMode: "development" }));

  assert.equal(result.calculationStatus, "development-only");
  assert.equal(result.totalAllowance, null);
  assert.deepEqual(result.ruleIdsUsed, []);
  assert.equal(result.classSchedules[0].rate, null);
});

test("uses a verified historical class rate only for its complete historical period", () => {
  const result = calculateCapitalAllowanceSchedule(
    input({
      calculationMode: "filing",
      periodStart: "2024-07-01",
      periodEnd: "2025-06-30",
      assets: [asset({
        acquisitionDate: "2024-08-01",
        dateBroughtIntoUse: "2024-08-10",
      })],
      reviewer: "Independent tax reviewer",
      reviewDate: "2025-07-10",
    }),
    verifiedWearAndTearRegistry(),
    taxCalculator,
  );

  assert.equal(result.calculationStatus, "filing-ready");
  assert.equal(result.classSchedules[0].rate, 0.25);
  assert.equal(result.totalAllowance, 200_000);
  assert.deepEqual(result.ruleVersionsUsed, ["fixture-v1"]);
});

test("uses a superseded verified rate only for its historical allowance period", () => {
  const result = calculateCapitalAllowanceSchedule(
    input({
      calculationMode: "filing",
      periodStart: "2024-07-01",
      periodEnd: "2025-06-30",
      assets: [asset({
        acquisitionDate: "2024-08-01",
        dateBroughtIntoUse: "2024-08-10",
      })],
      reviewer: "Independent tax reviewer",
      reviewDate: "2025-07-10",
    }),
    verifiedWearAndTearRegistry({ status: "superseded" }),
    taxCalculator,
  );

  assert.equal(result.calculationStatus, "filing-ready");
  assert.equal(result.totalAllowance, 200_000);
  assert.equal(result.classSchedules[0].historicalRule, true);
});

test("blocks filing-ready status for requested initial allowance or disposal balancing review", () => {
  const initialAllowance = calculateCapitalAllowanceSchedule(
    input({
      calculationMode: "filing",
      initialAllowanceRequested: true,
      reviewer: "Independent tax reviewer",
      reviewDate: "2025-07-10",
    }),
    verifiedWearAndTearRegistry(),
    taxCalculator,
  );
  const disposal = calculateCapitalAllowanceSchedule(
    input({
      calculationMode: "filing",
      assets: [asset({
        acquisitionDate: "2024-08-01",
        dateBroughtIntoUse: "2024-08-10",
        disposalDate: "2027-02-01",
        disposalProceeds: 100_000,
      })],
      reviewer: "Independent tax reviewer",
      reviewDate: "2025-07-10",
    }),
    verifiedWearAndTearRegistry(),
    taxCalculator,
  );

  assert.equal(initialAllowance.calculationStatus, "blocked");
  assert.equal(initialAllowance.totalAllowance, null);
  assert.ok(initialAllowance.provisionalNotice.includes("NOT APPROVED FOR FILING"));
  assert.equal(disposal.calculationStatus, "blocked");
  assert.equal(disposal.totalAllowance, null);
  assert.ok(disposal.provisionalNotice.includes("NOT APPROVED FOR FILING"));
});

test("verified allowance rules still require an independent computation review", () => {
  const result = calculateCapitalAllowanceSchedule(
    input({
      calculationMode: "filing",
      periodStart: "2024-07-01",
      periodEnd: "2025-06-30",
      assets: [asset({
        acquisitionDate: "2024-08-01",
        dateBroughtIntoUse: "2024-08-10",
      })],
    }),
    verifiedWearAndTearRegistry(),
    taxCalculator,
  );

  assert.equal(result.calculationStatus, "blocked");
  assert.equal(result.totalAllowance, null);
  assert.ok(result.missingInformation.some((item) => item.includes("Independent computation reviewer")));
});

test("reports unconfirmed classification and unsupported initial allowances", () => {
  const result = calculateCapitalAllowanceSchedule(input({
    initialAllowanceRequested: true,
    assets: [asset({ classificationConfirmed: false })],
  }));

  assert.equal(result.calculationStatus, "blocked");
  assert.equal(result.totalAllowance, null);
  assert.ok(result.missingInformation.some((item) => item.includes("classification")));
  assert.ok(result.missingInformation.some((item) => item.includes("Initial allowance")));
});

test("validates register IDs, asset dates, use, classification, and disposal inputs", () => {
  assert.throws(() => calculateCapitalAllowanceSchedule(input({ periodEnd: "2026-06-30" })), RangeError);
  assert.throws(() => calculateCapitalAllowanceSchedule(input({ assets: [asset(), asset()] })), RangeError);
  assert.throws(() => calculateCapitalAllowanceSchedule(input({ assets: [asset({ dateBroughtIntoUse: "2026-01-01" })] })), RangeError);
  assert.throws(() => calculateCapitalAllowanceSchedule(input({ assets: [asset({ businessUsePercent: 101 })] })), RangeError);
  assert.throws(() => calculateCapitalAllowanceSchedule(input({ assets: [asset({ disposalProceeds: 10 })] })), RangeError);
});