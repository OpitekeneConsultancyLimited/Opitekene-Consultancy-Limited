const assert = require("node:assert/strict");
const test = require("node:test");
const {
  calculateCurrencyConversion,
  calculateForeignTaxCreditScenario,
  calculateImportedServicesVat,
  calculateProfitAttributionScenario,
  calculateTransferPricingComparison,
  calculateWithholdingComparison,
  calculateWorkdayAllocation,
} = require("./international-tax.js");

test("compares domestic and treaty withholding using user-verified rates", () => {
  const estimate = calculateWithholdingComparison({
    grossPayment: 10_000_000,
    domesticRatePercent: 15,
    treatyRatePercent: 10,
  });

  assert.equal(estimate.domesticWithholding, 1_500_000);
  assert.equal(estimate.treatyWithholding, 1_000_000);
  assert.equal(estimate.scenarioDifference, 500_000);
  assert.equal(calculateWithholdingComparison({
    grossPayment: 10_000_000,
    domesticRatePercent: 15,
  }).treatyWithholding, null);
});

test("caps the foreign-tax-credit scenario at the user-entered ceiling", () => {
  assert.deepEqual(calculateForeignTaxCreditScenario({
    foreignTaxPaidUGX: 1_500_000,
    ugandaTaxCapUGX: 1_000_000,
  }), {
    indicativeCreditUGX: 1_000_000,
    uncreditedForeignTaxUGX: 500_000,
  });
});

test("converts foreign currency using the entered exchange rate", () => {
  assert.equal(calculateCurrencyConversion({
    foreignAmount: 100,
    ugxPerForeignUnit: 3_800,
  }).ugxEquivalent, 380_000);
});

test("compares a related-party price with a user-entered reference", () => {
  assert.deepEqual(calculateTransferPricingComparison({
    transactionPrice: 1_100,
    referencePrice: 1_000,
  }), {
    priceDifference: 100,
    variancePercent: 10,
  });
});

test("allocates income arithmetically by entered workday ratio", () => {
  const estimate = calculateWorkdayAllocation({
    incomeForAllocationUGX: 36_000_000,
    workdaysInUganda: 60,
    totalWorkdays: 180,
  });
  assert.ok(Math.abs(estimate.ugandaWorkdayShare - 100 / 3) < 1e-12);
  assert.equal(estimate.allocatedIncomeUGX, 12_000_000);
});

test("calculates imported-service VAT using user-entered treatment assumptions", () => {
  assert.deepEqual(calculateImportedServicesVat({
    serviceValueUGX: 10_000_000,
    vatRatePercent: 18,
    recoverableInputPercent: 50,
  }), {
    outputVatUGX: 1_800_000,
    recoverableInputVatUGX: 900_000,
    netVatUGX: 900_000,
  });
});

test("allocates profit using a user-entered share without determining permanent establishment", () => {
  assert.deepEqual(calculateProfitAttributionScenario({
    businessProfitUGX: 20_000_000,
    ugandaAttributionPercent: 25,
  }), {
    ugandaAttributedProfitUGX: 5_000_000,
    remainingProfitUGX: 15_000_000,
  });
});

test("rejects invalid amounts, rates and cross-border workday ratios", () => {
  assert.throws(() => calculateWithholdingComparison({
    grossPayment: -1,
    domesticRatePercent: 15,
  }), RangeError);
  assert.throws(() => calculateWithholdingComparison({
    grossPayment: 100,
    domesticRatePercent: 101,
  }), RangeError);
  assert.throws(() => calculateCurrencyConversion({
    foreignAmount: 100,
    ugxPerForeignUnit: 0,
  }), RangeError);
  assert.throws(() => calculateWorkdayAllocation({
    incomeForAllocationUGX: 100,
    workdaysInUganda: 3,
    totalWorkdays: 2,
  }), RangeError);
  assert.throws(() => calculateImportedServicesVat({
    serviceValueUGX: 100,
    vatRatePercent: 18,
    recoverableInputPercent: 101,
  }), RangeError);
});
