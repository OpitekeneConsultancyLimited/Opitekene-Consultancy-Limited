// Unit tests for the pure Challenge an Assessment modules (no I/O).
import test from "node:test";
import assert from "node:assert/strict";
import { addDays } from "./challenge/dates.mts";
import { computeDeadlines, dueDateFor, PROVISIONAL_LABEL, SEED_RULE_SET } from "./challenge/deadlines.mts";
import { resolveLaw } from "./challenge/law.mts";
import { classifyItem, reconcile } from "./challenge/classify.mts";
import { assertSafe, checkBannedPhrases, citedOnly, scrubSentences, UnsafeOutputError } from "./challenge/safety.mts";
import { OUTCOME_OWNER_TEMPLATES, OWNER_QUESTIONS, STANDING_DISCLAIMER } from "./challenge/wording.mts";
import { highestTier, packAccess, reviewGate } from "./challenge/review.mts";
import { MalformedExtractionError, readNoticeText, validateExtraction } from "./challenge/extract.mts";
import { searchCases, tagText } from "./challenge/search.mts";

const TODAY = "2026-11-10";
const input = (over = {}) => ({ today: TODAY, dateServed: null, objectionFiledOn: null, decisionServedOn: null, taxAssessed: null, taxNotInDispute: null, ...over });

// ------------------------------------------------------------------ F2 / DL
test("DL-1: served 40 days ago -> 5 days left, urgent, provisional, rule named", () => {
  const result = computeDeadlines(input({ dateServed: addDays(TODAY, -40) }), SEED_RULE_SET);
  assert.equal(result.objection.daysLeft, 5);
  assert.equal(result.objection.state, "urgent");
  assert.match(result.objection.title, /Urgent: 5 days left to object/);
  assert.equal(result.objection.ruleKey, "objection");
  assert.equal(result.objection.ruleSetVersion, "objections-2026.v1");
  assert.equal(result.provisionalLabel, PROVISIONAL_LABEL);
  assert.equal(result.lateObjection.offered, false);
});

test("DL-2: served 50 days ago -> possibly lapsed, late objection offered, review required", () => {
  const result = computeDeadlines(input({ dateServed: addDays(TODAY, -50) }), SEED_RULE_SET);
  assert.equal(result.objection.state, "possibly_lapsed");
  assert.equal(result.objection.daysLeft, -5);
  assert.equal(result.lateObjection.offered, true);
  assert.equal(result.lateObjection.reviewRequired, true);
});

test("DL-3: unknown service date -> no deadline, asks for the date", () => {
  const result = computeDeadlines(input(), SEED_RULE_SET);
  assert.equal(result.objection.state, "unknown");
  assert.equal(result.objection.dueDate, null);
  assert.equal(result.objection.daysLeft, null);
  assert.equal(result.objection.title, "Deadline unknown: tell us when you received this");
});

test("urgency boundary is 10 days; counting flags are configurable and shown", () => {
  assert.equal(computeDeadlines(input({ dateServed: addDays(TODAY, -35) }), SEED_RULE_SET).objection.state, "urgent");
  assert.equal(computeDeadlines(input({ dateServed: addDays(TODAY, -34) }), SEED_RULE_SET).objection.state, "on_track");
  const rule = SEED_RULE_SET.rules.find((r) => r.ruleKey === "objection");
  assert.equal(dueDateFor(rule, "2026-10-01"), "2026-11-15");
  assert.equal(dueDateFor({ ...rule, excludeTriggerDay: false }, "2026-10-01"), "2026-11-14");
  // 2026-11-14 is a Saturday: next_business_day moves to Monday 16th.
  assert.equal(dueDateFor({ ...rule, excludeTriggerDay: false, weekendHolidayRule: "next_business_day" }, "2026-10-01"), "2026-11-16");
  const banner = computeDeadlines(input({ dateServed: "2026-10-01" }), SEED_RULE_SET).objection;
  assert.ok(banner.assumptions.some((line) => /TODO_VERIFY/.test(line)));
  assert.equal(computeDeadlines(input({ dateServed: "2026-10-01" }), { ...SEED_RULE_SET, approvedForComputation: true }).provisionalLabel, null);
});

test("decision day 90, Tribunal countdown, 30% payment and ADR", () => {
  const filed = computeDeadlines(input({ dateServed: "2026-06-01", objectionFiledOn: "2026-07-01" }), SEED_RULE_SET);
  assert.equal(filed.decision.dueDate, "2026-09-29");
  assert.equal(filed.decision.state, "passed");
  const decided = computeDeadlines(input({ dateServed: "2026-06-01", objectionFiledOn: "2026-07-01", decisionServedOn: "2026-11-01", taxAssessed: 10_000_000, taxNotInDispute: 4_000_000 }), SEED_RULE_SET);
  assert.equal(decided.tatApplication.dueDate, "2026-12-01");
  assert.equal(decided.tatApplication.state, "on_track");
  assert.equal(decided.tatPayment.amount, 4_000_000, "higher of 30% (3,000,000) and tax not in dispute (4,000,000)");
  assert.equal(computeDeadlines(input({ taxAssessed: 10_000_000, taxNotInDispute: 0 }), SEED_RULE_SET).tatPayment.amount, 3_000_000);
  assert.match(decided.adr.description, /never replaces filing on time/);
});

// ------------------------------------------------------------------ LAW-1
const statutes = [
  { id: "ita", title: "Income Tax Act", chapter: "Cap. 338", kind: "principal", parentId: null, billStatus: "in_force", returnedDate: null, assentDate: null, commencementDate: null, appliesFromPeriod: null, sourceUrl: "https://ulii.org/en/legislation/", note: "" },
  { id: "tpca", title: "Tax Procedures Code Act", chapter: "Cap. 343", kind: "principal", parentId: null, billStatus: "in_force", returnedDate: null, assentDate: null, commencementDate: null, appliesFromPeriod: null, sourceUrl: "https://ulii.org/en/legislation/", note: "" },
  { id: "tata", title: "Tax Appeals Tribunal Act", chapter: "Cap. 345", kind: "principal", parentId: null, billStatus: "in_force", returnedDate: null, assentDate: null, commencementDate: null, appliesFromPeriod: null, sourceUrl: "https://ulii.org/en/legislation/", note: "" },
  { id: "ita-amendment-2026", title: "Income Tax (Amendment) Act, 2026", chapter: null, kind: "amendment", parentId: "ita", billStatus: "in_force", returnedDate: "2026-07-14", assentDate: "2026-08-20", commencementDate: "2026-07-01", appliesFromPeriod: "2026-07-01", sourceUrl: "https://ulii.org/en/legislation/", note: "" },
  { id: "ita-amendment-bill-2027", title: "Income Tax (Amendment) Bill, 2027", chapter: null, kind: "amendment", parentId: "ita", billStatus: "bill", returnedDate: null, assentDate: null, commencementDate: null, appliesFromPeriod: "2027-07-01", sourceUrl: null, note: "" },
];
const version = (over) => ({ statuteId: "ita", topic: "expense-deductibility", section: "TODO_VERIFY", heading: "Deductions", textOrSummary: "TODO_VERIFY", textVerified: false, billStatus: "in_force", assentDate: null, commencementDate: null, appliesFromPeriod: null, appliesToPeriod: null, amendedByStatuteId: null, computation: {}, approvedForComputation: false, sourceUrl: "https://ulii.org/en/legislation/", note: "", ...over });
const versions = [
  version({ id: "ita.deductions.pre-2026", appliesToPeriod: "2026-06-30" }),
  version({ id: "ita.deductions.2026", appliesFromPeriod: "2026-07-01", amendedByStatuteId: "ita-amendment-2026" }),
  version({ id: "ita.deductions.2027-bill", appliesFromPeriod: "2027-07-01", amendedByStatuteId: "ita-amendment-bill-2027", billStatus: "bill" }),
];

test("LAW-1: a July 2026 income tax assessment applies the 2026 amendment and explains the 20 August assent", () => {
  const law = resolveLaw({ taxHead: "income_tax", periodStart: "2026-07-01", periodEnd: "2026-07-31" }, statutes, versions);
  assert.deepEqual(law.amendmentsApplied.map((a) => a.id), ["ita-amendment-2026"]);
  assert.deepEqual(law.byTopic["expense-deductibility"].map((c) => c.provisionId), ["ita.deductions.2026"]);
  const note = law.notes.find((n) => /20 August 2026/.test(n.text));
  assert.ok(note, "note about the 20 August assent");
  assert.match(note.text, /applies it from 1 July 2026/);
  assert.match(note.text, /returned by the President on 14 July 2026/);
  assert.ok(note.sourceUrl, "the note carries a citation");
  assert.ok(law.amendmentsNotApplied.some((a) => a.id === "ita-amendment-bill-2027" && /Not law/.test(a.reason)));
});

test("LAW-1 (August 2026) also applies the amendment; June 2026 uses the earlier version", () => {
  const august = resolveLaw({ taxHead: "income_tax", periodStart: "2026-08-01", periodEnd: "2026-08-31" }, statutes, versions);
  assert.deepEqual(august.byTopic["expense-deductibility"].map((c) => c.provisionId), ["ita.deductions.2026"]);
  assert.ok(august.notes.some((n) => /20 August 2026/.test(n.text)));
  const june = resolveLaw({ taxHead: "income_tax", periodStart: "2026-06-01", periodEnd: "2026-06-30" }, statutes, versions);
  assert.deepEqual(june.byTopic["expense-deductibility"].map((c) => c.provisionId), ["ita.deductions.pre-2026"]);
  assert.deepEqual(june.amendmentsApplied, []);
  const straddle = resolveLaw({ taxHead: "income_tax", periodStart: "2026-01-01", periodEnd: "2026-12-31" }, statutes, versions);
  assert.equal(straddle.byTopic["expense-deductibility"].length, 2, "a period across 1 July shows both versions");
});

// ------------------------------------------------------------------ F3/F4
const ctx = { principal: 18_400_000, noticeTerms: {}, interestFormula: null, penalFormula: null };
const item = (over) => ({ id: "i1", position: 0, category: "expense", description: "Disallowed expenses", uraAmount: null, taxpayerAmount: null, facts: {}, documentIds: [], reviewerOutcome: null, keepInObjection: true, ...over });

test("CLS-1: UGX 25M of expenses disallowed with invoices missing -> insufficient_evidence listing the invoices", () => {
  const result = classifyItem(item({ uraAmount: 0, taxpayerAmount: 25_000_000, facts: { hasRecords: false, missingDocuments: ["supplier invoices for the UGX 25,000,000 of expenses"] } }), ctx);
  assert.equal(result.outcome, "insufficient_evidence");
  assert.deepEqual(result.evidenceGap, ["supplier invoices for the UGX 25,000,000 of expenses"]);
  assert.equal(result.ownerText, "This item may be allowable, but you need supplier invoices for the UGX 25,000,000 of expenses to support it.");
  const defaults = classifyItem(item({ uraAmount: 0, taxpayerAmount: 25_000_000, facts: { hasRecords: false } }), ctx);
  assert.deepEqual(defaults.evidenceGap, ["the supplier invoices or receipts", "proof of payment"]);
});

test("CLS-2: arithmetic error in URA's interest -> computational_error with the corrected figure", () => {
  // URA: 2% per month for 4 months on 18,400,000 should be 1,472,000; URA shows 2,208,000.
  const result = classifyItem(item({ category: "interest", description: "Interest", uraAmount: 2_208_000, facts: { uraRatePercentPerMonth: 2, uraMonths: 4 } }), ctx);
  assert.equal(result.outcome, "computational_error");
  assert.equal(result.correctedFigure, 1_472_000);
  assert.equal(result.recomputation.basis, "ura-notice");
  assert.equal(result.recomputation.provisional, true);
  assert.match(result.ownerText, /difference of UGX 736,000/);
  const ok = classifyItem(item({ category: "interest", uraAmount: 1_472_000, facts: { uraRatePercentPerMonth: 2, uraMonths: 4 } }), ctx);
  assert.equal(ok.outcome, "correct");
});

test("penal tax and interest recompute when the principal changes, and an approved formula beats the notice", () => {
  const penal = item({ category: "penal_tax", description: "Penal tax", uraAmount: 3_680_000, facts: { uraPercent: 20 } });
  assert.equal(classifyItem(penal, ctx).outcome, "correct");
  const lower = classifyItem(penal, { ...ctx, principal: 10_000_000 });
  assert.equal(lower.outcome, "computational_error");
  assert.equal(lower.correctedFigure, 2_000_000);
  const approved = { id: "tpca.interest.2026", computation: { kind: "simple-monthly", ratePercentPerMonth: 1 }, approvedForComputation: true };
  const interest = classifyItem(item({ category: "interest", uraAmount: 1_472_000, facts: { uraRatePercentPerMonth: 2, uraMonths: 4 } }), { ...ctx, interestFormula: approved });
  assert.equal(interest.correctedFigure, 736_000);
  assert.equal(interest.recomputation.basis, "approved-law");
  const unapproved = classifyItem(item({ category: "interest", uraAmount: 1_472_000, facts: { uraRatePercentPerMonth: 2, uraMonths: 4 } }), { ...ctx, interestFormula: { ...approved, approvedForComputation: false } });
  assert.equal(unapproved.recomputation.basis, "ura-notice", "an unapproved formula is never used");
});

test("every outcome is reachable, exactly one per item; reviewer override wins", () => {
  const cases = [
    [item({ uraAmount: 5, taxpayerAmount: 5 }), "correct"],
    [item({ uraAmount: 9, taxpayerAmount: 5, facts: { hasRecords: true } }), "computational_error"],
    [item({ uraAmount: 9, taxpayerAmount: 5, facts: { hasRecords: false } }), "insufficient_evidence"],
    [item({ uraAmount: 9, taxpayerAmount: 5, facts: { legalArgument: "Training costs are revenue in nature." } }), "arguable_legal_ground"],
    [item({ category: "procedural", facts: { proceduralConcern: "Notice served on the wrong company" } }), "procedural_issue"],
  ];
  for (const [entry, expected] of cases) assert.equal(classifyItem(entry, ctx).outcome, expected);
  assert.equal(classifyItem(item({ uraAmount: 5, taxpayerAmount: 5, reviewerOutcome: "arguable_legal_ground" }), ctx).outcome, "arguable_legal_ground");
  const rec = reconcile(cases.map(([entry], i) => ({ ...entry, id: `i${i}`, position: i })), ctx);
  assert.equal(rec.items.length, 5);
  assert.equal(rec.grounds.length, 4, "all non-correct items are listed as grounds");
  assert.deepEqual(rec.items.map((i) => i.schedule), ["agreed", "disputed", "unexplained", "disputed", "disputed"]);
});

// ------------------------------------------------------------------ SAFE
test("banned phrases and close variants are blocked; fixed wording passes", () => {
  for (const text of [
    "The assessment is invalid.", "This assessment is clearly void.", "URA's assessment was unlawful", "an invalid assessment",
    "You will win this objection.", "you'll definitely win", "Your objection will succeed", "we are certain to win", "You can't lose.",
    "URA is wrong.", "URA was clearly mistaken", "URA's wrong here", "Success is guaranteed", "a g u a r a n t e e d result", "100% sure",
  ]) assert.equal(checkBannedPhrases(text).ok, false, text);
  for (const text of [...Object.values(OUTCOME_OWNER_TEMPLATES), STANDING_DISCLAIMER, ...Object.values(OWNER_QUESTIONS).flat(),
    "There is an argument that URA applied the law incorrectly.", "URA's figure differs from your records.", "The assessment is dated 15 September 2026."]) {
    assert.equal(checkBannedPhrases(text).ok, true, text);
  }
  assert.throws(() => assertSafe({ a: ["fine", { b: "You will win" }] }), UnsafeOutputError);
  assert.equal(scrubSentences("Good point. URA is wrong. Another point.").text, "Good point. Another point.");
  assert.deepEqual(citedOnly([{ text: "x", citations: [] }, { text: "y", citations: [{ label: "TPCA", sourceUrl: "https://ulii.org/" }] }]).map((s) => s.text), ["y"]);
});

test("owner questions are plain (no tax jargon)", () => {
  const jargon = /\b(?:wholly and exclusively|deductib|chargeable|input tax|output tax|penal tax|ITA|VATA|TPCA|section)\b/i;
  for (const question of Object.values(OWNER_QUESTIONS).flat()) assert.doesNotMatch(question, jargon, question);
  assert.equal(OWNER_QUESTIONS.expense[0], "What was this payment for, and how did it help the business earn money?");
});

// ------------------------------------------------------------------ review
test("review gate: threshold, procedural, lapsed, TAT, unconfirmed fields; sign-off tied to case version", () => {
  const row = { principal: 60_000_000, taxAccepted: 0, preparingTat: false, decisionServedOn: null, status: "active", reviewStatus: "pending", reviewedCaseVersion: null, caseVersion: 3 };
  const deadlines = computeDeadlines(input({ dateServed: addDays(TODAY, -5) }), SEED_RULE_SET);
  const empty = reconcile([], ctx);
  assert.deepEqual(reviewGate(row, deadlines, empty, []).reasons.map((r) => r.code), ["above-threshold"]);
  assert.equal(reviewGate({ ...row, taxAccepted: 20_000_000 }, deadlines, empty, []).required, false, "only the disputed part counts");
  assert.equal(reviewGate({ ...row, principal: 50_000_000 }, deadlines, empty, []).required, false, "above, not at, the threshold");
  const lapsed = computeDeadlines(input({ dateServed: addDays(TODAY, -60) }), SEED_RULE_SET);
  const procedural = reconcile([item({ category: "procedural" })], ctx);
  const weak = [{ fieldName: "principal", extractedValue: "1", confirmedValue: null, confidence: 0.3, source: "ai-claude", status: "unconfirmable" }];
  const codes = reviewGate({ ...row, preparingTat: true }, lapsed, procedural, weak).reasons.map((r) => r.code);
  assert.deepEqual(codes, ["above-threshold", "procedural-issue", "deadline-lapsed", "tat-application", "unconfirmed-field"]);
  assert.equal(reviewGate({ ...row, reviewStatus: "approved", reviewedCaseVersion: 3 }, deadlines, empty, []).signedOff, true);
  assert.equal(reviewGate({ ...row, reviewStatus: "approved", reviewedCaseVersion: 2 }, deadlines, empty, []).signedOff, false);
  assert.equal(reviewGate(row, deadlines, empty, [], 100_000_000).required, false, "threshold is configurable");
});

test("REV-1 (logic): full pack blocked until sign-off even on a paid plan; free plan blocked by plan", () => {
  const blocked = { required: true, reasons: [], status: "pending", signedOff: false };
  assert.deepEqual(packAccess("self-service", blocked).blockedBecause, ["review"]);
  assert.deepEqual(packAccess("self-service", { ...blocked, signedOff: true }).blockedBecause, []);
  assert.deepEqual(packAccess("free", { required: false, reasons: [], status: "not_required", signedOff: false }).blockedBecause, ["plan"]);
  assert.equal(highestTier(["free", "reviewed", "self-service"]), "reviewed");
});

// ------------------------------------------------------------------ F1
const good = () => ({
  tin: { value: "1000123456", confidence: 0.98 }, tax_head: { value: "vat", confidence: 0.95 }, assessment_type: { value: "additional", confidence: 0.9 },
  period_start: { value: "2025-07-01", confidence: 0.9 }, period_end: { value: "2026-06-30", confidence: 0.9 }, date_issued: { value: "2026-09-15", confidence: 0.92 },
  principal: { value: 18400000, confidence: 0.97 }, penal_tax: { value: 3680000, confidence: 0.96 }, interest: { value: 2208000, confidence: 0.96 },
  interest_rate_percent_per_month: { value: 2, confidence: 0.8 }, interest_months: { value: 6, confidence: 0.7 }, penal_tax_percent: { value: null, confidence: 0 },
  ura_reasons: { value: "Input tax claimed without valid invoices.", confidence: 0.8 }, provisions_cited: { value: ["section 22 of the VAT Act"], confidence: 0.8 },
});

test("extraction validator accepts schema output and drops implausible values", () => {
  const result = validateExtraction(good(), "ai-claude");
  const get = (name) => result.fields.find((f) => f.fieldName === name);
  assert.equal(get("principal").value, "18400000");
  assert.equal(get("provisions_cited").value, JSON.stringify(["section 22 of the VAT Act"]));
  const bad = { ...good(), period_end: { value: "31/06/2026", confidence: 0.9 }, tin: { value: "12345", confidence: 0.9 } };
  const dropped = validateExtraction(bad, "ai-claude");
  assert.equal(dropped.fields.find((f) => f.fieldName === "period_end").value, null);
  assert.equal(dropped.fields.find((f) => f.fieldName === "tin").confidence, 0);
  assert.equal(dropped.warnings.length, 2);
});

test("malformed provider output fails cleanly", () => {
  for (const raw of [null, "text", [], { ...good(), principal: { value: "lots", confidence: 1 } }, { ...good(), tax_head: { value: "paye", confidence: 1 } }, (() => { const g = good(); delete g.interest; return g; })()]) {
    assert.throws(() => validateExtraction(raw, "ai-gemini"), MalformedExtractionError);
  }
  assert.throws(() => readNoticeText("too short"), MalformedExtractionError);
});

test("text reader skips rates on the interest line and reads the figures", () => {
  const result = readNoticeText(`UGANDA REVENUE AUTHORITY\nNOTICE OF ADDITIONAL ASSESSMENT - VALUE ADDED TAX\nTIN: 1000123456\nTax period: 01/07/2025 to 30/06/2026\nDate of assessment: 15/09/2026\nPrincipal tax: UGX 18,400,000\nPenal tax at 20%: UGX 3,680,000\nInterest at 2% per month for 6 months: UGX 2,208,000\nTotal amount due: UGX 24,288,000\nReasons: Input tax claimed without valid tax invoices.\n\nIssued under section 22 of the Tax Procedures Code Act.`);
  const get = (name) => result.fields.find((f) => f.fieldName === name)?.value;
  assert.equal(get("interest"), "2208000");
  assert.equal(get("penal_tax"), "3680000");
  assert.equal(get("interest_rate_percent_per_month"), "2");
  assert.equal(get("interest_months"), "6");
  assert.equal(get("penal_tax_percent"), "20");
  assert.equal(get("tax_head"), "vat");
  assert.equal(get("assessment_type"), "additional");
  assert.equal(get("period_start"), "2025-07-01");
  assert.match(get("ura_reasons"), /without valid tax invoices/);
});

// ------------------------------------------------------------------ search
test("tagging and plain-English search rank tagged decisions first", () => {
  assert.deepEqual(tagText("The burden of proof lies on the taxpayer. The expenses were disallowed for lack of evidence and are not deductible."), ["expense-deductibility", "burden-of-proof"]);
  const cases = [
    { id: "a", citation: "TAT Application 1 of 2020", parties: "A v URA", decisionDate: "2020-01-01", issueTags: ["expense-deductibility", "burden-of-proof"], searchTerms: "expenses disallowed evidence", sourceUrl: "https://ulii.org/a" },
    { id: "b", citation: "TAT Application 2 of 2021", parties: "B v URA", decisionDate: "2021-01-01", issueTags: ["input-vat"], searchTerms: "input tax invoices", sourceUrl: "https://ulii.org/b" },
    { id: "c", citation: "TAT Application 3 of 2022", parties: "C v URA", decisionDate: "2022-01-01", issueTags: ["burden-of-proof"], searchTerms: "evidence records", sourceUrl: "https://ulii.org/c" },
  ];
  const results = searchCases(cases, "URA disallowed my expenses for lack of evidence");
  assert.deepEqual(results.map((r) => r.caseLaw.id), ["a", "c"]);
});
