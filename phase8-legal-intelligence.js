"use strict";

const { createLegalSourceRegistry } = require("./legal-source-registry.js");
const { createCaseLawRegistry } = require("./case-law-registry.js");

const legislationTitles = Object.freeze([
  "Income Tax Act (Uganda)",
  "Value Added Tax Act (Uganda)",
  "Tax Procedures Code Act (Uganda)",
  "Excise Duty Act (Uganda)",
  "Stamp Duty Act (Uganda)",
  "Tax Appeals Tribunal Act (Uganda)",
  "East African Community Customs Management Act",
]);

function createPendingLegislationCatalog() {
  return legislationTitles.map((title, index) => ({
    sourceId: `uganda-legislation-catalog-${index + 1}`,
    sourceType: "legislation",
    title,
    issuingAuthority: null,
    legislation: title,
    documentReference: null,
    provision: null,
    publicationDate: null,
    effectiveDate: null,
    endDate: null,
    applicableTaxPeriods: [],
    officialSourceUrl: null,
    verificationStatus: "pending-review",
    lastVerificationDate: null,
    reviewer: null,
    relatedTaxHeads: [],
    ruleIds: [],
    primaryAuthority: true,
    version: "catalog-only",
    historicalVersion: false,
  }));
}

function isIsoDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function createPhase8LegalIntelligence({
  legislation = createPendingLegislationCatalog(),
  guidance = [],
  cases = [],
} = {}) {
  const sourceRegistry = createLegalSourceRegistry([...legislation, ...guidance]);
  const caseRegistry = createCaseLawRegistry(cases);

  function resolveHistoricalPeriod({ taxHead, startDate, endDate } = {}) {
    if (!isIsoDate(startDate) || !isIsoDate(endDate) || startDate > endDate) {
      throw new RangeError("A valid inclusive historical period is required.");
    }

    const sources = sourceRegistry.getAllSources()
      .filter((source) => !taxHead || source.relatedTaxHeads.includes(String(taxHead)))
      .filter((source) => isIsoDate(source.effectiveDate))
      .filter((source) => source.effectiveDate <= endDate &&
        (!isIsoDate(source.endDate) || source.endDate >= startDate))
      .map((source) => ({
        ...source,
        periodStatus: source.verificationStatus === "verified" ? "verified" : "unverified",
      }))
      .sort((left, right) => left.effectiveDate.localeCompare(right.effectiveDate));

    return Object.freeze({
      taxHead: taxHead || null,
      startDate,
      endDate,
      sources,
      amendmentsDuringPeriod: sources.filter((source) =>
        source.effectiveDate > startDate && source.effectiveDate <= endDate),
      resolutionStatus: sources.some((source) => source.verificationStatus === "verified")
        ? "verified-sources-found"
        : "unverified-or-no-sources",
      completeness: "not-established",
      filingApproved: false,
    });
  }

  return Object.freeze({
    sourceRegistry,
    caseRegistry,
    repositoryStatus: Object.freeze({
      legalRepository: "catalog-only",
      guidanceRepository: guidance.length ? "pending-review" : "not-populated",
      caseLawRepository: "review-required",
      requiresHumanVerification: true,
      legalContentIsNotFilingApproved: true,
      completeness: "not-established",
    }),
    findAuthoritativeSources({ taxHead, taxPeriod, date } = {}) {
      return sourceRegistry.resolveSourcesForPeriod({ taxHead, taxPeriod, date })
        .filter((source) => source.primaryAuthority);
    },
    findGuidance({ taxHead, taxPeriod, date } = {}) {
      return sourceRegistry.resolveSourcesForPeriod({ taxHead, taxPeriod, date })
        .filter((source) => !source.primaryAuthority);
    },
    resolveHistoricalPeriod,
    getCasesByTaxHead(taxHead) {
      return caseRegistry.getAllCases()
        .filter((entry) => !taxHead || entry.relatedTaxHeads.includes(String(taxHead)));
    },
  });
}

module.exports = {
  legislationTitles,
  createPendingLegislationCatalog,
  createPhase8LegalIntelligence,
};
