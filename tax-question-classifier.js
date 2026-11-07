"use strict";

const currentFinancialYear = "2026/27";

const taxHeadRules = [
  { id: "value-added-tax", label: "VAT", pattern: /\b(?:vat|value[ -]added tax)\b/i },
  { id: "paye", label: "PAYE", pattern: /\b(?:paye|pay as you earn)\b/i },
  { id: "corporate-income-tax", label: "Corporate income tax", pattern: /\b(?:corporate(?: and individual)? income tax|company income tax|corporation tax|company tax)\b/i },
  { id: "individual-income-tax", label: "Individual income tax", pattern: /\b(?:individual income tax|personal income tax|income tax for (?:an )?individual)\b/i },
  { id: "rental-income-tax", label: "Rental income tax", pattern: /\b(?:rental income tax|rental tax|rental|rent tax|tax on rent|landlord)\b/i },
  { id: "withholding-tax", label: "Withholding tax", pattern: /\b(?:withholding tax|wht|withheld|withholding)\b/i },
  { id: "capital-gains-tax", label: "Capital gains tax", pattern: /\b(?:capital gains? tax|capital gains?|tax on (?:an )?asset disposal)\b/i },
  { id: "capital-allowances", label: "Capital allowances", pattern: /\b(?:capital allowance|wear[ -]and[ -]tear|tax depreciation|allowances)\b/i },
  { id: "industrial-building-deduction", label: "Industrial building deductions", pattern: /\bindustrial buildings?\b/i },
  { id: "stamp-duty", label: "Stamp duty", pattern: /\bstamp duty\b/i },
  { id: "excise-duty", label: "Excise duty", pattern: /\bexcise(?: duty)?\b/i },
  { id: "customs-import-tax", label: "Customs and import taxes", pattern: /\b(?:customs?|import duty|import taxes?|customs valuation|hs code|tariff classification)\b/i },
  { id: "transfer-pricing", label: "Transfer pricing", pattern: /\btransfer pricing\b/i },
  { id: "international-tax", label: "International taxation", pattern: /\b(?:international tax|cross[ -]border tax|foreign tax|non[ -]resident tax)\b/i },
  { id: "double-taxation-agreement", label: "Double taxation agreements", pattern: /\b(?:double taxation agreement|double tax agreement|tax treaty|treaty relief|dtas?)\b/i },
];

const topicRules = [
  { id: "tax-procedures-and-penalties", pattern: /\b(?:tax procedure|penalt(?:y|ies)|late filing|late payment|interest on tax|tax audit|objection|appeal|assessment notice|filing deadline)\b/i },
  { id: "efris", pattern: /\befris\b/i },
  { id: "tax-exemptions-and-incentives", pattern: /\b(?:exemptions?|incentives?|tax holiday|investment allowance)\b/i },
  { id: "tax-accounting-and-deductibility", pattern: /\b(?:tax accounting|accounting deductions?|deductib(?:le|ility)|business expense|capital or revenue|accounting treatment)\b/i },
];

const headAliases = new Map([
  ["vat", "value-added-tax"],
  ["value added tax", "value-added-tax"],
  ["pay-as-you-earn", "paye"],
  ["pay as you earn", "paye"],
  ["corporate tax", "corporate-income-tax"],
  ["company tax", "corporate-income-tax"],
  ["individual tax", "individual-income-tax"],
  ["personal income tax", "individual-income-tax"],
  ["rental tax", "rental-income-tax"],
  ["wht", "withholding-tax"],
  ["capital gains", "capital-gains-tax"],
  ["capital allowance", "capital-allowances"],
  ["customs", "customs-import-tax"],
  ["import tax", "customs-import-tax"],
  ["dta", "double-taxation-agreement"],
]);

const intentPatterns = [
  ["legal-dispute", /\b(?:dispute|appeal|objection|litigation|court|tribunal|assessment notice|challenge the assessment)\b/i],
  ["tax-planning-scenario", /\b(?:tax planning|tax-efficient|reduce (?:my |our )?tax|structure (?:the |my |our )?(?:transaction|business)|plan(?:ning)? (?:a |for )?(?:transaction|sale|investment))\b/i],
  ["tax-computation", /\b(?:calculate|compute|how much|tax due|tax payable|estimate|work out|reconcile the tax)\b/i],
  ["compliance-requirements", /\b(?:compliance|file|filing|return|deadline|due date|penalt(?:y|ies)|records|withholding agent|register for)\b/i],
  ["specific-transaction", /\b(?:transaction|sale|purchase|payment|lease|invoice|import|export|contract|salary|employee|asset disposal|dividend|service|goods|paid|received)\b/i],
  ["professional-advice-request", /\b(?:professional advice|advise me|what should i do|what do you recommend|should i)\b/i],
];

const intentPriority = [
  "legal-dispute",
  "tax-planning-scenario",
  "tax-computation",
  "compliance-requirements",
  "specific-transaction",
  "historical-tax-treatment",
  "professional-advice-request",
  "general-tax-information",
];

function normalizeFinancialYear(value) {
  if (typeof value !== "string") return null;
  const match = value.match(/(?:FY\s*|financial year\s*)?(20\d{2})\s*[/-]\s*(\d{2}|\d{4})/i);
  if (!match) return null;
  const startYear = Number(match[1]);
  const endYear = Number(match[2].length === 2 ? `${match[1].slice(0, 2)}${match[2]}` : match[2]);
  return endYear === startYear + 1 ? `${startYear}/${String(endYear).slice(-2)}` : null;
}

function financialYearForDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return null;
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return null;
  const year = date.getUTCMonth() >= 6 ? date.getUTCFullYear() : date.getUTCFullYear() - 1;
  return `${year}/${String(year + 1).slice(-2)}`;
}

function normalizeHead(value) {
  const key = String(value || "").trim().toLowerCase().replace(/_/g, "-");
  return headAliases.get(key) || key;
}

function createTaxQuestionClassifier({ currentFinancialYear: configuredYear = currentFinancialYear } = {}) {
  const normalizedCurrentYear = normalizeFinancialYear(configuredYear);
  if (!normalizedCurrentYear || normalizedCurrentYear !== configuredYear.replace(/^FY\s*/i, "")) {
    throw new RangeError("Current financial year must use a consecutive YYYY/YY or YYYY/YYYY format.");
  }

  function classify({ question, taxHead, taxHeads = [], taxPeriod, transactionDate, transaction = null } = {}) {
    if (typeof question !== "string" || !question.trim()) {
      throw new TypeError("A non-empty tax question is required.");
    }
    if (taxHeads !== undefined && !Array.isArray(taxHeads)) {
      throw new TypeError("Structured tax heads must be supplied as an array.");
    }
    if (taxHead !== undefined && typeof taxHead !== "string") {
      throw new TypeError("A structured tax head must be a string.");
    }

    const text = question.trim();
    const searchText = `${text} ${transaction?.description || ""}`;
    const detected = new Map();
    for (const rule of taxHeadRules) {
      if (rule.pattern.test(searchText)) {
        detected.set(rule.id, { id: rule.id, label: rule.label, confidence: "likely", basis: "question-text" });
      }
    }
    if (detected.has("double-taxation-agreement") && !detected.has("international-tax")) {
      detected.set("international-tax", {
        id: "international-tax",
        label: "International taxation",
        confidence: "likely",
        basis: "double-taxation-agreement-context",
      });
    }

    const genericIncomeTax = /\bincome tax\b/i.test(searchText) &&
      !detected.has("corporate-income-tax") && !detected.has("individual-income-tax");
    if (genericIncomeTax) {
      detected.set("individual-income-tax", {
        id: "individual-income-tax",
        label: "Individual income tax",
        confidence: "possible",
        basis: "generic-income-tax-wording",
      });
    }

    const structuredHeads = [taxHead, ...taxHeads].filter(Boolean).map(normalizeHead);
    for (const id of structuredHeads) {
      const rule = taxHeadRules.find((candidate) => candidate.id === id);
      if (rule && !detected.has(id)) {
        detected.set(id, { id, label: rule.label, confidence: "likely", basis: "structured-input" });
      }
    }

    const textPeriod = normalizeFinancialYear(searchText);
    const suppliedPeriod = taxPeriod ? normalizeFinancialYear(taxPeriod) : null;
    if (taxPeriod && !suppliedPeriod) {
      throw new RangeError("Tax period must use a consecutive financial-year format such as 2025/26.");
    }
    const selectedDate = transactionDate || searchText.match(/\b20\d{2}-\d{2}-\d{2}\b/)?.[0] || null;
    const datePeriod = selectedDate ? financialYearForDate(selectedDate) : null;
    if (selectedDate && !datePeriod) {
      throw new RangeError("Transaction date must be a valid ISO date in YYYY-MM-DD format.");
    }
    const resolvedPeriod = suppliedPeriod || textPeriod || datePeriod;
    const taxPeriodSource = suppliedPeriod
      ? "structured-input"
      : textPeriod
        ? "question-text"
        : datePeriod
          ? "transaction-date"
          : null;

    const explicitHistorical = /\b(?:historical|previous|prior|last|past)\s+(?:financial\s+)?year\b|\bhistorically\b/i.test(searchText);
    const isHistoricalPeriod = Boolean(explicitHistorical || (resolvedPeriod && resolvedPeriod !== normalizedCurrentYear));
    const intents = [];
    for (const [intent, pattern] of intentPatterns) {
      if (pattern.test(searchText)) intents.push(intent);
    }
    if (isHistoricalPeriod) intents.push("historical-tax-treatment");
    if (intents.length === 0) intents.push("general-tax-information");

    const topics = [
      ...detected.keys(),
      ...topicRules.filter((rule) => rule.pattern.test(searchText)).map((rule) => rule.id),
    ];
    const isMultiTaxHead = detected.size > 1 || /\bmultiple tax heads?\b/i.test(searchText);
    if (isMultiTaxHead) topics.push("multiple-tax-head-transactions");

    const primaryTaxHead = [...detected.values()].sort((left, right) => {
      const confidenceOrder = { likely: 0, possible: 1 };
      return confidenceOrder[left.confidence] - confidenceOrder[right.confidence];
    })[0] || null;
    const primaryIntent = intentPriority.find((intent) => intents.includes(intent)) || "general-tax-information";

    return {
      question: text,
      taxHeads: [...detected.values()],
      primaryTaxHead,
      topics: [...new Set(topics)],
      intents: intentPriority.filter((intent) => intents.includes(intent)),
      primaryIntent,
      taxPeriod: resolvedPeriod,
      taxPeriodSource,
      isHistoricalPeriod,
      isMultiTaxHead,
      structuredTransactionSupplied: Boolean(transaction),
      unrecognizedTaxHeads: structuredHeads.filter((id) => !taxHeadRules.some((rule) => rule.id === id)),
      classificationOnly: true,
      advisoryConclusionProvided: false,
    };
  }

  return Object.freeze({ classify });
}

const defaultClassifier = createTaxQuestionClassifier();

function classifyTaxQuestion(input) {
  return defaultClassifier.classify(input);
}

const classifierApi = Object.freeze({
  taxHeadRules: Object.freeze(taxHeadRules.map((rule) => Object.freeze({ ...rule }))),
  createTaxQuestionClassifier,
  classifyTaxQuestion,
  normalizeFinancialYear,
  financialYearForDate,
});

if (typeof module === "object" && module.exports) {
  module.exports = classifierApi;
}
if (typeof globalThis !== "undefined") {
  globalThis.taxCompQuestionClassifier = classifierApi;
}
