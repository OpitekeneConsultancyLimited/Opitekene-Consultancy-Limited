"use strict";

const { citationIntegrity } = require("./legal-source-registry.js");

const stopWords = new Set([
  "about", "after", "also", "and", "are", "can", "does", "for", "from",
  "how", "into", "its", "may", "the", "their", "this", "under", "what",
  "when", "where", "which", "with", "would", "your", "tax", "taxes", "uganda",
]);
const primarySourceTypes = new Set(["legislation", "regulation", "judicial_decision"]);
const defaultResultLimit = 12;
const maxQuestionLength = 1600;

function termsFrom(text) {
  return [...new Set(String(text || "")
    .toLowerCase()
    .match(/[a-z0-9]+/g)
    ?.filter((term) => term.length > 2 && !stopWords.has(term)) || [])];
}

function sourceText(source) {
  return [
    source.title,
    source.legislation,
    source.provision,
    source.caseReference,
    source.issuingAuthority,
    source.documentReference,
    source.summary,
    source.subject,
    source.issue,
    source.keywords,
    source.relatedTaxHeads,
  ].flat().filter(Boolean).join(" ").toLowerCase();
}

function getRelevanceScore(source, queryTerms, taxHead) {
  const title = String(source.title || "").toLowerCase();
  const legalText = [source.legislation, source.provision, source.caseReference]
    .filter(Boolean).join(" ").toLowerCase();
  const keywords = [source.keywords, source.subject, source.summary, source.documentReference]
    .flat().filter(Boolean).join(" ").toLowerCase();
  const fullText = sourceText(source);
  let score = 0;

  for (const term of queryTerms) {
    if (title.includes(term)) score += 5;
    if (legalText.includes(term)) score += 4;
    if (keywords.includes(term)) score += 2;
    else if (!title.includes(term) && !legalText.includes(term) && fullText.includes(term)) score += 1;
  }

  if (taxHead && (source.relatedTaxHeads || []).includes(String(taxHead))) {
    score += 2;
  }

  return score;
}

function hasCompleteTaxHeadMatch(source, taxHead) {
  return !taxHead || !source.relatedTaxHeads?.length || source.relatedTaxHeads.includes(String(taxHead));
}

function matchesPeriod(source, taxPeriod, date) {
  if (taxPeriod && source.applicableTaxPeriods?.length &&
      !source.applicableTaxPeriods.includes(String(taxPeriod))) {
    return false;
  }

  if (taxPeriod && !source.applicableTaxPeriods?.length) {
    return false;
  }

  if (date) {
    const effectiveDate = new Date(`${source.effectiveDate}T00:00:00Z`);
    const endDate = source.endDate ? new Date(`${source.endDate}T23:59:59Z`) : null;
    const selectedDate = new Date(`${date}T00:00:00Z`);
    if (!Number.isFinite(effectiveDate.getTime()) || !Number.isFinite(selectedDate.getTime()) ||
        effectiveDate > selectedDate || (endDate && endDate < selectedDate)) {
      return false;
    }
  }

  return true;
}

function isOutdated(source, periodMatch) {
  return source.verificationStatus === "withdrawn" ||
    source.verificationStatus === "rejected" ||
    source.verificationStatus === "superseded" ||
    !periodMatch;
}

function citationFor(source) {
  if (!source.provision && !source.caseReference && !source.documentReference) {
    return null;
  }

  return {
    citationId: `legal-source:${source.sourceId}`,
    sourceId: source.sourceId,
    title: source.title || null,
    authorityType: source.sourceType,
    issuingAuthority: source.issuingAuthority || null,
    legislation: source.legislation || null,
    provision: source.provision || null,
    caseReference: source.caseReference || null,
    effectiveFrom: source.effectiveDate || null,
    effectiveTo: source.endDate || null,
    verificationStatus: source.verificationStatus,
    reviewer: source.reviewer || null,
    lastVerificationDate: source.lastVerificationDate || null,
    documentReference: source.documentReference || null,
    officialSourceUrl: source.officialSourceUrl || null,
    primaryAuthority: Boolean(source.primaryAuthority),
    applicableTaxPeriods: [...(source.applicableTaxPeriods || [])],
  };
}

function collectConflicts(sources) {
  const groups = new Map();
  const addPair = (leftId, rightId, groupId) => {
    if (!leftId || !rightId || leftId === rightId) return;
    const sourceIds = [leftId, rightId].sort();
    const key = `${groupId || "linked-conflict"}:${sourceIds.join("|")}`;
    if (!groups.has(key)) {
      groups.set(key, { groupId: groupId || null, sourceIds });
    }
  };

  for (const source of sources) {
    if (source.conflictGroup) {
      const group = sources.filter((candidate) => candidate.conflictGroup === source.conflictGroup);
      for (const candidate of group) {
        addPair(source.sourceId, candidate.sourceId, source.conflictGroup);
      }
    }
    for (const conflictId of source.conflictsWith || []) {
      if (sources.some((candidate) => candidate.sourceId === conflictId)) {
        addPair(source.sourceId, conflictId, source.conflictGroup);
      }
    }
  }

  return [...groups.values()];
}

function createLegalRetrievalEngine({ sourceRegistry } = {}) {
  if (!sourceRegistry || typeof sourceRegistry.getAllSources !== "function") {
    throw new TypeError("A legal source registry is required.");
  }

  function retrieveLegalSources({ question, taxHead, taxPeriod, date, limit = defaultResultLimit } = {}) {
    if (typeof question !== "string" || !question.trim()) {
      throw new TypeError("A non-empty legal research question is required.");
    }
    if (question.trim().length > maxQuestionLength) {
      throw new RangeError(`Legal research questions must not exceed ${maxQuestionLength} characters.`);
    }
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new RangeError("The result limit must be an integer from 1 to 100.");
    }
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new RangeError("The date must use YYYY-MM-DD format.");
    }

    const queryTerms = termsFrom(`${question} ${taxHead || ""}`);
    const allSources = sourceRegistry.getAllSources();
    const candidates = allSources
      .filter((source) => hasCompleteTaxHeadMatch(source, taxHead))
      .map((source) => ({
        source,
        relevanceScore: getRelevanceScore(source, queryTerms, taxHead),
      }))
      .filter(({ relevanceScore }) => relevanceScore > 0);

    const scored = candidates.map(({ source, relevanceScore }) => {
      const periodMatch = matchesPeriod(source, taxPeriod, date);
      const outdated = isOutdated(source, periodMatch);
      const integrity = citationIntegrity(source);
      const incomplete = !integrity.valid;
      const unverified = source.verificationStatus !== "verified";
      const resolved = {
        ...source,
        relevanceScore,
        periodMatch,
        outdated,
        incomplete,
        unverified,
        citationIssues: integrity.issues,
        citation: citationFor(source),
      };
      return resolved;
    });

    const sources = scored
      .filter((source) => source.periodMatch || source.incomplete)
      .sort((left, right) => (
        Number(right.primaryAuthority) - Number(left.primaryAuthority) ||
        Number(right.verificationStatus === "verified") - Number(left.verificationStatus === "verified") ||
        right.relevanceScore - left.relevanceScore ||
        String(right.effectiveDate || "").localeCompare(String(left.effectiveDate || ""))
      ))
      .slice(0, limit);
    const citations = sources
      .filter((source) => source.citation && source.periodMatch && !source.incomplete)
      .map((source) => source.citation);
    const conflicts = collectConflicts(sources);
    const eligiblePrimary = sources.some((source) => (
      source.verificationStatus === "verified" &&
      source.primaryAuthority &&
      primarySourceTypes.has(source.sourceType) &&
      source.periodMatch &&
      !source.outdated &&
      !source.incomplete
    ));
    const diagnostics = {
      conflicts,
      outdatedSourceIds: scored.filter((source) => source.outdated).map((source) => source.sourceId),
      incompleteSourceIds: scored.filter((source) => source.incomplete).map((source) => source.sourceId),
      unverifiedSourceIds: scored.filter((source) => source.unverified).map((source) => source.sourceId),
      outOfPeriodSourceIds: scored.filter((source) => !source.periodMatch).map((source) => source.sourceId),
      matchedSourceCount: sources.length,
    };
    const adequateVerifiedAuthorityAvailable = eligiblePrimary;

    return {
      question: question.trim(),
      taxHead: taxHead || null,
      taxPeriod: taxPeriod || null,
      date: date || null,
      status: adequateVerifiedAuthorityAvailable
        ? "verified-authority-found"
        : "verified-authority-unavailable",
      adequateVerifiedAuthorityAvailable,
      message: adequateVerifiedAuthorityAvailable
        ? "Registered verified primary authority matched the requested period. Review its scope and citation before relying on it."
        : "No adequate verified legal authority is available for this question and period in the registered sources.",
      sources,
      citations,
      diagnostics,
      limitations: [
        "Retrieval identifies candidate sources; it does not determine that a source supports a legal conclusion.",
        "Only explicit conflict metadata is reported as a conflict; differences between sources are not independently interpreted.",
        "An empty result means the registry did not provide a matching source, not that no legal authority exists.",
      ],
    };
  }

  return Object.freeze({ retrieveLegalSources });
}

module.exports = {
  createLegalRetrievalEngine,
  termsFrom,
};
