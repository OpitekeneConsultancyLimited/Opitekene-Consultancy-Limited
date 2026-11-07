const assert = require("node:assert/strict");
const test = require("node:test");
const taxRules = require("./tax-rules.js");

function verifiedFixture(overrides = {}) {
  return {
    ruleId: "fixture-income-tax-company",
    ruleFamilyId: "fixture-income-tax-company",
    taxHead: "income-tax",
    category: "company",
    taxpayerType: "company",
    jurisdiction: "UG",
    legislation: "Mock legislation for tests only",
    provision: "Mock provision for tests only",
    officialSourceType: "uganda-legislation",
    officialSourceUrl: "https://example.invalid/mock-legislation",
    effectiveFrom: "2024-07-01",
    effectiveTo: "2025-06-30",
    effectiveDatesVerified: true,
    value: { rate: 0.2 },
    calculationMethodology: "Test fixture arithmetic only; not a tax method.",
    status: "verified",
    reviewer: "Test reviewer",
    reviewDate: "2024-06-01",
    verifiedOn: "2024-06-01",
    version: "test-v1",
    sourceReferences: [],
    reviewHistory: [],
    ...overrides,
  };
}

test("provides an explicitly versioned FY 2026/27 ruleset", () => {
  const rules = taxRules.getRulesForFinancialYear("2026/27");

  assert.equal(taxRules.currentFinancialYear, "2026/27");
  assert.equal(rules.id, "UG-FY2026-27-v1");
  assert.equal(rules.effectiveFrom, "2026-07-01");
  assert.equal(rules.effectiveTo, "2027-06-30");
  assert.equal(rules.currency, "UGX");
  assert.equal(rules.approvedForFiling, false);
  assert.equal(rules.approvalStatus, "pending-primary-source-verification");
});

test("contains the existing individual, company and wear-and-tear schedules", () => {
  const rules = taxRules.getRulesForFinancialYear("2026/27");

  assert.deepEqual(
    rules.individualIncomeTax.residentBands.map(({ upper, rate }) => [upper, rate]),
    [
      [4_020_000, 0],
      [4_920_000, 0.2],
      [5_820_000, 0.25],
      [120_000_000, 0.3],
      [Infinity, 0.4],
    ],
  );
  assert.equal(rules.individualIncomeTax.nonResidentBands[0].rate, 0.1);
  assert.equal(rules.companyIncomeTax.standardResidentRate, 0.3);
  assert.deepEqual(
    rules.capitalAllowances.wearAndTearClasses.map(({ id, rate }) => [id, rate]),
    [["class-1", 0.4], ["class-2", 0.3], ["class-3", 0.2]],
  );
});

test("keeps migrated records pending and declares the required source priority", () => {
  assert.equal(taxRules.registryRecords.length, 43);
  assert.ok(taxRules.registryRecords.every((rule) => rule.status === "pending-review"));
  assert.ok(taxRules.registryRecords.some((rule) => (
    rule.category === "industrial-building-deduction" && rule.value === null
  )));
  assert.ok(taxRules.registryRecords.some((rule) => (
    rule.category === "capital-gains" && rule.value === null
  )));
  assert.deepEqual(
    taxRules.sourceHierarchy.map(({ type }) => type),
    [
      "uganda-legislation",
      "uganda-gazette",
      "ura-publication",
      "official-judicial-decision",
    ],
  );
});

test("does not allow mutation of active rules or their nested schedules", () => {
  const rules = taxRules.getRulesForFinancialYear("2026/27");

  assert.equal(Object.isFrozen(rules), true);
  assert.equal(Object.isFrozen(rules.individualIncomeTax.residentBands), true);
  assert.equal(Object.isFrozen(rules.individualIncomeTax.residentBands[0]), true);
});

test("fails explicitly for an unconfigured financial year", () => {
  assert.throws(
    () => taxRules.getRulesForFinancialYear("2027/28"),
    { name: "RangeError", message: "No configured Uganda tax rules for FY 2027/28." },
  );
  assert.throws(() => taxRules.getRulesForFinancialYear("__proto__"), RangeError);
});

test("selects historical versions by effective date without reusing them for later periods", () => {
  const oldRule = verifiedFixture({
    status: "superseded",
    effectiveFrom: "2023-07-01",
    effectiveTo: "2024-06-30",
    verifiedOn: "2023-06-01",
    supersededOn: "2024-07-01",
    supersededBy: "fixture-income-tax-company-v2",
  });
  const currentRule = verifiedFixture({
    ruleId: "fixture-income-tax-company-v2",
    effectiveFrom: "2024-07-01",
    effectiveTo: "2025-06-30",
    value: { rate: 0.25 },
  });
  const registry = taxRules.createTaxRulesRegistry([oldRule, currentRule]);

  const historical = registry.resolveRuleForDate({
    taxHead: "income-tax",
    category: "company",
    taxpayerType: "company",
    date: "2024-03-31",
  });
  const later = registry.resolveRuleForDate({
    taxHead: "income-tax",
    category: "company",
    taxpayerType: "company",
    date: "2024-09-30",
  });

  assert.equal(historical.status, "superseded");
  assert.equal(historical.historical, true);
  assert.equal(historical.rule.ruleId, oldRule.ruleId);
  assert.equal(later.status, "verified");
  assert.equal(later.rule.ruleId, currentRule.ruleId);
});

test("resolves a verified rule only when it covers the complete tax period", () => {
  const rule = verifiedFixture();
  const registry = taxRules.createTaxRulesRegistry([rule]);
  const result = registry.resolveRulesForPeriod({
    taxHead: "income-tax",
    category: "company",
    taxpayerType: "company",
    periodStart: "2024-07-01",
    periodEnd: "2025-06-30",
  });

  assert.equal(result.status, "verified");
  assert.equal(result.rule.ruleId, rule.ruleId);
  assert.deepEqual(result.rules.map((item) => item.version), ["test-v1"]);
});

test("blocks periods with missing dates, overlaps, and mid-period rule changes", () => {
  const first = verifiedFixture({ effectiveTo: "2024-12-31" });
  const second = verifiedFixture({
    ruleId: "fixture-income-tax-company-v2",
    effectiveFrom: "2025-01-01",
    effectiveTo: "2025-06-30",
  });
  const changedRegistry = taxRules.createTaxRulesRegistry([first, second]);
  const periodCriteria = {
    taxHead: "income-tax",
    category: "company",
    taxpayerType: "company",
    periodStart: "2024-12-01",
    periodEnd: "2025-02-01",
  };

  assert.equal(changedRegistry.resolveRulesForPeriod(periodCriteria).status, "rule-change-in-period");

  const gapRegistry = taxRules.createTaxRulesRegistry([
    verifiedFixture({ effectiveTo: "2024-12-30" }),
    verifiedFixture({
      ruleId: "fixture-income-tax-company-after-gap",
      effectiveFrom: "2025-01-02",
      effectiveTo: "2025-06-30",
    }),
  ]);
  assert.equal(gapRegistry.resolveRulesForPeriod(periodCriteria).status, "missing");

  const overlapRegistry = taxRules.createTaxRulesRegistry([
    verifiedFixture(),
    verifiedFixture({
      ruleId: "fixture-income-tax-company-overlap-period",
      effectiveFrom: "2025-01-01",
      effectiveTo: "2025-06-30",
    }),
  ]);
  assert.equal(overlapRegistry.resolveRulesForPeriod(periodCriteria).status, "overlap");
});

test("does not return pending rules as applicable to a tax period", () => {
  const pending = taxRules.registryRecords.find(
    (rule) => rule.category === "company-resident-standard",
  );
  const registry = taxRules.createTaxRulesRegistry([pending]);
  const result = registry.resolveRulesForPeriod({
    taxHead: "income-tax",
    category: "company-resident-standard",
    taxpayerType: "company",
    periodStart: "2026-07-01",
    periodEnd: "2027-06-30",
  });

  assert.equal(result.status, "pending-review");
  assert.equal(result.rule, null);
  assert.equal(result.candidate.ruleId, pending.ruleId);
});

test("reports overlapping effective periods instead of selecting an arbitrary rule", () => {
  const first = verifiedFixture();
  const second = verifiedFixture({
    ruleId: "fixture-income-tax-company-overlap",
    effectiveFrom: "2025-01-01",
  });
  const registry = taxRules.createTaxRulesRegistry([first, second]);

  const result = registry.resolveRuleForDate({
    taxHead: "income-tax",
    category: "company",
    taxpayerType: "company",
    date: "2025-02-01",
  });

  assert.equal(result.status, "overlap");
  assert.equal(result.rule, null);
  assert.equal(result.candidates.length, 2);
});

test("returns explicit missing and pending-review outcomes without activating unverified data", () => {
  const pending = taxRules.registryRecords[0];
  const registry = taxRules.createTaxRulesRegistry([pending]);
  const criteria = {
    taxHead: pending.taxHead,
    category: pending.category,
    taxpayerType: pending.taxpayerType,
    date: "2026-08-01",
  };

  assert.equal(registry.resolveRuleForDate(criteria).status, "pending-review");
  assert.equal(registry.resolveRuleForDate(criteria).rule, null);
  assert.equal(registry.getApplicableRule(criteria).rule, null);
  assert.equal(registry.resolveRuleForDate({ ...criteria, category: "missing" }).status, "missing");
});

test("keeps superseded rules available only as historical evidence, not active rules", () => {
  const superseded = verifiedFixture({
    status: "superseded",
    supersededOn: "2025-07-01",
    supersededBy: "fixture-income-tax-company-v2",
  });
  const registry = taxRules.createTaxRulesRegistry([superseded]);
  const criteria = {
    taxHead: "income-tax",
    category: "company",
    taxpayerType: "company",
    date: "2025-02-01",
  };

  assert.equal(registry.resolveRuleForDate(criteria).status, "superseded");
  assert.equal(registry.resolveRuleForDate(criteria).rule.ruleId, superseded.ruleId);
  assert.equal(registry.getApplicableRule(criteria).rule, null);
});

test("approval requires a complete legal source, effective dates, method and review record", () => {
  const pending = taxRules.registryRecords[0];

  assert.throws(
    () => taxRules.transitionRuleStatus(pending, {
      status: "verified",
      reviewer: "Test reviewer",
      reviewDate: "2026-11-03",
    }),
    /cannot be verified; missing legislation/,
  );

  const approved = taxRules.transitionRuleStatus(pending, {
    status: "verified",
    legislation: "Mock legislation for tests only",
    provision: "Mock provision for tests only",
    officialSourceType: "uganda-legislation",
    officialSourceUrl: "https://example.invalid/mock-legislation",
    effectiveDatesVerified: true,
    calculationMethodology: "Test fixture arithmetic only; not a tax method.",
    reviewer: "Test reviewer",
    reviewDate: "2026-11-03",
  });

  assert.equal(approved.status, "verified");
  assert.equal(approved.verifiedOn, "2026-11-03");
  assert.equal(approved.reviewHistory.length, 1);
  assert.equal(pending.status, "pending-review");

  const withdrawn = taxRules.transitionRuleStatus(pending, {
    status: "withdrawn",
    reviewer: "Test reviewer",
    reviewDate: "2026-11-03",
    withdrawnReason: "Test fixture withdrawal only.",
  });
  const withdrawnRegistry = taxRules.createTaxRulesRegistry([withdrawn]);
  const withdrawnResult = withdrawnRegistry.resolveRuleForDate({
    taxHead: pending.taxHead,
    category: pending.category,
    taxpayerType: pending.taxpayerType,
    date: "2026-08-01",
  });

  assert.equal(withdrawn.status, "withdrawn");
  assert.equal(withdrawnResult.status, "withdrawn");
  assert.equal(withdrawnResult.rule, null);
});
