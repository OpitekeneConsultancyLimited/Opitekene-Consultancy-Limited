// Tax Companion: natural-language requests go to the right TaxComp tool.
const test = require("node:test");
const assert = require("node:assert/strict");
const { companionIntent } = require("./dashboard.js");

test("the brief's example questions reach the right tools", () => {
  const route = (q) => companionIntent(q)?.action.href ?? "assistant";
  assert.equal(route("I am new to taxation. Where should I start?"), "#ws-dashboard-discover");
  assert.equal(route("I operate a small business. What taxes might apply to me?"), "#ws-dashboard-discover");
  assert.equal(route("I have received a URA assessment. What should I do?"), "#challenge");
  assert.equal(route("How do I calculate VAT?"), "#calc-vat");
  assert.equal(route("How do I register for a TIN?"), "#ws-dashboard-discover");
  assert.equal(route("What tax obligations apply to my employees?"), "#calc-paye");
  assert.equal(route("Is my landlord income taxed?"), "#calc-rental");
  assert.equal(route("Explain the arm's length principle"), "assistant", "anything else goes to the AI assistant");
  assert.equal(route("How does the new VAT threshold affect my business?"), "#impact-assessment");
  assert.equal(route("How did the 2026 amendments change my PAYE?"), "#impact-assessment");
});

test("every intent has a simple and a professional explanation, and states no rate", () => {
  const { INTENTS } = require("./dashboard.js");
  for (const intent of INTENTS) {
    assert.ok(intent.simple.length > 20 && intent.professional.length > 20, intent.id);
    assert.doesNotMatch(`${intent.simple} ${intent.professional}`, /\d\s?%|UGX\s?\d/, intent.id);
  }
});
