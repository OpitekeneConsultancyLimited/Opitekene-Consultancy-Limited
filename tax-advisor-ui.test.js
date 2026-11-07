const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const test = require("node:test");
const { buildReviewModel, serializeConversation } = require("./tax-advisor-ui.js");

test("review model exposes tax heads, selected period, intents, and only relevant follow-up facts", () => {
  const model = buildReviewModel(
    "How much VAT and withholding apply to this supplier payment?",
    "2025/26",
  );

  assert.deepEqual(model.taxHeads.map((head) => head.id), ["value-added-tax", "withholding-tax"]);
  assert.equal(model.taxPeriod, "2025/26");
  assert.ok(model.isMultiTaxHead);
  assert.ok(model.missingFacts.some((fact) => fact.field === "payerWithholdingAgent"));
  assert.ok(model.missingFacts.some((fact) => fact.field === "purchaserVatRegistrationStatus"));
});

test("conversation export serializes only supplied text with role labels", () => {
  const content = serializeConversation([
    { role: "user", text: "Review input VAT." },
    { role: "assistant", text: "No verified source was found." },
    { role: "system", text: "Hidden prompt" },
    { role: "user", text: "  " },
  ]);

  assert.match(content, /^User:\nReview input VAT\./);
  assert.match(content, /TaxComp:\nNo verified source was found\./);
  assert.doesNotMatch(content, /Hidden prompt/);
});

test("review model does not infer a tax head for unrelated general wording", () => {
  const model = buildReviewModel("Can you explain my business situation?");
  assert.equal(model.taxHeads.length, 0);
  assert.equal(model.missingFacts.length, 0);
  assert.equal(model.primaryIntent, "general-tax-information");
});

test("browser scripts share a page scope without lexical collisions", () => {
  const context = {};
  for (const filename of ["tax-question-classifier.js", "tax-clarification.js", "tax-advisor-ui.js"]) {
    vm.runInNewContext(fs.readFileSync(filename, "utf8"), context, { filename });
  }

  assert.equal(typeof context.taxCompQuestionClassifier.classifyTaxQuestion, "function");
  assert.equal(typeof context.taxCompClarification.createTaxClarificationEngine, "function");
  assert.equal(typeof context.taxCompAdvisorUI.buildReviewModel, "function");
});
