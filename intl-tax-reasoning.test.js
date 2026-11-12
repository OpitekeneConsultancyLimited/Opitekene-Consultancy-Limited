// Guided international tax reasoning and the calculations with working.
// Includes one walk-through per persona in the brief: beginner, accountant,
// business owner, consultant, investor, employee with foreign income, and an
// international company.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const reasoning = require("./intl-tax-reasoning.js");
const intl = require("./international-tax.js");

const { detectFacts, nextQuestions, analyse, PRIMER, TOPICS, DOMESTIC } = reasoning;
const html = fs.readFileSync(path.join(__dirname, "taxcomp", "index.html"), "utf8");
const calculatorOptions = new Set([...html.matchAll(/<option value="([A-Za-z]+)">/g)].map((m) => m[1]));
const seedSql = fs.readFileSync(path.join(__dirname, "supabase", "migrations", "20261112000100_knowledge_base.sql"), "utf8");

/** Answers every remaining question with the given values, as the page would. */
function complete(question, answers) {
  const facts = detectFacts(question);
  const asked = nextQuestions(facts).map((q) => q.id);
  Object.assign(facts, answers);
  return { facts, asked, remaining: nextQuestions(facts).map((q) => q.id), answer: analyse(facts) };
}

/** Rules every answer must keep. */
function assertHonest(answer) {
  const text = JSON.stringify(answer);
  assert.doesNotMatch(text, /\d\s?%|per ?cent/i, "no rate is stated");
  assert.doesNotMatch(text, /\bpp?\.\s*\d|\bpage \d/i, "no page references");
  for (const key of ["understanding", "shortAnswer", "rules", "sources", "uncertainty", "steps"]) assert.ok(answer[key] && answer[key].length, `${key} present`);
  assert.equal(answer.steps.length, 12);
  assert.deepEqual(answer.steps.map((s) => s.n), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  for (const rule of answer.rules) assert.match(rule.layer, /^(International principle|Uganda law|Administrative guidance)/);
  for (const source of answer.sources.filter((s) => s.kind === "framework")) assert.match(source.ref, /International Tax Primer, 4th ed\..*Chapter \d: /);
  if (answer.calculation) assert.ok(calculatorOptions.has(answer.calculation), `calculator ${answer.calculation} exists on the page`);
}

test("framework: nine chapters, every topic maps to a chapter and to a seeded record", () => {
  assert.equal(PRIMER.chapters.length, 9);
  assert.deepEqual(PRIMER.chapters.map(([n]) => n), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  for (const topic of TOPICS) {
    assert.ok(topic.chapters.every((n) => n >= 1 && n <= 9), topic.id);
    assert.ok(seedSql.includes(`('${topic.id}',`), `${topic.id} is seeded as a draft note`);
  }
  assert.equal(DOMESTIC.UG.length, 15, "the fifteen Uganda tax areas in the brief");
  assert.equal(DOMESTIC.UG.find((d) => d.category === "customs").statute, null, "no statute is invented where the register has none");
});

test("persona: beginner — 'I received money from a company outside Uganda'", () => {
  const { facts, asked, remaining, answer } = complete("I received money from a company outside Uganda.", { residence: "UG", transaction: "services", country: "Kenya", period: "2026/27", regularity: "one-off", foreignTax: "no" });
  assert.equal(facts.international, true);
  assert.equal(facts.direction, "inbound");
  assert.equal(facts.taxpayer, "individual", "'from a company' is the payer, not the asker");
  assert.deepEqual(asked, ["residence", "transaction", "country", "period", "regularity", "foreignTax"], "asks where they live, what it was for, type, country and period");
  assert.deepEqual(remaining, []);
  assert.equal(answer.scenario, "resident-inbound");
  assert.match(answer.shortAnswer, /may be taxable in Uganda as well as in Kenya/);
  assert.equal(answer.calculation, "taxableIncome");
  assertHonest(answer);
});

test("persona: accountant — management fees to a parent company abroad", () => {
  const { facts, asked, answer } = complete("Our client, a Ugandan company, pays management fees to its parent company in Kenya in 2026/27. Does withholding apply?", { presence: "no" });
  assert.deepEqual([facts.direction, facts.residence, facts.taxpayer, facts.transaction, facts.country, facts.period, facts.related], ["outbound", "UG", "company", "services", "Kenya", "2026/27", "yes"]);
  assert.deepEqual(asked, ["presence"]);
  assert.equal(answer.scenario, "outbound");
  assert.match(answer.shortAnswer, /withhold Uganda tax/);
  assert.ok(answer.rules.some((r) => /arm's length/.test(r.text)), "related party: transfer pricing raised");
  assert.ok(answer.rules.some((r) => /VAT/.test(r.text)), "imported services: VAT raised");
  assert.ok(answer.compliance.some((c) => /residence certificate/.test(c)));
  assert.equal(answer.calculation, "withholdingGrossUp");
  assertHonest(answer);
});

test("persona: business owner — imported software subscription", () => {
  const { asked, answer } = complete("My business pays a foreign provider for a software subscription. Do I need to pay tax on it?", { residence: "UG", transaction: "royalty", country: "United States", period: "2026/27", related: "no" });
  assert.ok(!asked.includes("direction"), "paying a foreign provider is outbound");
  assert.equal(answer.scenario, "outbound");
  assert.ok(answer.rules.some((r) => /VAT/.test(r.text)));
  assertHonest(answer);
});

test("persona: consultant — fees from the UK with tax withheld there", () => {
  const { facts, asked, answer } = complete("I am a consultant in Kampala; a client in the UK paid me fees and tax was withheld there in 2025/26.", { regularity: "regular" });
  assert.deepEqual([facts.direction, facts.residence, facts.country, facts.transaction, facts.foreignTax, facts.period], ["inbound", "UG", "United Kingdom", "services", "yes", "2025/26"]);
  assert.deepEqual(asked, ["regularity"]);
  assert.equal(answer.calculation, "foreignTaxCredit");
  assert.ok(answer.rules.some((r) => r.topic?.id === "intl.foreign-tax-credit"));
  assert.ok(answer.compliance.some((c) => /provisional/.test(c)), "regular income: provisional tax flagged for checking");
  assertHonest(answer);
});

test("persona: investor — dividends from South Africa", () => {
  const { facts, asked, answer } = complete("I live in Uganda and receive dividends from shares in a South African company.", { period: "2026/27", regularity: "regular", foreignTax: "unknown" });
  assert.deepEqual([facts.residence, facts.transaction, facts.country, facts.taxpayer], ["UG", "dividend", "South Africa", "individual"]);
  assert.deepEqual(asked, ["period", "regularity", "foreignTax"]);
  assert.ok(answer.assumptions.some((a) => /foreign tax was paid/.test(a)));
  assertHonest(answer);
});

test("persona: employee with foreign income — remote work for a Dutch employer", () => {
  const { facts, answer } = complete("I work remotely from Kampala for an employer in the Netherlands and get my salary there.", { period: "2026/27", regularity: "regular", foreignTax: "yes" });
  assert.deepEqual([facts.direction, facts.residence, facts.transaction, facts.country], ["inbound", "UG", "employment", "Netherlands"]);
  assert.ok(answer.rules.some((r) => /where the work is physically done/.test(r.text)));
  assert.equal(answer.calculation, "foreignTaxCredit");
  assertHonest(answer);
});

test("persona: international company — Kenyan company with a project in Uganda", () => {
  const { facts, asked, answer } = complete("We are a Kenyan company with staff on a project in Uganda for 8 months. Are we taxable in Uganda?", { direction: "other", transaction: "services", period: "2026/27", presence: "yes", related: "no" });
  assert.equal(facts.residence, "other");
  assert.equal(facts.taxpayer, "company");
  assert.ok(asked.includes("direction"));
  assert.equal(answer.scenario, "nonresident");
  assert.match(answer.shortAnswer, /permanent establishment/);
  assert.ok(answer.rules.some((r) => r.topic?.id === "intl.permanent-establishment"));
  assertHonest(answer);
});

test("evasion is refused; avoidance is explained with the anti-avoidance rules", () => {
  const evasion = analyse({ ...detectFacts("How can I hide my foreign income so URA does not know?"), direction: "inbound", residence: "UG", taxpayer: "individual", transaction: "services", country: "Kenya", period: "2026/27" });
  assert.equal(evasion.conduct.kind, "evasion");
  assert.match(evasion.shortAnswer, /illegal, and TaxComp will not help/);
  const avoidance = analyse({ ...detectFacts("Can we set up a shell company in Mauritius to reduce our tax?"), direction: "other", residence: "UG", taxpayer: "company" });
  assert.equal(avoidance.conduct.kind, "avoidance");
  assert.match(avoidance.conduct.text, /anti-avoidance rules/);
  assertHonest(avoidance);
});

test("verified records from the knowledge base come first among the sources", () => {
  const facts = { ...detectFacts("I live in Uganda and received dividends from Kenya"), period: "2026/27", regularity: "one-off", foreignTax: "yes" };
  const answer = analyse(facts, [{ id: "intl.foreign-tax-credit", title: "Foreign tax credit (verified)", sourceReference: "Income Tax Act", sourceUrl: "https://ulii.org/en/legislation/", lastReviewed: "2026-11-12T00:00:00Z" }]);
  assert.equal(answer.sources[0].kind, "verified");
  assert.ok(!answer.sources.some((s) => s.kind === "framework" && s.label === "Foreign tax credit method"), "a reviewed note is not listed twice");
  assert.ok(!answer.uncertainty.some((u) => /No reviewed knowledge record/.test(u)));
  assert.ok(analyse(facts).uncertainty.some((u) => /No reviewed knowledge record/.test(u)));
});

test("calculations: every one shows figures, rule, formula, steps and assumptions, and needs a rate source", () => {
  const ftc = intl.calculateForeignTaxCredit({ foreignIncomeUGX: 10_000_000, foreignTaxPaidUGX: 1_500_000, ratePercent: 30, rateSource: "Rate entered for the test" });
  assert.deepEqual([ftc.ugandaTaxUGX, ftc.creditUGX, ftc.ugandaTaxAfterCreditUGX, ftc.unrelievedUGX], [3_000_000, 1_500_000, 1_500_000, 0]);
  const capped = intl.calculateForeignTaxCredit({ foreignIncomeUGX: 10_000_000, foreignTaxPaidUGX: 4_000_000, ratePercent: 30, rateSource: "test" });
  assert.deepEqual([capped.creditUGX, capped.unrelievedUGX], [3_000_000, 1_000_000]);
  assert.throws(() => intl.calculateForeignTaxCredit({ foreignIncomeUGX: 1, foreignTaxPaidUGX: 0, ratePercent: 30, rateSource: "" }), /does not supply rates/);

  const relief = intl.calculateDoubleTaxRelief({ foreignIncomeUGX: 10_000_000, foreignTaxPaidUGX: 1_500_000, ratePercent: 30, rateSource: "test" });
  assert.deepEqual(relief.methods.map((m) => m.totalTaxUGX), [4_500_000, 3_000_000, 1_500_000, 4_050_000]);

  const wht = intl.calculateWithholdingWorking({ paymentUGX: 8_500_000, ratePercent: 15, rateSource: "test", grossUp: 1 });
  assert.equal(Math.round(wht.grossUGX), 10_000_000);
  assert.equal(Math.round(wht.netUGX), 8_500_000);
  const plain = intl.calculateWithholdingWorking({ paymentUGX: 10_000_000, ratePercent: 15, rateSource: "test", grossUp: 0 });
  assert.deepEqual([plain.taxUGX, plain.netUGX], [1_500_000, 8_500_000]);

  const tp = intl.calculateTransferPricingAdjustment({ actualPrice: 80, armsLengthPrice: 100, quantity: 1000, ugandaIsSeller: 1, ratePercent: null, rateSource: "" });
  assert.deepEqual([tp.adjustmentUGX, tp.taxUGX], [20_000, null]);
  assert.equal(intl.calculateTransferPricingAdjustment({ actualPrice: 120, armsLengthPrice: 100, quantity: 10, ugandaIsSeller: 1, ratePercent: null, rateSource: "" }).adjustmentUGX, 0);
  assert.equal(intl.calculateTransferPricingAdjustment({ actualPrice: 120, armsLengthPrice: 100, quantity: 10, ugandaIsSeller: 0, ratePercent: null, rateSource: "" }).adjustmentUGX, 200);
  assert.throws(() => intl.calculateTransferPricingAdjustment({ actualPrice: 80, armsLengthPrice: 100, quantity: 10, ugandaIsSeller: 1, ratePercent: 30, rateSource: "" }), /does not supply rates/);

  const taxable = intl.calculateTaxableIncome({ grossIncomeUGX: 50_000_000, exemptIncomeUGX: 5_000_000, deductionsUGX: 15_000_000, ratePercent: null, rateSource: "" });
  assert.deepEqual([taxable.taxableIncomeUGX, taxable.taxUGX], [30_000_000, null]);
  assert.equal(intl.calculateTaxableIncome({ grossIncomeUGX: 10, exemptIncomeUGX: 0, deductionsUGX: 20, ratePercent: null, rateSource: "" }).taxableIncomeUGX, 0);

  const structures = intl.calculateStructureComparison({ incomeUGX: 100_000_000, optionARatePercent: 30, optionACostsUGX: 0, optionBRatePercent: 20, optionBCostsUGX: 15_000_000, rateSource: "adviser's figures" });
  assert.deepEqual([structures.optionA.netUGX, structures.optionB.netUGX, structures.differenceUGX], [70_000_000, 65_000_000, 5_000_000]);

  for (const result of [ftc, relief, wht, tp, taxable, structures]) {
    const w = result.working;
    assert.ok(w.figures.length && w.rule && w.formula && w.steps.length && w.assumptions.length);
  }
  assert.match(ftc.working.steps[0], /UGX 10,000,000 × 30% = UGX 3,000,000/);
  assert.match(ftc.working.figures[2][1], /source: Rate entered for the test/);
});
