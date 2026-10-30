const assert = require("node:assert/strict");
const test = require("node:test");
const {
  calculateCompanyIncomeTax,
  calculateCapitalAllowance,
  calculateChargeableIncome,
  calculateCompanyTaxBase,
  calculateCustomsEstimate,
  calculateIndividualIncomeTax,
  calculatePaye,
  calculatePresumptiveTax,
  calculateRentalIncomeTax,
  calculateVat,
  calculateWithholdingTax,
} = require("./tax-calculator.js");

test("income at or below the tax-free threshold has no tax", () => {
  assert.equal(calculateIndividualIncomeTax(0).totalTax, 0);
  assert.equal(calculateIndividualIncomeTax(4_020_000).totalTax, 0);
});

test("calculates tax progressively across the lower bands", () => {
  assert.equal(calculateIndividualIncomeTax(4_470_000).totalTax, 90_000);
  assert.equal(calculateIndividualIncomeTax(5_370_000).totalTax, 292_500);
  assert.equal(calculateIndividualIncomeTax(5_820_000).totalTax, 405_000);
});

test("applies the 30% band and the additional 10% above UGX 120 million", () => {
  assert.equal(calculateIndividualIncomeTax(48_000_000).totalTax, 13_059_000);
  assert.equal(calculateIndividualIncomeTax(120_000_000).totalTax, 34_659_000);
  assert.equal(calculateIndividualIncomeTax(130_000_000).totalTax, 38_659_000);
});

test("returns band breakdown and effective and marginal rates", () => {
  const estimate = calculateIndividualIncomeTax(130_000_000);

  assert.equal(estimate.breakdown.length, 5);
  assert.equal(estimate.effectiveRate, 38_659_000 / 130_000_000);
  assert.equal(estimate.marginalRate, 0.4);
});

test("uses the non-resident individual income tax bands when selected", () => {
  const estimate = calculateIndividualIncomeTax(4_000_000, false);

  assert.equal(estimate.totalTax, 400_000);
  assert.equal(estimate.marginalRate, 0.1);
});

test("rejects negative and non-finite taxable income", () => {
  assert.throws(() => calculateIndividualIncomeTax(-1), RangeError);
  assert.throws(() => calculateIndividualIncomeTax(Number.NaN), RangeError);
  assert.throws(() => calculateIndividualIncomeTax(Number.POSITIVE_INFINITY), RangeError);
});

test("reconciles income, tax add-backs and allowable deductions to chargeable income", () => {
  const individual = calculateChargeableIncome(48_000_000, 0, 3_000_000);
  const company = calculateChargeableIncome(100_000_000, 5_000_000, 2_000_000);

  assert.equal(individual.chargeableIncome, 45_000_000);
  assert.equal(company.incomeAfterAdditions, 105_000_000);
  assert.equal(company.chargeableIncome, 103_000_000);
  assert.throws(() => calculateChargeableIncome(1_000_000, 0, 1_000_001), RangeError);
  assert.throws(() => calculateChargeableIncome(1_000_000, -1, 0), RangeError);
});

test("reconciles company adjustments and applies only confirmed loss relief", () => {
  const profit = calculateCompanyTaxBase(100_000_000, 5_000_000, 12_000_000, 10_000_000);
  const loss = calculateCompanyTaxBase(5_000_000, 1_000_000, 9_000_000);

  assert.equal(profit.incomeAfterAdditions, 105_000_000);
  assert.equal(profit.adjustedProfitBeforeLosses, 93_000_000);
  assert.equal(profit.carriedForwardLossesUsed, 10_000_000);
  assert.equal(profit.chargeableIncome, 83_000_000);
  assert.equal(loss.adjustedProfitBeforeLosses, -3_000_000);
  assert.equal(loss.currentYearLoss, 3_000_000);
  assert.equal(loss.chargeableIncome, 0);
  assert.throws(() => calculateCompanyTaxBase(1_000_000, 0, 0, 1_000_001), RangeError);
  assert.throws(() => calculateCompanyTaxBase(Number.NaN), RangeError);
});

test("annualizes monthly taxable pay for PAYE and returns a monthly breakdown", () => {
  const estimate = calculatePaye(4_000_000);

  assert.equal(estimate.monthlyTax, calculateIndividualIncomeTax(48_000_000).totalTax / 12);
  assert.equal(estimate.breakdown.length, 5);
  assert.equal(estimate.breakdown[3].tax, 12_654_000 / 12);
  assert.equal(estimate.monthlyEmployeeNssf, 200_000);
  assert.equal(estimate.monthlyEmployerNssf, 400_000);
  assert.equal(calculatePaye(335_000).monthlyTax, 0);
  assert.ok(calculatePaye(335_001).monthlyTax > 0);
  assert.equal(calculatePaye(4_000_000, true, 5_000_000).monthlyEmployeeNssf, 250_000);
});

test("calculates standard company income tax and balance after payments", () => {
  const estimate = calculateCompanyIncomeTax(100_000_000, 10_000_000);
  const withCredits = calculateCompanyIncomeTax(100_000_000, 10_000_000, 5_000_000);

  assert.equal(estimate.tax, 30_000_000);
  assert.equal(estimate.balance, 20_000_000);
  assert.equal(withCredits.totalCredits, 15_000_000);
  assert.equal(withCredits.balance, 15_000_000);
  assert.throws(() => calculateCompanyIncomeTax(1_000_000, 0, -1), RangeError);
});

test("calculates an illustrative capital allowance using a user-confirmed rate", () => {
  const estimate = calculateCapitalAllowance(10_000_000, 25);

  assert.equal(estimate.allowance, 2_500_000);
  assert.equal(estimate.closingTaxValue, 7_500_000);
  assert.equal(estimate.breakdown.length, 3);
  assert.throws(() => calculateCapitalAllowance(-1, 25), RangeError);
  assert.throws(() => calculateCapitalAllowance(1_000_000, 100.1), RangeError);
  assert.throws(() => calculateCapitalAllowance(1_000_000, Number.NaN), RangeError);
});

test("estimates import duty, excise, import VAT, withholding and landed cost", () => {
  const estimate = calculateCustomsEstimate({
    direction: "import",
    customsValue: 10_000_000,
    customsDutyRate: 10,
    importExciseDuty: 500_000,
    importWithholdingRate: 6,
    importOtherCharges: 100_000,
  });

  assert.equal(estimate.importVat, 2_070_000);
  assert.equal(estimate.totalCharges, 4_270_000);
  assert.equal(estimate.landedCost, 14_270_000);
  assert.equal(estimate.breakdown.length, 8);
});

test("estimates export VAT treatment, levies and net proceeds", () => {
  const estimate = calculateCustomsEstimate({
    direction: "export",
    customsValue: 10_000_000,
    exportVatTreatment: "zero-rated",
    exportLevyRate: 5,
    exportExciseDuty: 100_000,
    exportOtherCharges: 20_000,
  });

  assert.equal(estimate.exportVat, 0);
  assert.equal(estimate.totalCharges, 620_000);
  assert.equal(estimate.netProceeds, 9_380_000);
  const standardRated = calculateCustomsEstimate({
    direction: "export",
    customsValue: 1_000_000,
    exportVatTreatment: "standard",
    exportVatRate: 18,
  });
  assert.equal(standardRated.exportVat, 180_000);
  assert.throws(() => calculateCustomsEstimate({
    direction: "import",
    customsValue: 1_000,
    customsDutyRate: 100.1,
  }), RangeError);
  assert.throws(() => calculateCustomsEstimate({
    direction: "export",
    customsValue: 1_000,
    exportVatTreatment: "unknown",
  }), RangeError);
});

test("calculates VAT on exclusive and inclusive prices and accounts for input VAT", () => {
  const exclusive = calculateVat({
    standardRatedSales: 10_000_000,
    zeroRatedSales: 2_000_000,
    exemptSales: 1_000_000,
    claimableInputVat: 900_000,
  });
  const inclusive = calculateVat({
    standardRatedSales: 11_800_000,
    salesIncludeVat: true,
  });

  assert.equal(exclusive.outputVat, 1_800_000);
  assert.ok(Math.abs(exclusive.claimableInputVat - (900_000 * 12 / 13)) < 0.0001);
  assert.ok(Math.abs(exclusive.netVat - (1_800_000 - (900_000 * 12 / 13))) < 0.0001);
  assert.equal(exclusive.breakdown[2].amount, 1_000_000);
  assert.equal(inclusive.outputVat, 1_800_000);
});

test("restricts input VAT recovery by the share of exempt supplies", () => {
  const mostlyTaxable = calculateVat({
    standardRatedSales: 96,
    exemptSales: 4,
    claimableInputVat: 100,
  });
  const mixed = calculateVat({
    standardRatedSales: 80,
    exemptSales: 20,
    claimableInputVat: 100,
  });
  const mostlyExempt = calculateVat({
    standardRatedSales: 4,
    exemptSales: 96,
    claimableInputVat: 100,
  });

  assert.equal(mostlyTaxable.claimableInputVat, 100);
  assert.equal(mixed.claimableInputVat, 80);
  assert.equal(mostlyExempt.claimableInputVat, 0);
});

test("checks updated FY 2026/27 VAT registration thresholds", () => {
  const annualThreshold = calculateVat({
    standardRatedSales: 0,
    annualTaxableTurnover: 300_000_001,
  });
  const quarterlyThreshold = calculateVat({
    standardRatedSales: 0,
    threeMonthTaxableTurnover: 75_000_001,
  });
  const belowThreshold = calculateVat({
    standardRatedSales: 0,
    annualTaxableTurnover: 300_000_000,
    threeMonthTaxableTurnover: 75_000_000,
  });

  assert.equal(annualThreshold.registrationRequired, true);
  assert.equal(quarterlyThreshold.registrationRequired, true);
  assert.equal(belowThreshold.registrationRequired, false);
  assert.equal(belowThreshold.registrationAssessed, true);
});

test("calculates individual rental tax after the annual threshold", () => {
  const estimate = calculateRentalIncomeTax(12_820_000, 500_000);

  assert.equal(estimate.taxableRentalIncome, 10_000_000);
  assert.equal(estimate.tax, 1_200_000);
  assert.equal(estimate.balance, 700_000);
});

test("calculates withholding rates and applies the resident supply threshold", () => {
  const belowThreshold = calculateWithholdingTax(1_000_000, "resident-supply", true);
  const residentSupply = calculateWithholdingTax(2_000_000, "resident-supply", true);
  const listedDividend = calculateWithholdingTax(1_000_000, "listed-dividend");

  assert.equal(belowThreshold.tax, 0);
  assert.equal(residentSupply.tax, 120_000);
  assert.equal(listedDividend.tax, 100_000);
});

test("calculates withholding categories added from July 2026", () => {
  assert.equal(calculateWithholdingTax(1_000_000, "resident-entertainer").tax, 60_000);
  assert.equal(calculateWithholdingTax(1_000_000, "betting-winnings").tax, 150_000);
  assert.equal(calculateWithholdingTax(1_000_000, "nonresident-debenture-interest").tax, 50_000);
});

test("applies VAT withholding only when the payer is designated and no EFRIS invoice was issued", () => {
  assert.equal(calculateWithholdingTax(1_000_000, "vat-withholding", true, false).tax, 60_000);
  assert.equal(calculateWithholdingTax(1_000_000, "vat-withholding", true, true).tax, 0);
  assert.equal(calculateWithholdingTax(1_000_000, "vat-withholding", false, false).tax, 0);
});

test("applies the user-confirmed presumptive rate and rejects unsupported turnover", () => {
  assert.equal(calculatePresumptiveTax(40_000_000, 1.5).tax, 600_000);
  assert.throws(() => calculatePresumptiveTax(150_000_001, 1.5), RangeError);
  assert.throws(() => calculatePresumptiveTax(40_000_000, Number.NaN), RangeError);
});
