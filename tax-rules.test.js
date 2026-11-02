const assert = require("node:assert/strict");
const test = require("node:test");
const taxRules = require("./tax-rules.js");

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
