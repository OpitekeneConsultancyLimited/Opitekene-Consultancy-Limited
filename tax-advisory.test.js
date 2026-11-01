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
  const incomeAmendments = searchGuidance("software royalty controlled transactions arm's length", "business");
  const softwareRoyaltyAmendments = searchGuidance("software royalty 2026 amendments", "business");
  const exciseAmendments = searchGuidance("2026 excise cement sugar rates", "customs");
  const rentalReturns = searchGuidance("monthly rental provisional return", "rental");
  const vatLifecycle = searchGuidance("VAT Act section 27 input credit invoice returns", "vat");
  const recordsAndObjections = searchGuidance("Tax Procedures Code section 15 records section 26 objection", "business");
  const digitalIncome = searchGuidance("section 86 digital services section 80 foreign tax credit", "international");
  const legalFramework = searchGuidance("Uganda tax laws stamp duty gaming Excise Act", "business");
  const exciseStampGaming = searchGuidance("Excise stamp duty gaming betting operator winnings", "customs");
  const naturalLanguage = searchGuidance("What do I need help with on the recent tax amendments?");
  const deductions = searchGuidance("income tax deduction bad debts section 24");
  const taxAppeals = searchGuidance("how can I appeal an assessment and prove tax");

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
  const incomeAmendmentGuide = incomeAmendments.find((item) => item.id === "income-tax-amendments-2026");
  assert.ok(incomeAmendmentGuide);
  assert.ok(softwareRoyaltyAmendments.some((item) => item.id === "income-tax-amendments-2026"));
  assert.ok(getSources(incomeAmendmentGuide.sourceKeys)
    .some((source) => source.label.includes("secondary source")));
  assert.ok(exciseAmendments.some((item) => item.id === "excise-amendments-2026"));
  const rentalReturnsGuide = rentalReturns.find((item) => item.id === "rental-individual");
  assert.ok(rentalReturnsGuide);
  assert.match(rentalReturnsGuide.summary, /not a general mandatory monthly filing rule/i);
  assert.ok(vatLifecycle.some((item) => item.id === "vat-transaction-lifecycle"));
  assert.ok(recordsAndObjections.some((item) => item.id === "tax-records-assessments-objections"));
  assert.ok(digitalIncome.some((item) => item.id === "international-income-and-digital-services"));
  assert.ok(legalFramework.some((item) => item.id === "uganda-tax-law-framework"));
  assert.ok(exciseStampGaming.some((item) => item.id === "excise-stamp-and-gaming"));
  assert.ok(naturalLanguage.some((item) => item.id === "income-tax-amendments-2026"));
  assert.ok(naturalLanguage.some((item) => item.id === "excise-amendments-2026"));
  assert.ok(naturalLanguage.length <= 12);
  assert.ok(deductions.some((item) => item.id === "business-deductions-and-losses"));
  assert.ok(taxAppeals.some((item) => item.id === "tax-decisions-and-appeals"));
});

test("covers public-finance, treaty, procurement, PPP and anti-corruption topics", () => {
  const fiscalDecentralization = searchGuidance("fiscal decentralization intergovernmental transfers local government tax assignment", "business");
  const treatyNegotiation = searchGuidance("tax treaty negotiation legal policy issues beneficial ownership", "international");
  const procurement = searchGuidance("public procurement tender evaluation contract management value for money", "business");
  const ppp = searchGuidance("public private partnership concession risk sharing viability gap funding", "business");
  const budget = searchGuidance("budget preparation and execution revenue forecasting expenditure control fiscal rules", "business");
  const antiCorruption = searchGuidance("anti-corruption planning and performance integrity risk controls oversight", "business");
  const publicFinance = searchGuidance("public finance and financial management", "business");
  const doubleTaxAgreement = searchGuidance("double tax agreement and treaty relief for dividends", "international");

  assert.ok(fiscalDecentralization.some((item) => item.id === "fiscal-decentralization-policy"));
  assert.ok(treatyNegotiation.some((item) => item.id === "tax-treaty-negotiation"));
  assert.ok(procurement.some((item) => item.id === "public-procurement-governance"));
  assert.ok(ppp.some((item) => item.id === "public-private-partnerships"));
  assert.ok(budget.some((item) => item.id === "budget-preparation-and-execution"));
  assert.ok(antiCorruption.some((item) => item.id === "anti-corruption-planning"));
  assert.ok(publicFinance.some((item) => item.id === "budget-preparation-and-execution"));
  assert.ok(doubleTaxAgreement.some((item) => item.id === "tax-treaty-negotiation"));
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
