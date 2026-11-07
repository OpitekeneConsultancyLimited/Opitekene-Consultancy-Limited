const assert = require("node:assert/strict");
const test = require("node:test");
const {
  classifyTaxQuestion,
  createTaxQuestionClassifier,
} = require("./tax-question-classifier.js");

test("classifies the requested Uganda tax topics and tax heads", () => {
  const result = classifyTaxQuestion({
    question: "How do VAT, PAYE, corporate and individual income tax, rental, WHT, capital gains, capital allowances, industrial building deductions, stamp duty, excise, customs, transfer pricing and DTAs apply? Also check EFRIS, exemptions, accounting deductions and penalties.",
  });

  for (const head of [
    "value-added-tax",
    "paye",
    "corporate-income-tax",
    "individual-income-tax",
    "rental-income-tax",
    "withholding-tax",
    "capital-gains-tax",
    "capital-allowances",
    "stamp-duty",
    "excise-duty",
    "customs-import-tax",
    "transfer-pricing",
    "international-tax",
    "double-taxation-agreement",
  ]) {
    assert.ok(result.taxHeads.some((item) => item.id === head), `missing tax head ${head}`);
  }
  for (const topic of ["industrial-building-deduction", "tax-procedures-and-penalties", "efris", "tax-exemptions-and-incentives", "tax-accounting-and-deductibility"]) {
    assert.ok(result.topics.includes(topic), `missing topic ${topic}`);
  }
  assert.equal(result.isMultiTaxHead, true);
  assert.ok(result.topics.includes("multiple-tax-head-transactions"));
});

test("identifies multiple intents for specific historical transactions and computations", () => {
  const result = classifyTaxQuestion({
    question: "For FY 2023/24, how much VAT and withholding tax applied to this equipment purchase?",
  });

  assert.equal(result.taxPeriod, "2023/24");
  assert.equal(result.isHistoricalPeriod, true);
  assert.ok(result.intents.includes("historical-tax-treatment"));
  assert.ok(result.intents.includes("specific-transaction"));
  assert.ok(result.intents.includes("tax-computation"));
  assert.equal(result.isMultiTaxHead, true);
});

test("distinguishes compliance, legal dispute, planning, and advice requests", () => {
  const result = classifyTaxQuestion({
    question: "Should I appeal this URA assessment, what is the objection deadline, and what professional advice do you recommend?",
  });

  assert.ok(result.intents.includes("legal-dispute"));
  assert.ok(result.intents.includes("compliance-requirements"));
  assert.ok(result.intents.includes("professional-advice-request"));

  const planning = classifyTaxQuestion({
    question: "Can we structure this transaction in a tax-efficient way?",
  });
  assert.ok(planning.intents.includes("tax-planning-scenario"));
});

test("uses structured tax-head input and resolves explicit dates to Uganda financial years", () => {
  const result = classifyTaxQuestion({
    question: "Review this payment",
    taxHeads: ["vat", "withholding-tax"],
    transactionDate: "2025-03-15",
  });

  assert.deepEqual(result.taxHeads.map((head) => head.id), ["value-added-tax", "withholding-tax"]);
  assert.equal(result.taxPeriod, "2024/25");
  assert.equal(result.taxPeriodSource, "transaction-date");
  assert.equal(result.isHistoricalPeriod, true);
});

test("does not infer an unstated tax head and treats generic income-tax wording as tentative", () => {
  const generic = classifyTaxQuestion({ question: "What is the income tax treatment?" });
  const unrelated = classifyTaxQuestion({ question: "Can you explain my business situation?" });

  assert.ok(generic.taxHeads.some((head) => head.id === "individual-income-tax" && head.confidence === "possible"));
  assert.equal(unrelated.taxHeads.length, 0);
  assert.equal(unrelated.primaryIntent, "general-tax-information");
});

test("supports configurable current financial year and validates input", () => {
  const classifier = createTaxQuestionClassifier({ currentFinancialYear: "2025/26" });
  const result = classifier.classify({ question: "What is VAT in FY 2025/26?" });

  assert.equal(result.isHistoricalPeriod, false);
  assert.throws(() => classifyTaxQuestion({ question: " " }), TypeError);
  assert.throws(() => createTaxQuestionClassifier({ currentFinancialYear: "2025/27" }), RangeError);
});
