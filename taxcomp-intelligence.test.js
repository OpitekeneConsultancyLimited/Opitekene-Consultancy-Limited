"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createTaxCompIntelligence, largestAmountUgx, SERVICE_CENTRES } = require("./taxcomp-intelligence.js");

const intelligence = createTaxCompIntelligence({ now: () => "2026-11-10T00:00:00.000Z", idFactory: () => "triage-test" });

test("a business owner's plain words about a URA letter go to the dispute centre", () => {
  const result = intelligence.triage({ text: "URA sent me a letter saying I owe 12 million shillings in VAT for last year. What do I do?" });
  assert.equal(result.serviceCentre, "assessment-dispute");
  assert.equal(result.audience, "business-owner");
  assert.equal(result.serviceCentreLabel, "Challenge an assessment");
  assert.ok(result.taxHeads.includes("value-added-tax"));
  assert.ok(result.clarifyingQuestions.some((question) => /receive the URA notice/.test(question)));
  assert.equal(result.advisoryConclusionProvided, false);
});

test("professional wording is detected and gets the professional experience", () => {
  const result = intelligence.triage({ text: "My client received an additional assessment disallowing input tax credit under section 28 of the VATA for FY 2024/25." });
  assert.equal(result.audience, "tax-professional");
  assert.equal(result.audienceBasis, "detected");
  assert.equal(result.serviceCentre, "assessment-dispute");
  assert.equal(result.serviceCentreLabel, "Assessment analysis and objection");
  assert.equal(result.taxPeriod, "2024/25");
});

test("an explicit audience choice wins over detection", () => {
  const result = intelligence.triage({ text: "Section 22 ITA chargeable income question", audience: "business-owner" });
  assert.equal(result.audience, "business-owner");
  assert.equal(result.audienceBasis, "selected");
});

test("routes to each service centre", () => {
  const cases = [
    ["URA auditors are visiting next week and want our records", "audit-preparation"],
    ["Can you do a health check of our PAYE and VAT?", "health-check"],
    ["Is there a tribunal decision on management fees?", "assessment-dispute"],
    ["What does the law say about rental income for companies?", "law-and-case-law"],
    ["When do I file my monthly return for PAYE?", "compliance-monitoring"],
    ["How much PAYE on a salary of 3,000,000?", "computation"],
    ["I want to start a bakery; which taxes apply to me?", "advisory"],
  ];
  for (const [text, centre] of cases) {
    assert.equal(intelligence.triage({ text }).serviceCentre, centre, text);
  }
  assert.equal(Object.keys(SERVICE_CENTRES).length, 7);
});

test("an uploaded URA assessment routes by document even with vague text", () => {
  const result = intelligence.triage({ text: "please help with this", documentKind: "ura-assessment" });
  assert.equal(result.serviceCentre, "assessment-dispute");
  assert.equal(result.confidence, "high");
});

test("escalates enforcement, criminal exposure and large disputes to a professional", () => {
  assert.deepEqual(intelligence.triage({ text: "URA issued an agency notice on our bank account" }).escalationReasons, ["enforcement-action"]);
  assert.ok(intelligence.triage({ text: "They say it is tax fraud" }).escalationRecommended);
  const large = intelligence.triage({ text: "We are disputing an assessment of UGX 120,000,000" });
  assert.ok(large.escalationReasons.includes("amount-at-or-above-review-threshold"));
  assert.equal(intelligence.triage({ text: "We are disputing an assessment of UGX 2,000,000" }).escalationRecommended, false);
});

test("the log record holds routing metadata only, never the text", () => {
  const text = "Confidential: Acme Ltd owes URA 80 million for VAT";
  const { logRecord } = intelligence.triage({ text });
  assert.deepEqual(Object.keys(logRecord).sort(), ["audience", "audienceBasis", "confidence", "createdAt", "escalationRecommended", "id", "primaryIntent", "serviceCentre", "taxHeadsJson"]);
  assert.ok(!JSON.stringify(logRecord).includes("Acme"));
});

test("reads amounts written the Ugandan way", () => {
  assert.equal(largestAmountUgx("UGX 4,500,000 and Shs 2.5m"), 4500000);
  assert.equal(largestAmountUgx("about 1.2 billion"), 1200000000);
  assert.equal(largestAmountUgx("no amount"), null);
  assert.throws(() => intelligence.triage({ text: "  " }), /Describe/);
});
