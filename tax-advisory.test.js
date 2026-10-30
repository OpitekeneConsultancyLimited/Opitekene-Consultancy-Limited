const assert = require("node:assert/strict");
const test = require("node:test");
const { guidance, getSources, searchGuidance } = require("./tax-advisory.js");

test("provides source-linked guidance across all main tax areas", () => {
  const topics = new Set(guidance.map((item) => item.topic));

  for (const topic of [
    "individual",
    "employment",
    "business",
    "rental",
    "vat",
    "withholding",
    "customs",
  ]) {
    assert.ok(topics.has(topic), `missing guidance topic: ${topic}`);
  }
  for (const item of guidance) {
    assert.ok(item.title);
    assert.ok(item.summary);
    assert.ok(item.nextStep);
    assert.ok(getSources(item.sourceKeys).length > 0);
  }
});

test("searches guidance by question terms and optional topic", () => {
  const vat = searchGuidance("VAT registration threshold");
  const rental = searchGuidance("resident company rental expenses", "rental");
  const withholding = searchGuidance("2026 withholding changes");

  assert.ok(vat.some((item) => item.id === "vat-threshold"));
  assert.ok(rental.some((item) => item.id === "rental-company"));
  assert.ok(withholding.some((item) => item.id === "withholding-changes"));
  assert.equal(searchGuidance("VAT registration threshold", "customs").length, 0);
});

test("returns all guidance for an empty query and no unsupported answer for a miss", () => {
  assert.equal(searchGuidance().length, guidance.length);
  assert.equal(searchGuidance("unmatched invented legal scenario").length, 0);
});
