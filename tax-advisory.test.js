const assert = require("node:assert/strict");
const test = require("node:test");
const {
  guidance,
  getSources,
  searchGuidance,
  searchTaxCases,
  taxCases,
} = require("./tax-advisory.js");

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

test("provides cited tax-case summaries and accurately scopes interim decisions", () => {
  assert.ok(taxCases.length > 0);
  for (const item of taxCases) {
    assert.ok(item.name);
    assert.ok(item.citation);
    assert.ok(item.issue);
    assert.ok(item.summary);
    assert.ok(item.significance);
    assert.match(item.sourceUrl, /^https:\/\/ulii\.org\//);
  }

  const vatLease = searchTaxCases("VAT lease time of supply");
  assert.ok(vatLease.some((item) => item.id === "multiple-icd-ura-2026"));
  assert.match(vatLease[0].significance, /interim/i);
});

test("tax-case search returns no match for an unsupported query", () => {
  assert.equal(searchTaxCases("unmatched fictional tax precedent").length, 0);
});
