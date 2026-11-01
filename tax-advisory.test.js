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
    "international",
    "business",
  ]) {
    assert.ok(topics.has(topic), `missing guidance topic: ${topic}`);
  }
  for (const item of guidance) {
    assert.ok(item.title);
    assert.ok(item.summary);
    assert.ok(item.nextStep);
    assert.ok(getSources(item.sourceKeys).length > 0);
    assert.ok(getSources(item.sourceKeys).every(Boolean), `missing source for: ${item.id}`);
  }
});

test("searches guidance by question terms and optional topic", () => {
  const vat = searchGuidance("VAT registration threshold");
  const rental = searchGuidance("resident company rental expenses", "rental");
  const withholding = searchGuidance("2026 withholding changes");
  const wearAndTear = searchGuidance("wear and tear classes");
  const treaty = searchGuidance("international treaty withholding beneficial ownership", "international");
  const transferPricing = searchGuidance("related party transfer pricing arm's length", "international");
  const audit = searchGuidance("business tax audit prepare notice evidence", "business");
  const healthCheck = searchGuidance("business tax health check VAT PAYE records", "business");

  assert.ok(vat.some((item) => item.id === "vat-threshold"));
  assert.ok(rental.some((item) => item.id === "rental-company"));
  assert.ok(withholding.some((item) => item.id === "withholding-changes"));
  const allowance = wearAndTear.find((item) => item.id === "capital-allowances");
  assert.ok(allowance);
  assert.match(allowance.summary, /Class 1.*40%.*Class 2.*30%.*Class 3.*20%/);
  assert.ok(getSources(allowance.sourceKeys).some((source) => source.url.endsWith("/corporate/deductions")));
  assert.equal(searchGuidance("VAT registration threshold", "customs").length, 0);
  assert.ok(treaty.some((item) => item.id === "international-treaties"));
  assert.ok(transferPricing.some((item) => item.id === "international-transfer-pricing"));
  assert.equal(treaty.find((item) => item.id === "international-treaties").calculator, "international");
  assert.ok(audit.some((item) => item.id === "business-tax-audit"));
  assert.ok(healthCheck.some((item) => item.id === "business-tax-health-check"));
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

  const inputVat = searchTaxCases("input VAT evidence payments");
  assert.ok(inputVat.some((item) => item.id === "quickway-property-services-ura-2023"));
  assert.equal(inputVat[0].court, "Tax Appeals Tribunal (Uganda)");
  assert.match(inputVat[0].summary, /dismissed the application with costs/i);
});

test("tax-case search returns no match for an unsupported query", () => {
  assert.equal(searchTaxCases("unmatched fictional tax precedent").length, 0);
});
