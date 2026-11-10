(function () {
"use strict";

// URA Assessment & Dispute Resolution Centre - "Challenge an Assessment".
//
// Pipeline (each step's output is reviewed by the user before the next):
//   1. extractAssessmentFacts  - read a notice's text; every field carries the
//                                snippet it came from and needs confirmation
//   2. computeChallengeDeadlines - objection window from the law register;
//                                provisional unless the rule is verified
//   3. evaluateGrounds          - structured questions -> candidate grounds,
//                                rated on evidence only (never "will win")
//   4. buildEvidenceChecklist   - what to collect, per tax head and ground
//   5. classifyRisk             - urgency + exposure + evidence -> risk level
//   6. draftObjection           - letter with [CONFIRM ...] placeholders;
//                                always needs professional review before use
//   7. nextStage                - the workflow state machine

const isNode = typeof module === "object" && module.exports;
const lawRegisterModule = isNode ? require("./law-register.js") : globalThis.taxCompLawRegister;
const classifierModule = isNode ? require("./tax-question-classifier.js") : globalThis.taxCompQuestionClassifier;

const MONTHS = Object.freeze({ jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 });

const ACT_KEYS = Object.freeze([
  [/tax procedures? code(?: act)?|\btpca\b/i, "tpca"],
  [/income tax(?: act)?|\bita\b/i, "ita"],
  [/value added tax(?: act)?|\bvat act\b|\bvata\b/i, "vata"],
  [/excise duty(?: act)?|\beda\b/i, "eda"],
  [/tax appeals tribunals?(?: act)?|\btata\b/i, "tata"],
  [/stamp duty(?: act)?/i, "sda"],
]);

function toIsoDate(day, month, year) {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date.toISOString().slice(0, 10);
}

/** Parse one date string written the way Ugandan notices write them (day first). */
function parseNoticeDate(raw) {
  const text = String(raw || "").trim();
  let match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) return toIsoDate(Number(match[3]), Number(match[2]), Number(match[1]));
  match = text.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (match) return toIsoDate(Number(match[1]), Number(match[2]), Number(match[3]));
  match = text.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})$/);
  if (match) {
    const month = MONTHS[match[2].slice(0, 4).toLowerCase()] || MONTHS[match[2].slice(0, 3).toLowerCase()];
    return month ? toIsoDate(Number(match[1]), month, Number(match[3])) : null;
  }
  return null;
}

const DATE_TOKEN = String.raw`(\d{4}-\d{2}-\d{2}|\d{1,2}[/.-]\d{1,2}[/.-]\d{4}|\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]{3,9}\.?,?\s+\d{4})`;
const AMOUNT_TOKEN = String.raw`(?:ugx|ush|shs?\.?)?\s*([\d]{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)`;

function snippetAround(text, index, length) {
  const start = Math.max(0, index - 30);
  return text.slice(start, Math.min(text.length, index + length + 30)).replace(/\s+/g, " ").trim();
}

function findLabelledDate(text, labels) {
  const pattern = new RegExp(String.raw`(?:${labels})\s*[:\-]?\s*(?:on\s+)?${DATE_TOKEN}`, "i");
  const match = text.match(pattern);
  if (!match) return null;
  const value = parseNoticeDate(match[1]);
  return value ? { value, snippet: snippetAround(text, match.index, match[0].length), confidence: "medium", requiresConfirmation: true } : null;
}

function findLabelledAmount(text, labels) {
  const pattern = new RegExp(String.raw`(?:${labels})[^\n\d]{0,40}?${AMOUNT_TOKEN}`, "i");
  const match = text.match(pattern);
  if (!match) return null;
  const value = Math.round(Number(match[1].replace(/,/g, "")));
  if (!Number.isFinite(value)) return null;
  return { value, snippet: snippetAround(text, match.index, match[0].length), confidence: "medium", requiresConfirmation: true };
}

function extractCitedProvisions(text) {
  const found = new Map();
  const pattern = /\b(?:section|sec\.|s\.)\s?(\d+[A-Z]?)((?:\(\w+\))*)\s*(?:of\s+the\s+)?([A-Z][A-Za-z ]{2,60}?(?:Act|Code)|ITA|VATA|TPCA|EDA)?/g;
  for (const match of text.matchAll(pattern)) {
    const act = match[3] ? ACT_KEYS.find(([actPattern]) => actPattern.test(match[3]))?.[1] : null;
    const key = `${act || "unknown"}:s${match[1]}${match[2] || ""}`;
    if (!found.has(key)) {
      found.set(key, { provisionKey: key, actResolved: Boolean(act), snippet: snippetAround(text, match.index, match[0].length), requiresConfirmation: true });
    }
  }
  return [...found.values()];
}

/** Step 1. Read the notice text. Nothing extracted is treated as true until the user confirms it. */
function extractAssessmentFacts(noticeText) {
  if (typeof noticeText !== "string" || noticeText.trim().length < 20) {
    throw new TypeError("Paste or upload the text of the URA notice (at least a few lines).");
  }
  const text = noticeText.slice(0, 100000);
  const reference = text.match(/\b(?:assessment|notice|ref(?:erence)?)\s*(?:no\.?|number|#)\s*[:\-]?\s*([A-Z0-9][A-Z0-9/-]{3,40})/i);
  const tin = text.match(/\bTIN\s*[:\-]?\s*(\d{10})\b/i);
  const period = text.match(/\b(?:tax period|period|year of income|for the (?:year|period) ended?)\s*[:\-]?\s*([A-Za-z0-9 ,/-]{4,40}?)(?:\n|\.|;|$)/i);
  const heads = classifierModule.classifyTaxQuestion({ question: text.slice(0, 4000) }).taxHeads.map((head) => head.id);
  const kind = /\bdefault assessment\b/i.test(text) ? "default"
    : /\badditional assessment\b/i.test(text) ? "additional"
      : /\bamended assessment\b/i.test(text) ? "amended"
        : /\bestimated assessment\b/i.test(text) ? "estimated"
          : /\bjeopardy assessment\b/i.test(text) ? "jeopardy" : "unknown";

  const facts = {
    noticeReference: reference ? { value: reference[1], snippet: snippetAround(text, reference.index, reference[0].length), confidence: "medium", requiresConfirmation: true } : null,
    tin: tin ? { value: tin[1], confidence: "high", requiresConfirmation: true } : null,
    taxHeads: heads,
    taxPeriod: period ? { value: period[1].trim(), confidence: "low", requiresConfirmation: true } : null,
    assessmentKind: kind,
    noticeDate: findLabelledDate(text, "date of (?:assessment|notice|issue)|assessment date|notice date|issued on|dated"),
    // Only an explicit statement of service counts; the issue date is not the service date.
    serviceDate: findLabelledDate(text, "date of service|served on|received on|date received"),
    principalTax: findLabelledAmount(text, "principal tax|tax assessed|tax payable|assessed tax|tax due"),
    penalty: findLabelledAmount(text, "penalt(?:y|ies)"),
    interest: findLabelledAmount(text, "interest"),
    total: findLabelledAmount(text, "total (?:amount )?(?:due|payable)|total"),
    citedProvisions: extractCitedProvisions(text),
  };

  const warnings = ["Check every extracted value against the notice. Nothing here is used until you confirm it."];
  if (!facts.serviceDate) warnings.push("The notice does not show when it was served on you. Enter the date you actually received it.");
  const parts = [facts.principalTax, facts.penalty, facts.interest].filter(Boolean);
  if (facts.total && parts.length === 3) {
    const sum = parts.reduce((acc, part) => acc + part.value, 0);
    if (sum !== facts.total.value) warnings.push(`Tax + penalty + interest (${sum.toLocaleString("en-UG")}) does not equal the total shown (${facts.total.value.toLocaleString("en-UG")}). Check for other charges or an arithmetic error - an arithmetic error can itself be a ground of objection.`);
  }
  if (facts.citedProvisions.some((item) => !item.actResolved)) warnings.push("Some cited sections do not name their Act. Confirm which Act each refers to.");
  return { facts, warnings, extractionOnly: true };
}

/** Step 2. Objection window from the register. Prefers a user-confirmed service date. */
function computeChallengeDeadlines({ serviceDate, serviceDateConfirmed = false, noticeDate, today }, register) {
  const lawRegister = register || lawRegisterModule.createLawRegister({ timeLimits: lawRegisterModule.SEED_TIME_LIMITS });
  const trigger = serviceDate || noticeDate;
  if (!trigger) {
    return { objection: null, urgency: "unknown",
      warnings: ["Enter the date you received the notice so the objection deadline can be worked out."] };
  }
  const objection = lawRegister.computeTimeLimit("objection-to-assessment", trigger, { today });
  const warnings = [...objection.warnings];
  if (!serviceDate) warnings.unshift("Counted from the notice date because no service date was given. The real deadline runs from the date you received the notice.");
  else if (!serviceDateConfirmed) warnings.unshift("Confirm the service date: it was read from the notice, not entered by you.");

  const remaining = objection.daysRemaining;
  const urgency = remaining === null ? "unknown"
    : remaining < 0 ? "overdue"
      : remaining <= 7 ? "critical"
        : remaining <= 14 ? "urgent" : "open";
  if (urgency === "overdue") {
    warnings.push("The provisional objection period appears to have passed. Ask a professional about applying to the Commissioner for an extension, with reasons for the delay, without further delay.");
  }
  return { objection, urgency, warnings };
}

// Step 3. Grounds. Each is a candidate for review; strength reflects evidence only.
const GROUND_LIBRARY = Object.freeze([
  { id: "arithmetic-error", title: "Arithmetic or computation error in the assessment",
    question: "Do the figures in the assessment add up, and do they match your returns and records?", evidence: ["Filed returns for the period", "Your own reconciliation of the assessed figures"] },
  { id: "income-misclassified", title: "Amounts treated as taxable income that are not income (loans, capital, transfers, already-taxed receipts)",
    question: "Did URA treat bank deposits or other receipts as sales or income?", evidence: ["Bank statements with an explanation of each disputed deposit", "Loan agreements, capital injection records, inter-account transfer records"] },
  { id: "expenses-disallowed", title: "Business expenses disallowed although incurred in producing income and supported",
    question: "Did URA disallow expenses you can document?", evidence: ["Invoices and receipts for the disallowed expenses", "Proof of payment and of business purpose"] },
  { id: "input-vat-denied", title: "Input VAT credit denied although supported by valid tax invoices",
    question: "Did URA deny input VAT on purchases?", evidence: ["EFRIS e-invoices / fiscal receipts for the purchases", "Proof of payment and supplier VAT registration at the time"] },
  { id: "wht-credit-ignored", title: "Withholding tax already deducted not credited",
    question: "Was withholding tax deducted from your payments but not credited against the assessment?", evidence: ["Withholding tax certificates / payment registration slips", "Customer statements showing deductions"] },
  { id: "estimate-without-basis", title: "Estimated assessment without a reasonable basis",
    question: "Was the assessment estimated rather than based on your records?", evidence: ["Complete books of account for the period", "Explanation of how URA's estimate departs from actual records"] },
  { id: "time-limit-on-assessment", title: "Assessment issued outside the period the law allows",
    question: "Does the assessment relate to a period several years old?", evidence: ["Dates of the returns filed for the period", "Any URA correspondence alleging fraud or wilful neglect"],
    caution: "The limitation period and its exceptions must be verified in the current Tax Procedures Code Act before this ground is relied on." },
  { id: "penalty-interest-error", title: "Penalty or interest wrongly imposed or wrongly computed",
    question: "Are the penalty or interest amounts based on the wrong amount, rate or period?", evidence: ["Payment receipts and dates", "Your recalculation of penalty and interest using the verified rates"] },
  { id: "procedural-defect", title: "Procedural defect (no reasons given, wrong taxpayer, improper service)",
    question: "Does the notice lack reasons, name the wrong taxpayer or reach you improperly?", evidence: ["The notice and envelope / email showing how and when it was served", "Correspondence requesting reasons"] },
]);

function evaluateGrounds(answers = {}) {
  return GROUND_LIBRARY
    .filter((ground) => answers[ground.id] && answers[ground.id].applies)
    .map((ground) => {
      const answer = answers[ground.id];
      const strength = answer.hasDocuments && answer.documentsMatchClaim ? "supported"
        : answer.hasDocuments ? "arguable"
          : answer.explanation ? "needs-evidence" : "weak";
      return {
        groundId: ground.id,
        title: ground.title,
        strength,
        evidenceNeeded: [...ground.evidence],
        caution: ground.caution || null,
        note: "Strength reflects the evidence you have described, not the likely outcome. URA or the Tribunal may decide differently.",
      };
    });
}

// Step 4. Evidence checklist.
const BASE_EVIDENCE = Object.freeze([
  "The full assessment notice and any schedules or working papers attached",
  "Proof of the date you received the notice (email, envelope, delivery book or portal timestamp)",
  "All returns filed for the period, with acknowledgement receipts",
  "Payment registration slips and receipts for tax already paid",
  "Correspondence with URA about this period (audit findings, management letters, replies)",
]);
const HEAD_EVIDENCE = Object.freeze({
  "value-added-tax": ["VAT returns and EFRIS sales and purchase listings for each month", "Reconciliation of VAT returns to the general ledger and bank"],
  paye: ["Payroll registers and employment contracts", "PAYE returns and payment receipts for each month"],
  "withholding-tax": ["Withholding tax returns, certificates issued and received"],
  "corporate-income-tax": ["Audited financial statements and the tax computation filed", "Fixed asset register and capital allowance schedule"],
  "individual-income-tax": ["Income records, bank statements and the return filed"],
  "rental-income-tax": ["Tenancy agreements and rent received schedule"],
  "excise-duty": ["Excise returns, production / import records and stock reconciliations"],
});

function buildEvidenceChecklist({ taxHeads = [], grounds = [] } = {}) {
  const items = new Map();
  for (const requirement of BASE_EVIDENCE) items.set(requirement, { requirement, reason: "Every objection", status: "needed" });
  for (const head of taxHeads) {
    for (const requirement of HEAD_EVIDENCE[head] || []) items.set(requirement, { requirement, reason: `Tax head: ${head}`, status: "needed" });
  }
  for (const ground of grounds) {
    for (const requirement of ground.evidenceNeeded || []) items.set(requirement, { requirement, reason: `Ground: ${ground.title}`, status: "needed" });
  }
  return [...items.values()];
}

// Step 5. Risk.
function classifyRisk({ totalAmount = 0, urgency = "unknown", grounds = [], escalationThresholdUgx = 50000000, enforcementStarted = false } = {}) {
  const reasons = [];
  let score = 0;
  if (urgency === "overdue") { score += 3; reasons.push("The provisional objection period appears to have passed."); }
  else if (urgency === "critical") { score += 2; reasons.push("Seven days or fewer remain in the provisional objection period."); }
  else if (urgency === "urgent") { score += 1; reasons.push("Fourteen days or fewer remain."); }
  else if (urgency === "unknown") { score += 1; reasons.push("The service date is not yet known."); }
  if (totalAmount >= escalationThresholdUgx) { score += 2; reasons.push("The amount is at or above the professional-review threshold."); }
  else if (totalAmount >= escalationThresholdUgx / 5) { score += 1; reasons.push("The amount is significant."); }
  if (enforcementStarted) { score += 3; reasons.push("URA has started enforcement (for example an agency notice)."); }
  const supported = grounds.filter((ground) => ground.strength === "supported").length;
  if (grounds.length === 0) { score += 1; reasons.push("No grounds identified yet."); }
  else if (supported === 0) { score += 1; reasons.push("No ground is fully supported by documents yet."); }

  const level = score >= 5 ? "critical" : score >= 3 ? "high" : score >= 2 ? "medium" : "low";
  const escalate = level === "critical" || level === "high" || totalAmount >= escalationThresholdUgx || enforcementStarted;
  return { level, score, reasons, escalateToProfessional: escalate };
}

// Step 6. Draft objection (never final).
function draftObjection({ taxpayerName, tin, noticeReference, noticeDate, serviceDate, taxHeadLabel, taxPeriod,
  principalTax, penalty, interest, disputedAmount, grounds = [], objectionProvisionLabel } = {}) {
  const confirm = (value, label) => (value === undefined || value === null || value === "" ? `[CONFIRM ${label}]` : String(value));
  const money = (value) => (Number.isFinite(value) ? `UGX ${Math.round(value).toLocaleString("en-UG")}` : "[CONFIRM AMOUNT]");
  const provision = objectionProvisionLabel || "[CONFIRM the objection provision of the Tax Procedures Code Act, as amended]";
  const groundLines = grounds.length
    ? grounds.map((ground, index) => `${index + 1}. ${ground.title}.\n   Facts and evidence: [DESCRIBE the facts and list the attached documents].`).join("\n")
    : "1. [STATE each ground of objection with its facts and supporting documents]";

  const body = [
    "DRAFT - NOT FOR SUBMISSION UNTIL REVIEWED BY A QUALIFIED TAX PROFESSIONAL",
    "",
    "The Commissioner General",
    "Uganda Revenue Authority",
    "[CONFIRM address or the URA portal objection channel]",
    "",
    `Date: [DATE OF LODGEMENT]`,
    "",
    `RE: NOTICE OF OBJECTION TO ${confirm(taxHeadLabel, "TAX HEAD").toUpperCase()} ASSESSMENT ${confirm(noticeReference, "ASSESSMENT NUMBER")}`,
    "",
    `Taxpayer: ${confirm(taxpayerName, "TAXPAYER NAME")}    TIN: ${confirm(tin, "TIN")}`,
    `Tax period: ${confirm(taxPeriod, "TAX PERIOD")}`,
    `Assessment dated ${confirm(noticeDate, "NOTICE DATE")}, received on ${confirm(serviceDate, "DATE OF SERVICE")}.`,
    "",
    `Pursuant to ${provision}, we object to the above assessment.`,
    "",
    "Amounts assessed:",
    `- Principal tax: ${money(principalTax)}`,
    `- Penalty: ${money(penalty)}`,
    `- Interest: ${money(interest)}`,
    `- Amount in dispute: ${money(disputedAmount)}`,
    "",
    "Grounds of objection:",
    groundLines,
    "",
    "We request that the assessment be [withdrawn / amended to UGX ...] and that penalty and interest be adjusted accordingly.",
    "[CONFIRM whether any payment is required on lodging this objection, and attach proof of payment where applicable.]",
    "",
    "Attached: [LIST supporting documents].",
    "",
    "Yours faithfully,",
    "[NAME, TITLE, SIGNATURE]",
  ].join("\n");

  return { draftKind: "objection-letter", bodyMarkdown: body, reviewStatus: "draft", requiresProfessionalReview: true,
    placeholders: (body.match(/\[(?:CONFIRM|DESCRIBE|STATE|LIST|DATE|NAME)[^\]]*\]/g) || []).length };
}

// Step 7. Workflow.
const STAGE_TRANSITIONS = Object.freeze({
  intake: ["extraction-review", "abandoned"],
  "extraction-review": ["grounds-review", "intake", "abandoned"],
  "grounds-review": ["evidence-gathering", "settled", "abandoned"],
  "evidence-gathering": ["drafting", "grounds-review", "abandoned"],
  drafting: ["professional-review", "evidence-gathering", "abandoned"],
  "professional-review": ["objection-lodged", "drafting", "abandoned"],
  "objection-lodged": ["awaiting-decision"],
  "awaiting-decision": ["decision-received", "settled"],
  "decision-received": ["tribunal-application", "settled", "closed"],
  "tribunal-application": ["settled", "closed"],
  settled: ["closed"],
  closed: [],
  abandoned: [],
});

function nextStage(current, requested, { draftApproved = false } = {}) {
  const allowed = STAGE_TRANSITIONS[current];
  if (!allowed) throw new RangeError(`Unknown stage: ${current}.`);
  if (!allowed.includes(requested)) throw new RangeError(`Cannot move from ${current} to ${requested}.`);
  if (requested === "objection-lodged" && !draftApproved) {
    throw new RangeError("An objection can be marked lodged only after a professional has approved the draft.");
  }
  return requested;
}

const assessmentChallengeApi = Object.freeze({
  GROUND_LIBRARY,
  STAGE_TRANSITIONS,
  parseNoticeDate,
  extractAssessmentFacts,
  computeChallengeDeadlines,
  evaluateGrounds,
  buildEvidenceChecklist,
  classifyRisk,
  draftObjection,
  nextStage,
});

if (isNode) module.exports = assessmentChallengeApi;
if (typeof globalThis !== "undefined") globalThis.taxCompAssessmentChallenge = assessmentChallengeApi;
})();
