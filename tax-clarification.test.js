const assert = require("node:assert/strict");
const test = require("node:test");
const { createTaxClarificationEngine } = require("./tax-clarification.js");

const engine = createTaxClarificationEngine();

function fields(result) {
  return result.missingFacts.map((fact) => fact.field);
}

test("VAT input-credit questions request transaction facts needed for a reliable review", () => {
  const result = engine.identifyMissingFacts({
    question: "How much input VAT can I recover on this purchase?",
  });

  for (const field of [
    "transactionDate",
    "amount",
    "priceBasis",
    "supplierVatRegistrationStatus",
    "purchaserVatRegistrationStatus",
    "natureOfSupply",
    "businessUse",
    "supportingDocuments",
  ]) {
    assert.ok(fields(result).includes(field), `missing clarification for ${field}`);
  }
  assert.equal(result.factsSufficient, false);
  assert.equal(result.conclusionReady, false);
  assert.ok(result.followUpQuestions.length > 0);
});

test("withholding questions request payer, recipient, payment, and computation facts only", () => {
  const result = engine.identifyMissingFacts({
    question: "Calculate withholding tax on a payment to a supplier.",
  });

  for (const field of ["transactionDate", "amount", "payerWithholdingAgent", "supplierResidency", "paymentNature"]) {
    assert.ok(fields(result).includes(field), `missing clarification for ${field}`);
  }
  assert.ok(!fields(result).includes("supplierVatRegistrationStatus"));
  assert.ok(!fields(result).includes("priceBasis"));
});

test("transfer-pricing and cross-border questions ask for related-party and contract facts", () => {
  const result = engine.identifyMissingFacts({
    question: "We paid our related foreign parent for management services. Is this transfer pricing compliant?",
  });

  for (const field of ["relatedPartyRelationship", "transactionAmount", "contractualArrangements", "functionsAssetsRisks", "residenceCountries"]) {
    assert.ok(fields(result).includes(field), `missing clarification for ${field}`);
  }
});

test("general tax information does not trigger irrelevant transaction fact requests", () => {
  const result = engine.identifyMissingFacts({ question: "What is VAT?" });

  assert.equal(result.missingFacts.length, 0);
  assert.equal(result.factsSufficient, true);
  assert.equal(result.conclusionReady, false);
});

test("confirmed facts and assumptions remain separate, including false and zero values", () => {
  const result = engine.identifyMissingFacts({
    question: "Calculate VAT on this purchase.",
    facts: {
      transactionDate: "2025-08-03",
      amount: 0,
      priceBasis: "exclusive",
      purchaserVatRegistrationStatus: false,
      natureOfSupply: "goods",
    },
    assumptions: ["The supplied invoice date is accurate."],
  });

  assert.ok(!fields(result).includes("transactionDate"));
  assert.ok(!fields(result).includes("amount"));
  assert.ok(!fields(result).includes("purchaserVatRegistrationStatus"));
  assert.equal(result.confirmedFacts.amount, 0);
  assert.equal(result.confirmedFacts.purchaserVatRegistrationStatus, false);
  assert.deepEqual(result.assumptions, ["The supplied invoice date is accurate."]);
  assert.equal(result.conclusionReady, false);
});

test("multi-tax questions deduplicate shared facts and identify affected heads", () => {
  const result = engine.identifyMissingFacts({
    question: "What VAT and withholding apply to this supplier payment?",
  });
  const dateQuestions = result.missingFacts.filter((fact) => fact.field === "transactionDate");
  const amountQuestions = result.missingFacts.filter((fact) => fact.field === "amount");

  assert.equal(dateQuestions.length, 1);
  assert.equal(amountQuestions.length, 1);
  assert.ok(dateQuestions[0].taxHeads.includes("value-added-tax"));
  assert.ok(dateQuestions[0].taxHeads.includes("withholding-tax"));
});

test("rejects malformed clarification inputs", () => {
  assert.throws(() => engine.identifyMissingFacts({ question: "VAT", facts: [] }), TypeError);
  assert.throws(() => engine.identifyMissingFacts({ question: "VAT", assumptions: "guess" }), TypeError);
});
