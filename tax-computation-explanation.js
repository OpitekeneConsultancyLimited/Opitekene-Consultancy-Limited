"use strict";

function copy(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

const methods = Object.freeze({
  calculateIndividualIncomeTax: "The existing calculator applies its configured progressive bands to the supplied taxable income; returned band results are reproduced without recalculation.",
  calculatePaye: "The existing PAYE calculator annualizes the supplied monthly taxable pay, applies the configured individual-income calculation, and returns a monthly estimate. Employee and employer NSSF amounts are separate outputs.",
  calculatePayeWithSecondaryEmployment: "The existing calculator returns primary PAYE, secondary-employment withholding, and a combined-income comparison as distinct outputs.",
  calculateCompanyIncomeTax: "The existing calculator applies its configured company rate to supplied chargeable income and subtracts the user-entered payments and withholding credits.",
  calculateWearAndTear: "The existing calculator applies the selected pool rate after business-use apportionment of additions and disposal proceeds.",
  calculateVat: "The existing VAT calculator returns output VAT and recoverable input VAT components separately, with the supplied price-basis and exempt-supply assumptions.",
  calculateRentalIncomeTax: "The existing rental calculator selects its configured path from the supplied taxpayer type and residency and returns the calculation breakdown.",
  calculateWithholdingTax: "The existing withholding calculator applies the selected payment category to its returned tax base, subject to the supplied payer, invoice, stake, and exemption inputs.",
  calculateCustomsEstimate: "The existing customs estimator returns its component estimates from the supplied classification, rates, and valuation inputs; this explanation does not verify tariff classification or rates.",
  calculatePresumptiveTax: "The existing presumptive calculator uses the user-entered rate and supplied turnover inputs; it does not determine eligibility.",
  calculateCapitalGains: "The specialist calculator's returned gain and tax fields are passed through; no asset classification, relief, or legal qualification is inferred here.",
  calculateCorporateTax: "The specialist calculator's returned reconciliation and tax fields are passed through; no adjustment or deduction is independently reclassified here.",
  calculateCapitalAllowances: "The specialist calculator's returned pool and allowance fields are passed through; no asset classification or statutory rate is inferred here.",
  calculateIndustrialBuildingDeduction: "The specialist calculator's returned deduction review is passed through; no building qualification is inferred here.",
});

const amountDefinitions = Object.freeze({
  calculateVat: [
    ["outputVat", "Supplier output VAT estimate", "supplier-output-vat"],
    ["claimableInputVat", "Purchaser input VAT recovery estimate", "purchaser-input-vat-recovery-subject-to-review"],
    ["netVat", "VAT calculator balance for this calculation only", "vat-calculator-balance-not-a-cross-tax-head-total"],
  ],
  calculatePaye: [
    ["monthlyTax", "Monthly PAYE estimate", "employer-withholding-for-employee-tax"],
    ["monthlyEmployeeNssf", "Employee NSSF contribution estimate", "employee-social-security-contribution"],
    ["monthlyEmployerNssf", "Employer NSSF contribution estimate", "employer-social-security-contribution"],
  ],
  calculatePayeWithSecondaryEmployment: [
    ["primaryMonthlyTax", "Primary-employment PAYE estimate", "employer-withholding-for-employee-tax"],
    ["secondaryMonthlyTax", "Secondary-employment withholding estimate", "secondary-employment-withholding-subject-to-rule-verification"],
    ["totalMonthlyWithholding", "Combined PAYE/withholding output", "withholding-total-within-this-paye-calculation"],
    ["monthlyEmployeeNssf", "Employee NSSF contribution estimate", "employee-social-security-contribution"],
    ["monthlyEmployerNssf", "Employer NSSF contribution estimate", "employer-social-security-contribution"],
  ],
  calculateCompanyIncomeTax: [
    ["tax", "Company income tax estimate", "company-tax-liability-estimate"],
    ["provisionalTaxPaid", "Entered provisional tax paid", "tax-credit-entered"],
    ["withholdingCredits", "Entered withholding credits", "withholding-credit-subject-to-certificates-and-law"],
    ["balance", "Calculator balance after entered credits", "company-tax-balance-estimate"],
  ],
  calculateWearAndTear: [
    ["allowance", "Wear-and-tear allowance estimate", "deduction-estimate-subject-to-classification-and-rule-review"],
    ["closingTaxWrittenDownValue", "Closing tax written-down value", "tax-pool-balance-not-a-tax-payable"],
    ["excessDisposalProceeds", "Excess disposal proceeds flagged by calculator", "requires-balancing-adjustment-review"],
  ],
  calculateRentalIncomeTax: [
    ["tax", "Rental tax or withholding estimate", "rental-tax-estimate-subject-to-taxpayer-and-residency-review"],
    ["totalCredits", "Entered rental tax credits", "entered-credit-subject-to-verification"],
    ["balance", "Rental calculator balance after entered credits", "rental-tax-balance-estimate"],
    ["currentYearLoss", "Current-year rental loss output", "loss-not-automatically-carried-forward"],
  ],
  calculateWithholdingTax: [
    ["tax", "Withholding amount estimate", "payer-withholding-remittance"],
  ],
  calculateCapitalGains: [
    ["chargeableGain", "Chargeable gain output", "gain-computation-subject-to-classification-review"],
    ["tax", "Capital gains tax estimate", "tax-liability-estimate"],
  ],
  calculateCorporateTax: [
    ["chargeableIncome", "Chargeable income output", "tax-base-not-tax-payable"],
    ["tax", "Company tax output", "company-tax-liability-estimate"],
    ["balance", "Balance after entered payments and credits", "company-tax-balance-estimate"],
  ],
  calculateCapitalAllowances: [
    ["allowance", "Capital allowance output", "deduction-estimate-subject-to-review"],
    ["closingTaxWrittenDownValue", "Closing tax written-down value", "tax-pool-balance-not-a-tax-payable"],
  ],
});

function inferTaxBase(result) {
  for (const field of ["taxBase", "taxableIncome", "chargeableIncome", "taxableValue", "taxableSupplyValue", "poolAvailableForAllowance"]) {
    if (Number.isFinite(result[field])) return { field, value: result[field] };
  }
  return null;
}

function inferRate(result) {
  for (const field of ["taxRate", "rate", "secondaryRate", "marginalRate"]) {
    if (Number.isFinite(result[field])) return { field, value: result[field] };
  }
  return null;
}

function ruleVerification(result, ruleRecords = []) {
  const embedded = result.taxRuleSet && typeof result.taxRuleSet === "object"
    ? result.taxRuleSet
    : null;
  const statuses = ruleRecords.map((record) => ({
    ruleId: record.ruleId || record.id || null,
    status: record.status || record.ruleStatus || null,
  }));
  if (embedded?.status || embedded?.ruleStatus) {
    statuses.push({ ruleId: embedded.id || embedded.ruleId || null, status: embedded.status || embedded.ruleStatus });
  }
  if (statuses.length === 0) {
    return { status: "not-verified", ruleIds: [], note: "No verified rule status was supplied with this calculator result." };
  }
  const allVerified = statuses.every((item) => item.status === "verified");
  return {
    status: allVerified ? "verified" : statuses.some((item) => item.status === "pending-review") ? "pending-review" : "unverified",
    ruleIds: statuses.map((item) => item.ruleId).filter(Boolean),
    note: allVerified
      ? "The supplied rule metadata is marked verified; this does not approve the computation or filing."
      : "The supplied rule metadata is not fully verified; treat the result as provisional.",
  };
}

function responsiblePartyFor(calculator) {
  const parties = {
    calculateVat: "Supplier for output VAT; purchaser for any input-tax recovery claimed.",
    calculatePaye: "Employer withholds PAYE from the employee; employee and employer NSSF are separately identified.",
    calculatePayeWithSecondaryEmployment: "Each employer's withholding role must be confirmed; primary and secondary amounts remain separate.",
    calculateCompanyIncomeTax: "Company taxpayer; entered tax payments and withholding credits remain subject to evidence and legal review.",
    calculateWearAndTear: "Business taxpayer claiming the asset allowance; asset ownership and classification require confirmation.",
    calculateRentalIncomeTax: "Landlord or rental taxpayer; payer withholding duties may differ for non-resident rent.",
    calculateWithholdingTax: "Payer remits any required withholding; recipient creditability is a separate legal question.",
    calculateCustomsEstimate: "Importer or exporter as applicable; the customs declaration and party responsible must be confirmed.",
  };
  return parties[calculator] || "Not inferred from calculator output; confirm the responsible taxpayer or withholding party.";
}

function explainCalculation({ calculator, result, ruleRecords = [], legalCitations = [], taxpayer = null, period = null } = {}) {
  if (typeof calculator !== "string" || !result || typeof result !== "object" || Array.isArray(result)) {
    throw new TypeError("A calculator name and structured calculator result are required.");
  }

  const amounts = (amountDefinitions[calculator] || [])
    .filter(([field]) => Number.isFinite(result[field]))
    .map(([field, label, role]) => ({
      key: field,
      label,
      amount: result[field],
      role,
      ...(calculator === "calculateWithholdingTax"
        ? { creditability: "Any recipient credit is conditional and requires legal, certificate, and return verification." }
        : {}),
    }));
  const rawBreakdown = Array.isArray(result.breakdown) ? copy(result.breakdown) : [];
  const citations = Array.isArray(legalCitations) ? copy(legalCitations) : [];
  const taxBase = inferTaxBase(result);
  const rate = inferRate(result);
  const separatePartyViews = calculator === "calculateWithholdingTax" && Number.isFinite(result.tax)
    ? [
      { party: "payer", item: "withholding remittance estimate", amount: result.tax, status: "subject to payer status and applicable rule verification" },
      { party: "recipient", item: "potential withholding credit", amount: result.tax, status: "not determined; verify legal creditability and certificate" },
    ]
    : [];

  return {
    calculator,
    period,
    taxpayer: taxpayer ? copy(taxpayer) : null,
    responsibleParty: responsiblePartyFor(calculator),
    methodology: methods[calculator] || "Calculation method is not mapped; consult the original calculator output.",
    taxBase,
    rate,
    amounts,
    separatePartyViews,
    breakdown: rawBreakdown,
    legalBasis: citations,
    ruleVerification: ruleVerification(result, ruleRecords),
    calculatorResult: copy(result),
    filingApproved: false,
    disclaimer: "This explanation reports existing calculator outputs; it does not independently compute a rate, determine legal eligibility, or approve a return.",
  };
}

function explainTransactionAssessment(assessment) {
  if (!assessment || typeof assessment !== "object" || !Array.isArray(assessment.taxHeads)) {
    throw new TypeError("A structured transaction assessment with tax-head results is required.");
  }

  const taxHeads = assessment.taxHeads.map((head) => ({
    key: head.key,
    label: head.label,
    status: head.status,
    responsibleParty: head.responsibleParty || "To be confirmed",
    taxEvent: head.taxEvent || null,
    amount: Number.isFinite(head.calculation?.amount) ? head.calculation.amount : null,
    calculationLabel: head.calculation?.label || null,
    breakdown: Array.isArray(head.calculation?.breakdown) ? copy(head.calculation.breakdown) : [],
    informationRequired: [...(head.informationRequired || [])],
    verificationNote: head.verificationNote || "No final applicability decision is made by this prototype.",
    role: head.key === "vat"
      ? "VAT components remain separate; supplier output VAT and purchaser input VAT are not netted across parties."
      : head.key === "withholding-tax"
        ? "Payer remittance and any recipient credit are separate questions; creditability needs legal verification."
        : head.key === "paye"
          ? "Employer withholding remains separate from employee and employer social-security contributions."
          : "This tax head is reported independently from every other transaction tax head.",
  }));

  return {
    status: assessment.status || "pending_review",
    eventDate: assessment.eventDate || null,
    taxHeads,
    riskFlags: [...(assessment.riskFlags || [])],
    finalTaxPayable: null,
    noDoubleCount: true,
    filingApproved: false,
    disclaimer: "Each tax head remains separate. No aggregate liability is calculated or implied by this explanation.",
  };
}

module.exports = {
  explainCalculation,
  explainTransactionAssessment,
  ruleVerification,
};
