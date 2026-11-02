const assert = require("node:assert/strict");
const test = require("node:test");
const taxRules = require("./tax-rules.js");
const {
  calculateCompanyIncomeTax,
  calculateWearAndTear,
  calculateChargeableIncome,
  calculateCompanyTaxBase,
  calculateCustomsEstimate,
  calculateIndividualIncomeTax,
  calculateSmartTaxSummary,
  calculatePaye,
  calculatePayeWithSecondaryEmployment,
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
  const rules = taxRules.getRulesForFinancialYear("2026/27");

  assert.equal(estimate.breakdown.length, 5);
  assert.equal(estimate.effectiveRate, 38_659_000 / 130_000_000);
  assert.equal(estimate.marginalRate, 0.4);
  assert.equal(estimate.taxRuleSet.id, rules.id);
  assert.equal(estimate.taxRuleSet.approvedForFiling, false);
  assert.equal(estimate.taxRuleSet.sourceReferences[0].sourceType, "curated-secondary-summary");
});

test("exports the smart individual-tax summary used by the calculator UI", () => {
  const estimate = calculateSmartTaxSummary({
    taxableIncome: 48_000_000,
    employeeNssf: 2_400_000,
    isResident: true,
  });

  assert.equal(estimate.estimate.totalTax, 13_059_000);
  assert.equal(estimate.nssfRelief, 2_400_000);
  assert.equal(estimate.totalTax, 10_659_000);
  assert.equal(estimate.estimate.taxRuleSet.id, "UG-FY2026-27-v1");
});

test("tags PAYE, company tax and wear-and-tear estimates with their ruleset", () => {
  const paye = calculatePaye(4_000_000);
  const company = calculateCompanyIncomeTax(10_000_000);
  const allowance = calculateWearAndTear({
    assetClass: "class-1",
    openingTaxWrittenDownValue: 1_000_000,
    businessUsePercent: 100,
  });

  assert.equal(paye.taxRuleSet.id, "UG-FY2026-27-v1");
  assert.equal(company.taxRuleSet.financialYear, "2026/27");
  assert.equal(company.taxRate, 0.3);
  assert.equal(allowance.taxRuleSet.approvedForFiling, false);
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

test("applies progressive primary PAYE and 40% secondary-employment withholding", () => {
  const estimate = calculatePayeWithSecondaryEmployment(3_000_000, 1_000_000);

  assert.equal(estimate.primaryMonthlyTax, 788_250);
  assert.equal(estimate.secondaryRate, 0.4);
  assert.equal(estimate.secondaryMonthlyTax, 400_000);
  assert.equal(estimate.totalMonthlyWithholding, 1_188_250);
  assert.equal(estimate.combinedMonthlyTaxableIncome, 4_000_000);
  assert.equal(estimate.estimatedMonthlyTaxOnCombinedIncome, 1_088_250);
  assert.equal(estimate.monthlyWithholdingDifference, 100_000);
});

test("supports selecting either employer while calculating combined withholding once", () => {
  const primarySelected = calculatePayeWithSecondaryEmployment(3_000_000, 1_000_000);
  const secondarySelected = calculatePayeWithSecondaryEmployment(3_000_000, 1_000_000);

  assert.equal(primarySelected.totalMonthlyWithholding, 1_188_250);
  assert.equal(secondarySelected.totalMonthlyWithholding, 1_188_250);
  assert.equal(secondarySelected.primaryMonthlyTax, 788_250);
  assert.equal(secondarySelected.secondaryMonthlyTax, 400_000);
});

test("secondary PAYE calculation matches primary-only results when secondary income is zero", () => {
  const primary = calculatePaye(4_000_000);
  const combined = calculatePayeWithSecondaryEmployment(4_000_000);

  assert.equal(combined.primaryMonthlyTax, primary.monthlyTax);
  assert.equal(combined.totalMonthlyWithholding, primary.monthlyTax);
  assert.equal(combined.monthlyEmployeeNssf, primary.monthlyEmployeeNssf);
});

test("rejects invalid secondary employment income", () => {
  assert.throws(() => calculatePayeWithSecondaryEmployment(1_000_000, -1), RangeError);
  assert.throws(() => calculatePayeWithSecondaryEmployment(1_000_000, Number.NaN), RangeError);
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

test("calculates wear-and-tear allowances at the statutory reducing-balance class rates", () => {
  const class1 = calculateWearAndTear({
    assetClass: "class-1",
    openingTaxWrittenDownValue: 10_000_000,
    additions: 4_000_000,
    disposalProceeds: 1_000_000,
    businessUsePercent: 100,
  });
  const class2 = calculateWearAndTear({
    assetClass: "class-2",
    openingTaxWrittenDownValue: 10_000_000,
    businessUsePercent: 100,
  });
  const class3 = calculateWearAndTear({
    assetClass: "class-3",
    openingTaxWrittenDownValue: 10_000_000,
    businessUsePercent: 100,
  });

  assert.equal(class1.rate, 0.4);
  assert.equal(class1.poolAvailableForAllowance, 13_000_000);
  assert.equal(class1.allowance, 5_200_000);
  assert.equal(class1.closingTaxWrittenDownValue, 7_800_000);
  assert.equal(class2.rate, 0.3);
  assert.equal(class2.allowance, 3_000_000);
  assert.equal(class3.rate, 0.2);
  assert.equal(class3.allowance, 2_000_000);
  assert.equal(class1.breakdown.length, 6);
});

test("apportions additions and disposals for business use and flags excess proceeds", () => {
  const apportioned = calculateWearAndTear({
    assetClass: "class-3",
    openingTaxWrittenDownValue: 1_000_000,
    additions: 2_000_000,
    disposalProceeds: 500_000,
    businessUsePercent: 50,
  });
  const excess = calculateWearAndTear({
    assetClass: "class-1",
    openingTaxWrittenDownValue: 0,
    additions: 1_000_000,
    disposalProceeds: 1_200_000,
    businessUsePercent: 100,
  });

  assert.equal(apportioned.poolAvailableForAllowance, 1_750_000);
  assert.equal(apportioned.allowance, 350_000);
  assert.equal(apportioned.closingTaxWrittenDownValue, 1_400_000);
  assert.equal(excess.allowance, 0);
  assert.equal(excess.excessDisposalProceeds, 200_000);
  assert.throws(() => calculateWearAndTear({
    assetClass: "class-4",
    openingTaxWrittenDownValue: 0,
    businessUsePercent: 100,
  }), RangeError);
  assert.throws(() => calculateWearAndTear({
    assetClass: "class-1",
    openingTaxWrittenDownValue: -1,
    businessUsePercent: 100,
  }), RangeError);
  assert.throws(() => calculateWearAndTear({
    assetClass: "class-1",
    openingTaxWrittenDownValue: 0,
    businessUsePercent: 100.1,
  }), RangeError);
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

test("calculates resident individual rental tax after the annual threshold", () => {
  const estimate = calculateRentalIncomeTax({
    grossRentalIncome: 12_820_000,
    taxPaid: 500_000,
  });

  assert.equal(estimate.taxBase, 10_000_000);
  assert.equal(estimate.tax, 1_200_000);
  assert.equal(estimate.balance, 700_000);
});

test("calculates resident company rental tax on entered chargeable rental profit", () => {
  const estimate = calculateRentalIncomeTax({
    grossRentalIncome: 12_000_000,
    taxpayerType: "company",
    allowableExpenses: 3_000_000,
    carriedForwardLosses: 1_000_000,
    taxPaid: 200_000,
    withholdingCredits: 100_000,
  });

  assert.equal(estimate.taxBase, 8_000_000);
  assert.equal(estimate.tax, 2_400_000);
  assert.equal(estimate.totalCredits, 300_000);
  assert.equal(estimate.balance, 2_100_000);
});

test("calculates 15% gross rent withholding for non-resident landlords", () => {
  for (const taxpayerType of ["individual", "company"]) {
    const estimate = calculateRentalIncomeTax({
      grossRentalIncome: 12_000_000,
      taxpayerType,
      residency: "nonresident",
      allowableExpenses: 3_000_000,
      taxPaid: 500_000,
    });

    assert.equal(estimate.tax, 1_800_000);
    assert.equal(estimate.balance, 1_300_000);
    assert.equal(estimate.taxRate, 0.15);
  }
});

test("shows current-year company rental loss without taxing negative income", () => {
  const estimate = calculateRentalIncomeTax({
    grossRentalIncome: 2_000_000,
    taxpayerType: "company",
    allowableExpenses: 3_000_000,
  });

  assert.equal(estimate.tax, 0);
  assert.equal(estimate.taxBase, 0);
  assert.equal(estimate.currentYearLoss, 1_000_000);
  assert.throws(() => calculateRentalIncomeTax({
    grossRentalIncome: 2_000_000,
    taxpayerType: "company",
    allowableExpenses: 500_000,
    carriedForwardLosses: 2_000_000,
  }), RangeError);
  assert.throws(() => calculateRentalIncomeTax({
    grossRentalIncome: -1,
  }), RangeError);
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
  const bettingWinnings = calculateWithholdingTax(
    1_000_000,
    "betting-winnings",
    false,
    false,
    400_000,
  );
  assert.equal(bettingWinnings.tax, 90_000);
  assert.equal(bettingWinnings.taxBase, 600_000);
  assert.equal(
    calculateWithholdingTax(1_000_000, "betting-winnings", false, false, 1_000_000).tax,
    0,
  );
  assert.equal(
    calculateWithholdingTax(1_000_000, "betting-winnings", false, false, 400_000, true).tax,
    0,
  );
  assert.throws(
    () => calculateWithholdingTax(100, "betting-winnings", false, false, 101),
    RangeError,
  );
  assert.throws(
    () => calculateWithholdingTax(100, "betting-winnings", false, false, -1),
    RangeError,
  );
  assert.equal(calculateWithholdingTax(1_000_000, "resident-telecom-commission").tax, 100_000);
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
