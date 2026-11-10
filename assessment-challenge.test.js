"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const challenge = require("./assessment-challenge.js");
const { createLawRegister, SEED_TIME_LIMITS } = require("./law-register.js");

const NOTICE = `UGANDA REVENUE AUTHORITY
NOTICE OF ADDITIONAL ASSESSMENT - VALUE ADDED TAX
Assessment No: VAT/ADD/2026/00417
TIN: 1000123456
Tax period: July 2024 - June 2025
Date of assessment: 15/09/2026
Principal tax: UGX 18,400,000
Penalty: UGX 3,680,000
Interest: UGX 2,208,000
Total amount due: UGX 24,288,000
Input tax claimed was disallowed under section 28 of the Value Added Tax Act.
This assessment is issued under section 22 of the Tax Procedures Code Act.`;

test("extracts the notice facts, each needing confirmation", () => {
  const { facts, warnings, extractionOnly } = challenge.extractAssessmentFacts(NOTICE);
  assert.equal(extractionOnly, true);
  assert.equal(facts.noticeReference.value, "VAT/ADD/2026/00417");
  assert.equal(facts.tin.value, "1000123456");
  assert.equal(facts.assessmentKind, "additional");
  assert.equal(facts.noticeDate.value, "2026-09-15");
  assert.equal(facts.serviceDate, null, "the issue date is never assumed to be the service date");
  assert.equal(facts.principalTax.value, 18400000);
  assert.equal(facts.penalty.value, 3680000);
  assert.equal(facts.interest.value, 2208000);
  assert.equal(facts.total.value, 24288000);
  assert.ok(facts.taxHeads.includes("value-added-tax"));
  assert.deepEqual(facts.citedProvisions.map((item) => item.provisionKey), ["vata:s28", "tpca:s22"]);
  assert.ok(facts.principalTax.requiresConfirmation);
  assert.ok(warnings.some((warning) => /Enter the date you actually received it/.test(warning)));
  assert.ok(!warnings.some((warning) => /does not equal/.test(warning)), "the components add up");
});

test("flags totals that do not add up", () => {
  const { warnings } = challenge.extractAssessmentFacts(NOTICE.replace("24,288,000", "25,000,000"));
  assert.ok(warnings.some((warning) => /does not equal the total/.test(warning)));
});

test("parses the date styles used on notices", () => {
  assert.equal(challenge.parseNoticeDate("15/09/2026"), "2026-09-15");
  assert.equal(challenge.parseNoticeDate("3rd March 2026"), "2026-03-03");
  assert.equal(challenge.parseNoticeDate("2026-02-30"), null);
  assert.equal(challenge.parseNoticeDate("31/02/2026"), null);
});

test("deadline is provisional, prefers the service date and reports urgency", () => {
  const fromService = challenge.computeChallengeDeadlines({ serviceDate: "2026-10-01", serviceDateConfirmed: true, noticeDate: "2026-09-15", today: "2026-11-10" });
  assert.equal(fromService.objection.dueDate, "2026-11-15");
  assert.equal(fromService.objection.provisional, true);
  assert.equal(fromService.urgency, "critical");

  const fromNotice = challenge.computeChallengeDeadlines({ noticeDate: "2026-09-15", today: "2026-11-10" });
  assert.equal(fromNotice.urgency, "overdue");
  assert.match(fromNotice.warnings[0], /Counted from the notice date/);
  assert.ok(fromNotice.warnings.some((warning) => /extension/.test(warning)));

  assert.equal(challenge.computeChallengeDeadlines({}).urgency, "unknown");
});

test("a verified register rule removes the provisional flag", () => {
  const register = createLawRegister({ timeLimits: [{ ...SEED_TIME_LIMITS[0], verificationStatus: "verified" }] });
  const result = challenge.computeChallengeDeadlines({ serviceDate: "2026-10-01", serviceDateConfirmed: true, today: "2026-10-02" }, register);
  assert.equal(result.objection.provisional, false);
  assert.equal(result.urgency, "open");
});

test("grounds are rated on evidence and never promise an outcome", () => {
  const grounds = challenge.evaluateGrounds({
    "input-vat-denied": { applies: true, hasDocuments: true, documentsMatchClaim: true },
    "arithmetic-error": { applies: true, hasDocuments: true },
    "expenses-disallowed": { applies: true, explanation: "We paid suppliers in cash" },
    "time-limit-on-assessment": { applies: true },
    "procedural-defect": { applies: false },
  });
  assert.deepEqual(grounds.map((ground) => [ground.groundId, ground.strength]), [
    ["arithmetic-error", "arguable"],
    ["expenses-disallowed", "needs-evidence"],
    ["input-vat-denied", "supported"],
    ["time-limit-on-assessment", "weak"],
  ]);
  assert.match(grounds.find((ground) => ground.groundId === "time-limit-on-assessment").caution, /must be verified/);
  for (const ground of grounds) assert.match(ground.note, /not the likely outcome/);
});

test("evidence checklist combines base, tax-head and ground items without duplicates", () => {
  const grounds = challenge.evaluateGrounds({ "input-vat-denied": { applies: true } });
  const list = challenge.buildEvidenceChecklist({ taxHeads: ["value-added-tax"], grounds });
  assert.ok(list.some((item) => /Proof of the date you received the notice/.test(item.requirement)));
  assert.ok(list.some((item) => /EFRIS sales and purchase listings/.test(item.requirement)));
  assert.ok(list.some((item) => /EFRIS e-invoices/.test(item.requirement)));
  assert.equal(new Set(list.map((item) => item.requirement)).size, list.length);
});

test("risk combines urgency, amount, enforcement and evidence", () => {
  assert.equal(challenge.classifyRisk({ totalAmount: 1000000, urgency: "open", grounds: [{ strength: "supported" }] }).level, "low");
  const critical = challenge.classifyRisk({ totalAmount: 80000000, urgency: "critical", grounds: [] });
  assert.equal(critical.level, "critical");
  assert.equal(critical.escalateToProfessional, true);
  assert.equal(challenge.classifyRisk({ totalAmount: 0, urgency: "open", grounds: [{ strength: "supported" }], enforcementStarted: true }).escalateToProfessional, true);
});

test("draft objection is marked DRAFT, needs review and leaves placeholders for unknowns", () => {
  const grounds = challenge.evaluateGrounds({ "input-vat-denied": { applies: true, hasDocuments: true, documentsMatchClaim: true } });
  const draft = challenge.draftObjection({ taxpayerName: "Example Traders Ltd", tin: "1000123456", noticeReference: "VAT/ADD/2026/00417",
    noticeDate: "2026-09-15", taxHeadLabel: "VAT", taxPeriod: "2024/25", principalTax: 18400000, penalty: 3680000, interest: 2208000, grounds });
  assert.match(draft.bodyMarkdown, /^DRAFT - NOT FOR SUBMISSION/);
  assert.match(draft.bodyMarkdown, /\[CONFIRM DATE OF SERVICE\]/);
  assert.match(draft.bodyMarkdown, /\[CONFIRM the objection provision/);
  assert.match(draft.bodyMarkdown, /Principal tax: UGX 18,400,000/);
  assert.match(draft.bodyMarkdown, /Amount in dispute: \[CONFIRM AMOUNT\]/);
  assert.equal(draft.requiresProfessionalReview, true);
  assert.ok(draft.placeholders >= 5);
});

test("workflow cannot mark an objection lodged without an approved draft", () => {
  assert.equal(challenge.nextStage("intake", "extraction-review"), "extraction-review");
  assert.throws(() => challenge.nextStage("intake", "objection-lodged"), /Cannot move/);
  assert.throws(() => challenge.nextStage("professional-review", "objection-lodged"), /approved the draft/);
  assert.equal(challenge.nextStage("professional-review", "objection-lodged", { draftApproved: true }), "objection-lodged");
  assert.throws(() => challenge.nextStage("closed", "intake"), /Cannot move/);
  assert.throws(() => challenge.extractAssessmentFacts("short"), /Paste or upload/);
});
