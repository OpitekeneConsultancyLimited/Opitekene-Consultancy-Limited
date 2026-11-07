const assert = require("node:assert/strict");
const test = require("node:test");
const {
  explainCalculation,
  explainTransactionAssessment,
} = require("./tax-computation-explanation.js");

test("VAT explanation preserves supplier output and purchaser input amounts separately", () => {
  const result = {
    outputVat: 180,
    claimableInputVat: 45,
    enteredInputVat: 60,
    netVat: 135,
    taxableSupplyValue: 1000,
    taxRuleSet: { id: "UG-VAT-FY2026-27", status: "pending-review" },
    breakdown: [
      { label: "Output VAT on standard-rated sales", rate: 0.18, amount: 180 },
      { label: "Allowable input VAT after restriction", rate: null, amount: -45 },
    ],
  };
  const explanation = explainCalculation({ calculator: "calculateVat", result });

  assert.deepEqual(explanation.taxBase, { field: "taxableSupplyValue", value: 1000 });
  assert.equal(explanation.amounts.find((item) => item.key === "outputVat").role, "supplier-output-vat");
  assert.equal(explanation.amounts.find((item) => item.key === "claimableInputVat").role, "purchaser-input-vat-recovery-subject-to-review");
  assert.equal(explanation.amounts.find((item) => item.key === "outputVat").amount, 180);
  assert.equal(explanation.amounts.find((item) => item.key === "claimableInputVat").amount, 45);
  assert.match(explanation.responsibleParty, /Supplier for output VAT; purchaser/);
  assert.equal(explanation.ruleVerification.status, "pending-review");
  assert.deepEqual(explanation.calculatorResult, result);
});

test("PAYE explanation separates employee withholding and employer and employee NSSF amounts", () => {
  const explanation = explainCalculation({
    calculator: "calculatePaye",
    result: {
      monthlyTax: 120,
      monthlyEmployeeNssf: 50,
      monthlyEmployerNssf: 100,
      breakdown: [{ label: "PAYE", rate: 0.2, tax: 120 }],
      taxRuleSet: { id: "UG-PAYE-FY2026-27", status: "pending-review" },
    },
  });

  assert.equal(explanation.amounts.find((item) => item.key === "monthlyTax").role, "employer-withholding-for-employee-tax");
  assert.ok(explanation.amounts.some((item) => item.key === "monthlyEmployeeNssf"));
  assert.ok(explanation.amounts.some((item) => item.key === "monthlyEmployerNssf"));
});

test("withholding explanation does not presume recipient creditability or filing approval", () => {
  const explanation = explainCalculation({
    calculator: "calculateWithholdingTax",
    result: {
      tax: 75,
      rate: 0.075,
      taxBase: 1000,
      paymentLabel: "Professional service payment",
      taxRuleSet: { id: "UG-WHT-FY2026-27", status: "pending-review" },
      breakdown: [{ label: "Gross payment", rate: null, amount: 1000 }],
    },
  });

  assert.equal(explanation.amounts[0].role, "payer-withholding-remittance");
  assert.match(explanation.amounts[0].creditability, /requires legal, certificate, and return verification/i);
  assert.deepEqual(explanation.separatePartyViews.map((item) => item.party), ["payer", "recipient"]);
  assert.equal(explanation.separatePartyViews[1].amount, 75);
  assert.equal(explanation.filingApproved, false);
});

test("transaction explanation keeps each tax head independent with no combined payable", () => {
  const explanation = explainTransactionAssessment({
    status: "pending_review",
    finalTaxPayable: 900,
    taxHeads: [
      { key: "vat", label: "VAT", status: "pending_review", responsibleParty: "Supplier", calculation: { amount: 180, label: "Output VAT" } },
      { key: "withholding-tax", label: "Withholding tax", status: "pending_review", responsibleParty: "Payer", calculation: { amount: 75, label: "WHT" } },
      { key: "paye", label: "PAYE", status: "information_required", responsibleParty: "Employer", calculation: null, informationRequired: ["employee residence"] },
    ],
    riskFlags: ["Review documents."],
  });

  assert.equal(explanation.taxHeads.length, 3);
  assert.deepEqual(explanation.taxHeads.map((head) => head.amount), [180, 75, null]);
  assert.equal(explanation.finalTaxPayable, null);
  assert.equal(explanation.noDoubleCount, true);
  assert.equal(explanation.taxHeads[1].responsibleParty, "Payer");
  assert.deepEqual(explanation.taxHeads[2].informationRequired, ["employee residence"]);
});

test("unknown calculator output is preserved without invented bases or rates", () => {
  const result = { customOutput: 42, taxRuleSet: { status: "pending-review" } };
  const explanation = explainCalculation({ calculator: "custom-calculator", result });

  assert.equal(explanation.taxBase, null);
  assert.equal(explanation.rate, null);
  assert.deepEqual(explanation.calculatorResult, result);
  assert.equal(explanation.methodology, "Calculation method is not mapped; consult the original calculator output.");
});
