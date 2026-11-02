const assert = require("node:assert/strict");
const test = require("node:test");
const calculator = require("./tax-calculator.js");
const {
  analyzeTransaction,
  calculateTransactionEstimate,
  financialYearForDate,
} = require("./tax-transaction.js");

function facts(overrides = {}) {
  return {
    type: "consultancy-payment",
    transactionDate: "2026-11-02",
    amount: 3_000_000,
    currency: "UGX",
    description: "Professional services invoice",
    factsConfirmed: true,
    partyRole: "payer",
    taxpayerType: "company",
    taxpayerResidency: "resident",
    counterpartyResidency: "resident",
    vatRegistration: "yes",
    withholdingAgent: "yes",
    relatedParty: "no",
    employmentRelationship: "independent",
    efrisInvoice: "yes",
    ...overrides,
  };
}

test("derives Uganda financial years from valid dates", () => {
  assert.equal(financialYearForDate("2026-07-01"), "2026/27");
  assert.equal(financialYearForDate("2027-06-30"), "2026/27");
  assert.equal(financialYearForDate("2026-06-30"), "2025/26");
  assert.throws(() => financialYearForDate("2026-02-30"), /valid transaction date/);
});

test("screens a consultancy payment without claiming a legal conclusion", () => {
  const analysis = analyzeTransaction(facts());

  assert.equal(analysis.taxPeriod, "2026/27");
  assert.equal(analysis.periodSupported, true);
  assert.equal(analysis.legalConclusion, null);
  assert.deepEqual(analysis.ruleReferences, []);
  assert.ok(analysis.taxHeads.some((head) => head.name === "Withholding Tax"));
  assert.ok(analysis.taxHeads.every((head) => head.status === "further_information_required"));
  assert.deepEqual(analysis.calculatorModules, ["withholding", "vat", "company-income"]);
});

test("requires explicit confirmation and complete classification facts", () => {
  assert.throws(
    () => analyzeTransaction(facts({ factsConfirmed: false })),
    /Confirm the transaction facts/,
  );
  assert.throws(
    () => analyzeTransaction(facts({ partyRole: "" })),
    /Choose your role/,
  );
  assert.throws(
    () => analyzeTransaction(facts({ currency: "USD" })),
    /UGX transactions only/,
  );
});

test("flags related-party, cross-border and unknown facts for review", () => {
  const related = analyzeTransaction(facts({ relatedParty: "yes" }));
  const crossBorder = analyzeTransaction(facts({ counterpartyResidency: "nonresident" }));
  const unknown = analyzeTransaction(facts({ vatRegistration: "unknown" }));

  assert.equal(related.reviewStatus, "review_required");
  assert.match(related.reviewReasons.join(" "), /Related-party/);
  assert.equal(crossBorder.reviewStatus, "review_required");
  assert.match(crossBorder.reviewReasons.join(" "), /treaty/);
  assert.equal(unknown.reviewStatus, "review_required");
});

test("disables automated calculations outside the configured financial year", () => {
  const analysis = analyzeTransaction(facts({ transactionDate: "2025-11-02" }));

  assert.equal(analysis.taxPeriod, "2025/26");
  assert.equal(analysis.calculationsAllowed, false);
  assert.deepEqual(analysis.calculatorModules, []);
  assert.throws(
    () => calculateTransactionEstimate(analysis, "withholding", {}, calculator),
    /not supported/,
  );
});

test("runs the existing withholding function using explicitly entered facts", () => {
  const analysis = analyzeTransaction(facts());
  const estimate = calculateTransactionEstimate(analysis, "withholding", {
    grossPayment: 3_000_000,
    paymentType: "resident-supply",
    isDesignatedPayer: "yes",
    supplierIssuedInvoice: "yes",
  }, calculator);

  assert.equal(estimate.result.tax, 180_000);
  assert.equal(estimate.taxPeriod, "2026/27");
  assert.equal(estimate.status, "indicative_unverified");
});

test("does not run PAYE unless employment is explicitly confirmed", () => {
  const analysis = analyzeTransaction(facts({
    type: "employee-compensation",
    partyRole: "employer",
  }));
  assert.throws(
    () => calculateTransactionEstimate(analysis, "paye", {
      employmentRelationshipConfirmed: "no",
      monthlyTaxableIncome: 5_000_000,
      isResident: "yes",
      monthlyGrossEarnings: 5_000_000,
    }, calculator),
    /Confirm an employment relationship/,
  );
});

test("uses the existing capital allowance function without duplicating its formula", () => {
  const analysis = analyzeTransaction(facts({ type: "machinery-purchase" }));
  const estimate = calculateTransactionEstimate(analysis, "wear-and-tear", {
    assetClass: "class-2",
    openingTaxWrittenDownValue: 0,
    additions: 100_000_000,
    disposalProceeds: 0,
    businessUsePercent: 100,
  }, calculator);

  assert.equal(estimate.result.allowance, 30_000_000);
  assert.equal(estimate.result.closingTaxWrittenDownValue, 70_000_000);
});

test("runs the existing VAT and import/export functions for selected transaction heads", () => {
  const vatAnalysis = analyzeTransaction(facts({ type: "construction-contract" }));
  const vat = calculateTransactionEstimate(vatAnalysis, "vat", {
    standardRatedSales: 1_000_000,
    salesIncludeVat: "no",
    zeroRatedSales: 0,
    exemptSales: 0,
    claimableInputVat: 0,
    annualTaxableTurnover: "",
    threeMonthTaxableTurnover: "",
    remoteServices: "no",
  }, calculator);
  assert.equal(vat.result.netVat, 180_000);

  const importAnalysis = analyzeTransaction(facts({ type: "goods-import" }));
  const customs = calculateTransactionEstimate(importAnalysis, "customs-import", {
    customsValue: 1_000_000,
    customsDutyRate: 10,
    importExciseDuty: 0,
    importWithholdingRate: 0,
    importOtherCharges: 0,
    importVatTreatment: "standard",
  }, calculator);
  assert.equal(customs.result.totalCharges, 298_000);
});

test("does not offer Stamp Duty or capital-gains calculators absent from the published calculator", () => {
  const purchase = analyzeTransaction(facts({ type: "property-purchase", taxpayerType: "individual" }));
  const disposal = analyzeTransaction(facts({ type: "property-disposal", taxpayerType: "individual" }));

  assert.deepEqual(purchase.calculatorModules, ["vat"]);
  assert.deepEqual(disposal.calculatorModules, ["vat"]);
  assert.throws(
    () => calculateTransactionEstimate(purchase, "stamp-duty", {}, calculator),
    /not available for the selected transaction type/,
  );
  assert.throws(
    () => calculateTransactionEstimate(disposal, "capital-gains", {}, calculator),
    /not available for the selected transaction type/,
  );
});

test("only exposes annual company tax calculation for a company taxpayer", () => {
  const companyAnalysis = analyzeTransaction(facts({ taxpayerType: "company" }));
  const individualAnalysis = analyzeTransaction(facts({ taxpayerType: "individual" }));

  assert.ok(companyAnalysis.calculatorModules.includes("company-income"));
  assert.ok(!individualAnalysis.calculatorModules.includes("company-income"));
});
