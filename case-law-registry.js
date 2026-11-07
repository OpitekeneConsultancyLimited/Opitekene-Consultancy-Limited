"use strict";

const legacyCases = require("./tax-advisory.js").taxCases;
const verificationStatuses = Object.freeze([
  "unverified",
  "pending-review",
  "verified",
  "superseded",
  "withdrawn",
]);
const authorityClasses = Object.freeze([
  "binding",
  "persuasive",
  "other-jurisdiction",
  "unverified",
]);

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const nested of Object.values(value)) deepFreeze(nested);
  return value;
}

function stringArray(values) {
  if (!Array.isArray(values)) return [];
  return values.filter(Boolean).map((value) => String(value));
}

function isIsoDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) &&
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

function isValidHttpsUrl(value) {
  try {
    const url = new URL(String(value));
    return url.protocol === "https:" && Boolean(url.hostname);
  } catch {
    return false;
  }
}

function caseRecordGaps(record) {
  const gaps = [];
  if (!record || typeof record !== "object") return ["case record"];

  for (const [field, label] of [
    ["caseName", "case name"],
    ["citation", "case citation"],
    ["court", "court"],
    ["jurisdiction", "jurisdiction"],
    ["decision", "decision"],
    ["legalReasoning", "legal reasoning"],
    ["legalPrinciple", "legal principle"],
  ]) {
    if (!String(record[field] || "").trim()) gaps.push(label);
  }
  if (!isIsoDate(record.judgmentDate)) gaps.push("ISO judgment date");
  if (!Array.isArray(record.relatedTaxHeads) || record.relatedTaxHeads.length === 0) gaps.push("relevant tax head");
  if (!Array.isArray(record.legalIssues) || record.legalIssues.length === 0) gaps.push("legal issues");
  if (!Array.isArray(record.materialFacts) || record.materialFacts.length === 0) gaps.push("material facts");
  if (!Array.isArray(record.relevantParagraphs) || record.relevantParagraphs.length === 0) gaps.push("relevant paragraphs");
  if (!Array.isArray(record.linkedLegislationSourceIds)) gaps.push("reviewed legislation links");
  if (!Array.isArray(record.linkedRuleIds)) gaps.push("rule links");
  if (!Array.isArray(record.linkedAdvisoryIds)) gaps.push("advisory links");
  if (!record.sourceDocument || !String(record.sourceDocument.title || "").trim()) gaps.push("source document title");
  if (!record.sourceDocument || !isValidHttpsUrl(record.sourceDocument.url)) gaps.push("HTTPS source document URL");
  if (!record.sourceDocument || !String(record.sourceDocument.documentReference || "").trim()) gaps.push("source document reference");
  if (!String(record.reviewer || "").trim()) gaps.push("reviewer");
  if (!isIsoDate(record.reviewDate)) gaps.push("review date");

  return gaps;
}

function normalizeCaseRecord(record) {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    throw new RangeError("A case-law record is required.");
  }
  if (!record.caseId || !String(record.caseId).trim()) {
    throw new RangeError("A caseId is required.");
  }
  if (!verificationStatuses.includes(record.verificationStatus)) {
    throw new RangeError(`Case verification status must be one of: ${verificationStatuses.join(", ")}.`);
  }

  const normalized = {
    ...record,
    relatedTaxHeads: stringArray(record.relatedTaxHeads),
    legalIssues: stringArray(record.legalIssues),
    materialFacts: stringArray(record.materialFacts),
    relevantParagraphs: stringArray(record.relevantParagraphs),
    linkedLegislationSourceIds: stringArray(record.linkedLegislationSourceIds),
    linkedRuleIds: stringArray(record.linkedRuleIds),
    linkedAdvisoryIds: stringArray(record.linkedAdvisoryIds),
    sourceDocument: record.sourceDocument ? { ...record.sourceDocument } : null,
    verificationStatus: record.verificationStatus,
  };

  if (normalized.sourceDocument?.url && !isValidHttpsUrl(normalized.sourceDocument.url)) {
    throw new RangeError("Case source document URLs must be valid HTTPS URLs.");
  }

  if (record.verificationStatus === "verified") {
    const gaps = caseRecordGaps(normalized);
    if (gaps.length > 0) {
      throw new RangeError(`Case ${record.caseId} cannot be verified; missing ${gaps.join(", ")}.`);
    }
    if (!authorityClasses.includes(record.authorityClass) || record.authorityClass === "unverified") {
      throw new RangeError("A verified case must be classified as binding, persuasive, or other-jurisdiction.");
    }
    if (record.jurisdiction !== "UG" && record.authorityClass !== "other-jurisdiction") {
      throw new RangeError("Verified decisions outside Uganda must use the other-jurisdiction classification.");
    }
    if (record.jurisdiction === "UG" && record.authorityClass === "other-jurisdiction") {
      throw new RangeError("Ugandan decisions must be classified as binding or persuasive after legal review.");
    }
  } else if (record.authorityClass !== undefined && record.authorityClass !== "unverified") {
    throw new RangeError("Unverified case records cannot claim binding, persuasive, or other-jurisdiction authority status.");
  }

  if (!normalized.caseName && !normalized.citation) {
    throw new RangeError("An unverified case record needs a case name or citation for identification.");
  }

  return deepFreeze(clone(normalized));
}

function createLegacyCaseRecords() {
  return legacyCases.map((item) => ({
    caseId: item.id,
    caseName: item.name,
    citation: item.citation,
    court: item.court,
    jurisdiction: /uganda/i.test(item.court) ? "UG" : null,
    judgmentDate: item.date || null,
    relatedTaxHeads: /vat/i.test(item.topic) ? ["value-added-tax"] : [],
    legalIssues: item.issue ? [item.issue] : [],
    materialFacts: [],
    decision: null,
    legalReasoning: null,
    relevantParagraphs: [],
    legalPrinciple: null,
    linkedLegislationSourceIds: [],
    linkedRuleIds: [],
    linkedAdvisoryIds: [],
    sourceDocument: {
      title: `${item.name} case record`,
      url: item.sourceUrl,
      documentReference: item.citation,
    },
    verificationStatus: "unverified",
    authorityClass: "unverified",
    reviewer: null,
    reviewDate: null,
    importedFrom: "tax-advisory.js",
  }));
}

function caseTerms(text) {
  return [...new Set(String(text || "").toLowerCase().match(/[a-z0-9]+/g) || [])]
    .filter((term) => term.length > 2 && !["and", "the", "for", "with", "from", "tax"].includes(term));
}

function scoreCase(record, terms) {
  const searchable = [
    record.caseName,
    record.citation,
    record.court,
    record.jurisdiction,
    record.relatedTaxHeads,
    record.legalIssues,
    record.materialFacts,
    record.decision,
    record.legalReasoning,
    record.legalPrinciple,
    record.relevantParagraphs,
  ].flat().filter(Boolean).join(" ").toLowerCase();
  return terms.reduce((score, term) => score + (searchable.includes(term) ? 1 : 0), 0);
}

function createCaseLawRegistry(initialCases = createLegacyCaseRecords()) {
  const cases = new Map();

  function registerCase(record) {
    const normalized = normalizeCaseRecord(record);
    if (cases.has(normalized.caseId)) {
      throw new RangeError(`A case with id ${normalized.caseId} is already registered.`);
    }
    cases.set(normalized.caseId, normalized);
    return clone(normalized);
  }

  for (const record of initialCases) registerCase(record);

  function getCaseById(caseId) {
    return cases.has(caseId) ? clone(cases.get(caseId)) : null;
  }

  function getAllCases() {
    return [...cases.values()].map((record) => clone(record));
  }

  function verifyCase(caseId, review) {
    const current = cases.get(caseId);
    if (!current || !review || typeof review !== "object") {
      throw new RangeError("An existing case and complete review record are required.");
    }
    if (current.verificationStatus !== "unverified" && current.verificationStatus !== "pending-review") {
      throw new RangeError("Only unverified or pending-review cases can be verified.");
    }

    const verified = normalizeCaseRecord({
      ...current,
      ...review,
      caseId,
      verificationStatus: "verified",
    });
    cases.set(caseId, verified);
    return clone(verified);
  }

  function searchCases({ question, taxHead, jurisdiction, authorityClass, limit = 12 } = {}) {
    if (typeof question !== "string" || !question.trim()) {
      throw new TypeError("A non-empty case-law question is required.");
    }
    if (question.trim().length > 1600) {
      throw new RangeError("Case-law questions must not exceed 1600 characters.");
    }
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new RangeError("The result limit must be an integer from 1 to 100.");
    }
    if (authorityClass && !authorityClasses.includes(authorityClass)) {
      throw new RangeError("Unsupported case authority classification.");
    }

    const terms = caseTerms(question);
    return [...cases.values()]
      .filter((record) => !taxHead || record.relatedTaxHeads.includes(String(taxHead)))
      .filter((record) => !jurisdiction || record.jurisdiction === jurisdiction)
      .filter((record) => !authorityClass || record.authorityClass === authorityClass)
      .map((record) => ({ record, score: scoreCase(record, terms) }))
      .filter(({ score }) => score > 0)
      .sort((left, right) => (
        Number(right.record.verificationStatus === "verified") - Number(left.record.verificationStatus === "verified") ||
        Number(right.record.authorityClass === "binding") - Number(left.record.authorityClass === "binding") ||
        right.score - left.score ||
        String(right.record.judgmentDate || "").localeCompare(String(left.record.judgmentDate || ""))
      ))
      .slice(0, limit)
      .map(({ record, score }) => ({ ...clone(record), relevanceScore: score }));
  }

  return Object.freeze({
    verificationStatuses,
    authorityClasses,
    registerCase,
    verifyCase,
    getCaseById,
    getAllCases,
    searchCases,
    caseRecordGaps,
  });
}

module.exports = {
  createCaseLawRegistry,
  caseRecordGaps,
  authorityClasses,
  verificationStatuses,
};
