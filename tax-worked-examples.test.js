const assert = require("node:assert/strict");
const test = require("node:test");
const {
  calculateBurugoWithholding,
  calculateCsiBank,
  data,
} = require("./tax-worked-examples.js");

test("recomputes CSI Bank provisions, allowances and tax reconciliation", () => {
  const result = calculateCsiBank();

  assert.equal(result.totalSpecificProvisions, 1_183_562_865);
  assert.equal(result.generalProvision, 3_232_886);
  assert.deepEqual(result.wearAndTear.map((item) => item.costBase), [
    336_970_936,
    180_093_093,
    714_663_908,
  ]);
  assert.equal(result.totalWearAndTear, 331_749_084);
  assert.equal(result.totalIndustrialBuildingAllowance, 192_578_926);
  assert.equal(result.totalAddBacks, 4_292_252_411);
  assert.equal(result.chargeableIncome, 5_472_543_563);
  assert.equal(result.taxBeforeCredits, 1_641_763_069);
  assert.equal(result.netTaxPayable, 1_617_441_069);
});

test("recomputes Burugo transaction withholding and total", () => {
  const result = calculateBurugoWithholding();

  assert.deepEqual(result.transactions.map((item) => item.calculatedWht), [
    2_840_000,
    2_620_000,
    48_000_000,
    56_000_000,
    34_510_000,
    0,
  ]);
  assert.equal(result.totalWht, 143_970_000);
});

test("labels the supplied example as historical rather than current-year tax data", () => {
  assert.equal(data.parameters.yearOfIncome, 2024);
  assert.equal(data.parameters.companyTaxRate, 0.3);
  assert.match(data.parameters.statute, /2023 Revision/);
});
