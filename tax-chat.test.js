const assert = require("node:assert/strict");
const test = require("node:test");
const advisory = require("./tax-advisory.js");
const { findLocalAnswer } = require("./tax-chat.js");

test("answers common VAT questions from reviewed guidance and includes citations", () => {
  const result = findLocalAnswer("What are the VAT registration thresholds?", advisory);

  assert.match(result.answer, /UGX 300 million/);
  assert.ok(result.sources.some((source) => source.url === "https://www.ura.go.ug/"));
  assert.ok(result.matches.some((item) => item.id === "vat-threshold"));
  assert.ok(result.calculators.includes("vat"));
});

test("answers case questions with case-specific caveats and judgment link", () => {
  const result = findLocalAnswer("What did Quickway decide about input VAT evidence?", advisory);

  assert.match(result.answer, /failed to prove the input VAT payments/i);
  assert.match(result.answer, /does not mean every input VAT claim/i);
  assert.ok(result.sources.some((source) => source.url.includes("/ugtat/2023/2/")));
});

test("recommends only calculators matched by reviewed guidance", () => {
  const paye = findLocalAnswer("Which employment benefits can affect PAYE?", advisory);
  const unsupported = findLocalAnswer("What will the weather be tomorrow?", advisory);

  assert.ok(paye.calculators.includes("paye"));
  assert.deepEqual(unsupported.calculators, []);
});

test("recommends the international workbench for cross-border guidance", () => {
  const treaty = findLocalAnswer("treaty withholding agreement", advisory);

  assert.ok(treaty.matches.some((item) => item.id === "international-treaties"));
  assert.ok(treaty.calculators.includes("international"));
  assert.match(treaty.answer, /treaty rate/i);
});

test("does not invent a local answer for unsupported questions", () => {
  const result = findLocalAnswer("What will the weather be tomorrow?", advisory);

  assert.match(result.answer, /couldn't find a reviewed TaxComp note/i);
  assert.equal(result.matches.length, 0);
  assert.deepEqual(result.calculators, []);
});

test("offers useful prompts when the user enters a greeting", () => {
  const result = findLocalAnswer("Hello", advisory);

  assert.match(result.answer, /Uganda taxes, cross-border tax topics/i);
});
