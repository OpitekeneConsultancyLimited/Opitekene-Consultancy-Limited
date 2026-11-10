(function () {
"use strict";

// TaxComp Intelligence Architecture - triage and routing.
//
// "One platform. Two experiences. Equal intelligence."
// Takes a plain-language description (and optionally the kind of document
// uploaded), decides who is asking (business owner or tax professional), which
// of the seven service centres should handle it, and whether a human
// professional should review it. It never reaches a tax conclusion itself.
//
// The log record it returns contains routing metadata only - never the text.

const classifierModule = typeof module === "object" && module.exports
  ? require("./tax-question-classifier.js")
  : globalThis.taxCompQuestionClassifier;

const SERVICE_CENTRES = Object.freeze({
  computation: Object.freeze({ id: "computation", title: "Tax Computation Centre",
    ownerLabel: "Work out how much tax", proLabel: "Computation workings" }),
  "assessment-dispute": Object.freeze({ id: "assessment-dispute", title: "URA Assessment & Dispute Resolution Centre",
    ownerLabel: "Challenge an assessment", proLabel: "Assessment analysis and objection" }),
  "audit-preparation": Object.freeze({ id: "audit-preparation", title: "Tax Audit Preparation Centre",
    ownerLabel: "Get ready for a URA audit", proLabel: "Audit file and reconciliations" }),
  "health-check": Object.freeze({ id: "health-check", title: "Tax Health Check Centre",
    ownerLabel: "Check my tax health", proLabel: "Exposure review by tax head" }),
  "law-and-case-law": Object.freeze({ id: "law-and-case-law", title: "Ugandan Tax Law & Case Law Centre",
    ownerLabel: "What the law says", proLabel: "Legislation and TAT / court decisions" }),
  advisory: Object.freeze({ id: "advisory", title: "AI Tax Advisory Centre",
    ownerLabel: "Ask a tax question", proLabel: "Structured tax position" }),
  "compliance-monitoring": Object.freeze({ id: "compliance-monitoring", title: "Tax Compliance & Monitoring Centre",
    ownerLabel: "My deadlines and reminders", proLabel: "Obligations and compliance risk" }),
});

// Order matters: the first matching route wins.
const CENTRE_ROUTES = Object.freeze([
  ["assessment-dispute", /\b(?:assess(?:ed|ment)s?|objection|object to|challenge|dispute|appeal|tribunal|tat\b|demand notice|agency notice|ura (?:says|claims|wants)|(?:says|saying|claims|claiming) (?:i|we) owe|owe ura|letter from ura|ura (?:letter|notice)|additional tax|penalt(?:y|ies) (?:and|&) interest)\b/i],
  ["audit-preparation", /\b(?:audit\w*|ura (?:is )?(?:visiting|coming)|desk review|field visit|information request|records request|investigation)\b/i],
  ["health-check", /\b(?:health check|am i compliant|are we compliant|review (?:my|our) tax|tax exposure|tax risk review|clean up (?:my|our) tax|catch up on (?:my|our) (?:tax|returns))\b/i],
  ["law-and-case-law", /\b(?:section \d+|s\.\s?\d+|what does the (?:law|act) say|case law|precedent|tribunal decision|court decision|judgment|v\.? (?:uganda revenue|ura)\b|legislation|amendment act)\b/i],
  ["compliance-monitoring", /\b(?:deadline|due date|when (?:do|should|must) (?:i|we) (?:file|pay)|remind(?:er)?|filing calendar|register for|tin registration|efris|monthly return|annual return)\b/i],
  ["computation", /\b(?:calculate|compute|how much|work out|tax (?:due|payable) on|net pay|take[- ]home)\b/i],
]);

// Wording that suggests a tax practitioner is writing.
const PROFESSIONAL_MARKERS = Object.freeze([
  /\b(?:section|s\.)\s?\d+(?:\(\d+\))?/i,
  /\b(?:ITA|VATA|TPCA|EDA|TAT|ICPAU|chargeable income|input tax credit|output tax|deemed supply|arm'?s[- ]length|thin cap(?:italisation)?|permanent establishment)\b/i,
  /\b(?:application no\.?|misc\.? (?:application|cause)|civil appeal|ratio decidendi|obiter)\b/i,
  /\b(?:my|our) client(?:'s|s)?\b/i,
  /\b(?:computation schedule|tax computation|reconciliation of|deferred tax)\b/i,
]);

// Matters Opitekene policy sends to a human professional regardless of size.
const ESCALATION_TRIGGERS = Object.freeze([
  ["criminal-exposure", /\b(?:fraud|evasion|prosecut\w*|arrest\w*|criminal|police|summons)\b/i],
  ["enforcement-action", /\b(?:agency notice|garnish\w*|distress|seiz\w*|closure|sealed|bank account (?:frozen|blocked)|travel ban)\b/i],
  ["tribunal-or-court", /\b(?:tribunal|tat\b|high court|court of appeal|supreme court|appeal)\b/i],
]);

const DEFAULT_POLICY = Object.freeze({
  // Opitekene review policy, not law: disputes at or above this amount go to a professional.
  escalationAmountUgx: 50000000,
});

function detectAudience(text, selected) {
  if (selected === "business-owner" || selected === "tax-professional") {
    return { audience: selected, basis: "selected", markers: 0 };
  }
  const markers = PROFESSIONAL_MARKERS.filter((pattern) => pattern.test(text)).length;
  if (markers >= 2) return { audience: "tax-professional", basis: "detected", markers };
  return { audience: "business-owner", basis: markers ? "detected" : "default", markers };
}

function routeCentre(text, classification, documentKind) {
  if (documentKind === "ura-assessment" || documentKind === "objection-decision") {
    return { centre: "assessment-dispute", basis: "document" };
  }
  if (documentKind === "audit-notice") return { centre: "audit-preparation", basis: "document" };
  for (const [centre, pattern] of CENTRE_ROUTES) {
    if (pattern.test(text)) return { centre, basis: "wording" };
  }
  if (classification.primaryIntent === "tax-computation") return { centre: "computation", basis: "intent" };
  if (classification.primaryIntent === "compliance-requirements") return { centre: "compliance-monitoring", basis: "intent" };
  if (classification.primaryIntent === "legal-dispute") return { centre: "assessment-dispute", basis: "intent" };
  return { centre: "advisory", basis: "default" };
}

function largestAmountUgx(text) {
  let largest = 0;
  const pattern = /(?:ugx|ush|shs?\.?|sh\.?)\s*([\d][\d,]*(?:\.\d+)?)\s*(m(?:illion)?|bn|billion)?|\b([\d][\d,]*(?:\.\d+)?)\s*(million|billion|m|bn)\b/gi;
  for (const match of text.matchAll(pattern)) {
    const raw = match[1] || match[3];
    const unit = (match[2] || match[4] || "").toLowerCase();
    let value = Number(String(raw).replace(/,/g, ""));
    if (!Number.isFinite(value)) continue;
    if (unit.startsWith("b")) value *= 1e9;
    else if (unit.startsWith("m")) value *= 1e6;
    largest = Math.max(largest, Math.round(value));
  }
  return largest || null;
}

const NEXT_STEPS = Object.freeze({
  "assessment-dispute": {
    "business-owner": [
      "Find the date you actually received the URA notice - the time to object is counted from it.",
      "Upload or type in the notice so TaxComp can list the tax, penalty and interest separately.",
      "Do not ignore the notice: an objection has a strict time limit.",
    ],
    "tax-professional": [
      "Confirm the date of service and the assessment type; compute the objection window from the verified rule.",
      "Extract principal tax, penalties, interest and cited provisions; reconcile to returns filed.",
      "Map each adjustment to a ground and the evidence that supports it; check payment-on-objection requirements.",
    ],
  },
  "audit-preparation": {
    "business-owner": ["List what URA asked for and by when.", "Gather your returns, bank statements, invoices and payroll records for the period."],
    "tax-professional": ["Scope the audit period and tax heads.", "Reconcile returns to ledgers, bank and EFRIS; log documentation gaps."],
  },
  "health-check": {
    "business-owner": ["Tell us which taxes you are registered for.", "We will check filings, payments and records for gaps."],
    "tax-professional": ["Select tax heads and periods.", "Run exposure checks and rank corrective actions."],
  },
  "law-and-case-law": {
    "business-owner": ["We will explain the rule in plain words and link the official text."],
    "tax-professional": ["Resolve the provision as at the relevant date, with amendments and related TAT / court decisions."],
  },
  advisory: {
    "business-owner": ["Describe what happened in your own words; we will ask short follow-up questions."],
    "tax-professional": ["State facts, tax head and period; the advisor returns a structured position with authorities."],
  },
  "compliance-monitoring": {
    "business-owner": ["Add your business details so we can list what you file and when."],
    "tax-professional": ["Load the client's obligations; deadlines are shown with their verification status."],
  },
  computation: {
    "business-owner": ["Enter the amounts and we will show the tax step by step."],
    "tax-professional": ["Use the full calculators for workings, bands and statutory references."],
  },
});

function createTaxCompIntelligence({ policy = {}, now = () => new Date().toISOString(), idFactory } = {}) {
  const settings = { ...DEFAULT_POLICY, ...policy };
  const makeId = idFactory || (() => `triage-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);

  function triage({ text, audience: selectedAudience, documentKind, taxPeriod } = {}) {
    if (typeof text !== "string" || !text.trim()) throw new TypeError("Describe the tax matter in a few words.");
    const cleaned = text.trim().slice(0, 8000);
    const classification = classifierModule.classifyTaxQuestion({ question: cleaned, taxPeriod });
    const audience = detectAudience(cleaned, selectedAudience);
    const route = routeCentre(cleaned, classification, documentKind);

    const escalationReasons = ESCALATION_TRIGGERS.filter(([, pattern]) => pattern.test(cleaned)).map(([reason]) => reason);
    const amount = largestAmountUgx(cleaned);
    if (route.centre === "assessment-dispute" && amount !== null && amount >= settings.escalationAmountUgx) {
      escalationReasons.push("amount-at-or-above-review-threshold");
    }

    const confidence = route.basis === "document" || (route.basis === "wording" && classification.taxHeads.length > 0)
      ? "high"
      : route.basis === "default" ? "low" : "medium";

    const clarifyingQuestions = [];
    if (classification.taxHeads.length === 0) clarifyingQuestions.push("Which tax is this about (for example VAT, PAYE, income tax or withholding tax)?");
    if (!classification.taxPeriod) clarifyingQuestions.push("Which period or financial year does it relate to?");
    if (route.centre === "assessment-dispute") clarifyingQuestions.push("On what date did you receive the URA notice?");

    const centre = SERVICE_CENTRES[route.centre];
    return {
      audience: audience.audience,
      audienceBasis: audience.basis,
      serviceCentre: route.centre,
      serviceCentreTitle: centre.title,
      serviceCentreLabel: audience.audience === "tax-professional" ? centre.proLabel : centre.ownerLabel,
      routingBasis: route.basis,
      primaryIntent: classification.primaryIntent,
      taxHeads: classification.taxHeads.map((head) => head.id),
      taxPeriod: classification.taxPeriod,
      confidence,
      escalationRecommended: escalationReasons.length > 0,
      escalationReasons,
      detectedAmountUgx: amount,
      clarifyingQuestions,
      nextSteps: [...NEXT_STEPS[route.centre][audience.audience]],
      advisoryConclusionProvided: false,
      logRecord: Object.freeze({
        id: makeId(),
        audience: audience.audience,
        audienceBasis: audience.basis,
        serviceCentre: route.centre,
        primaryIntent: classification.primaryIntent,
        taxHeadsJson: JSON.stringify(classification.taxHeads.map((head) => head.id)),
        confidence,
        escalationRecommended: escalationReasons.length > 0 ? 1 : 0,
        createdAt: now(),
      }),
    };
  }

  return Object.freeze({ triage, policy: Object.freeze({ ...settings }) });
}

const intelligenceApi = Object.freeze({
  SERVICE_CENTRES,
  DEFAULT_POLICY,
  createTaxCompIntelligence,
  detectAudience,
  largestAmountUgx,
});

if (typeof module === "object" && module.exports) module.exports = intelligenceApi;
if (typeof globalThis !== "undefined") globalThis.taxCompIntelligence = intelligenceApi;
})();
