"use strict";

const { citationIntegrity } = require("./legal-source-registry.js");

const primarySourceTypes = new Set(["legislation", "regulation", "judicial_decision"]);
const sourceTypes = Object.freeze([
  "legislation",
  "regulation",
  "ura_guidance",
  "judicial_decision",
  "secondary_commentary",
]);

function isIsoDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) &&
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

function periodEnd(taxPeriod) {
  const match = String(taxPeriod || "").match(/^(20\d{2})\/(\d{2})$/);
  if (!match) return null;
  const endYear = Number(`${match[1].slice(0, 2)}${match[2]}`);
  return endYear === Number(match[1]) + 1 ? `${endYear}-06-30` : null;
}

function createTaxAnswerComposer({ legalSourceRegistry, caseLawRegistry, clock = () => new Date() } = {}) {
  if (!legalSourceRegistry || typeof legalSourceRegistry.getSourceById !== "function" ||
      !caseLawRegistry || typeof caseLawRegistry.getCaseById !== "function") {
    throw new TypeError("Legal-source and case-law registries are required.");
  }

  function compose({
    question,
    classification = {},
    clarification = {},
    legalResearch = [],
    caseLaw = [],
    calculation = null,
    computationExplanation = null,
    transactionAnalysis = null,
    transactionExplanation = null,
    transaction = null,
    taxpayer = null,
    assumptions = [],
    claims = [],
    taxPeriod,
  } = {}) {
    if (typeof question !== "string" || !question.trim()) {
      throw new TypeError("A non-empty tax question is required.");
    }
    if (!Array.isArray(legalResearch) || !Array.isArray(caseLaw) || !Array.isArray(claims)) {
      throw new TypeError("Research evidence, case references, and reviewed claims must be arrays.");
    }

    const resolvedPeriod = taxPeriod || classification.taxPeriod || legalResearch.find((item) => item.taxPeriod)?.taxPeriod || null;
    const periodEndDate = periodEnd(resolvedPeriod);
    const evidence = new Map();
    for (const result of legalResearch) {
      for (const candidate of result.sources || []) {
        if (candidate?.sourceId && !evidence.has(candidate.sourceId)) evidence.set(candidate.sourceId, candidate);
      }
    }

    function sourceCitation(sourceId) {
      const registered = legalSourceRegistry.getSourceById(sourceId);
      const candidate = evidence.get(sourceId);
      if (!registered || !candidate || candidate.periodMatch !== true || candidate.outdated || candidate.incomplete) {
        return null;
      }
      const integrity = citationIntegrity(registered);
      if (!integrity.valid) return null;
      return {
        citationId: `legal-source:${registered.sourceId}`,
        sourceId: registered.sourceId,
        title: registered.title,
        authorityType: registered.sourceType,
        issuingAuthority: registered.issuingAuthority,
        legislation: registered.legislation || null,
        provision: registered.provision || null,
        effectiveFrom: registered.effectiveDate,
        effectiveTo: registered.endDate || null,
        verificationStatus: registered.verificationStatus,
        reviewer: registered.reviewer || null,
        lastVerificationDate: registered.lastVerificationDate || null,
        documentReference: registered.documentReference,
        url: registered.officialSourceUrl,
        primaryAuthority: registered.primaryAuthority,
        applicableTaxPeriods: [...(registered.applicableTaxPeriods || [])],
      };
    }

    function caseCitation(caseId) {
      const registered = caseLawRegistry.getCaseById(caseId);
      if (!registered) return null;
      const endDate = periodEndDate;
      const dateKnown = isIsoDate(registered.judgmentDate);
      const postPeriod = Boolean(endDate && dateKnown && registered.judgmentDate > endDate);
      return {
        caseId: registered.caseId,
        caseName: registered.caseName || null,
        citation: registered.citation || null,
        court: registered.court || null,
        jurisdiction: registered.jurisdiction || null,
        judgmentDate: registered.judgmentDate || null,
        authorityClass: registered.authorityClass || "unverified",
        verificationStatus: registered.verificationStatus,
        legalPrinciple: registered.verificationStatus === "verified" ? registered.legalPrinciple : null,
        relevantParagraphs: registered.verificationStatus === "verified" ? [...(registered.relevantParagraphs || [])] : [],
        sourceDocument: registered.sourceDocument ? { ...registered.sourceDocument } : null,
        postPeriod,
      };
    }

    const citations = [...new Set([...evidence.keys()])]
      .map(sourceCitation)
      .filter(Boolean);
    const caseReferences = [...new Set(caseLaw.map((item) => item?.caseId).filter(Boolean))]
      .map(caseCitation)
      .filter(Boolean);
    const supportedClaims = [];
    const rejectedClaims = [];

    for (const claim of claims) {
      const text = typeof claim?.text === "string" ? claim.text.trim() : "";
      const review = claim?.supportReview;
      const sourceIds = Array.isArray(claim?.supportingSourceIds) ? claim.supportingSourceIds : [];
      const caseIds = Array.isArray(claim?.supportingCaseIds) ? claim.supportingCaseIds : [];
      const reviewComplete = review && String(review.reviewer || "").trim() &&
        isIsoDate(review.reviewDate) && String(review.rationale || "").trim();
      const sourceCitations = sourceIds.map(sourceCitation);
      const verifiedPrimarySources = sourceIds.length > 0 && sourceCitations.every((citation) => (
        citation && citation.verificationStatus === "verified" && citation.primaryAuthority &&
        primarySourceTypes.has(citation.authorityType)
      ));
      const caseCitations = caseIds.map(caseCitation);
      const verifiedCases = caseIds.length > 0 && caseCitations.every((citation) => (
        citation && citation.verificationStatus === "verified" &&
        citation.authorityClass !== "unverified" && !citation.postPeriod &&
        citation.jurisdiction === "UG"
      ));
      const hasSupport = sourceIds.length > 0 || caseIds.length > 0;

      if (!text || !reviewComplete || !hasSupport ||
          (sourceIds.length > 0 && !verifiedPrimarySources) ||
          (caseIds.length > 0 && !verifiedCases)) {
        rejectedClaims.push({
          text: text || null,
          reason: !text
            ? "Claim text is missing."
            : !reviewComplete
              ? "A reviewer, review date, and support rationale are required."
              : !hasSupport
                ? "At least one registered legal source or case must support the claim."
                : "Every supporting record must be verified, in-period, and eligible for the claimed Uganda legal authority role.",
        });
        continue;
      }

      const claimCitations = [
        ...sourceCitations,
        ...caseCitations.map((citation) => ({
          citationId: `case-law:${citation.caseId}`,
          sourceId: citation.caseId,
          title: citation.caseName,
          authorityType: "judicial_decision",
          citation: citation.citation,
          court: citation.court,
          jurisdiction: citation.jurisdiction,
          judgmentDate: citation.judgmentDate,
          authorityClass: citation.authorityClass,
          verificationStatus: citation.verificationStatus,
          documentReference: citation.sourceDocument?.documentReference || null,
          url: citation.sourceDocument?.url || null,
        })),
      ];
      supportedClaims.push({
        text,
        citationIds: claimCitations.map((citation) => citation.citationId),
        supportReview: {
          reviewer: review.reviewer,
          reviewDate: review.reviewDate,
          rationale: review.rationale,
        },
      });
    }

    const statutoryProvisions = citations.filter((citation) => ["legislation", "regulation"].includes(citation.authorityType));
    const uraGuidance = citations.filter((citation) => citation.authorityType === "ura_guidance");
    const secondaryCommentary = citations.filter((citation) => citation.authorityType === "secondary_commentary");
    const judicialSources = citations.filter((citation) => citation.authorityType === "judicial_decision");
    const missingInformation = (clarification.missingFacts || []).map((item) => ({
      field: item.field,
      question: item.question,
      why: item.why,
      taxHeads: [...(item.taxHeads || [])],
    }));
    const adequateVerifiedPrimaryAuthority = legalResearch.some((result) => result.adequateVerifiedAuthorityAvailable);
    const verifiedCaseAvailable = caseReferences.some((item) => item.verificationStatus === "verified" && !item.postPeriod);
    const verificationStatus = {
      legalSources: citations.map(({ sourceId, verificationStatus: status }) => ({ sourceId, status })),
      cases: caseReferences.map(({ caseId, verificationStatus: status, authorityClass }) => ({ caseId, status, authorityClass })),
      adequateVerifiedPrimaryAuthority,
      verifiedCaseAvailable,
      claimSupportReviewRequired: true,
      rejectedClaimCount: rejectedClaims.length,
    };

    let directAnswer;
    if (supportedClaims.length > 0) {
      directAnswer = supportedClaims.map((claim) => claim.text).join(" ");
    } else if (missingInformation.length > 0) {
      directAnswer = `I cannot establish a legal conclusion from the available facts. ${missingInformation.length} relevant clarification question${missingInformation.length === 1 ? " remains" : "s remain"}.`;
    } else if (calculation?.status === "completed") {
      directAnswer = "The existing deterministic calculator returned the computation below. This arithmetic output does not establish legal eligibility or filing approval.";
    } else {
      directAnswer = "The registered evidence metadata cannot establish a legal conclusion; source text and its application to the facts require review.";
    }
    if (!adequateVerifiedPrimaryAuthority && supportedClaims.length === 0) {
      directAnswer += " No adequate verified primary authority was available for a substantive legal conclusion.";
    }

    const allCitations = [...citations];
    for (const claim of supportedClaims) {
      for (const citationId of claim.citationIds) {
        if (!allCitations.some((citation) => citation.citationId === citationId)) {
          const caseRecord = caseReferences.find((item) => `case-law:${item.caseId}` === citationId);
          if (caseRecord) {
            allCitations.push({
              citationId,
              sourceId: caseRecord.caseId,
              title: caseRecord.caseName,
              authorityType: "judicial_decision",
              citation: caseRecord.citation,
              court: caseRecord.court,
              jurisdiction: caseRecord.jurisdiction,
              judgmentDate: caseRecord.judgmentDate,
              authorityClass: caseRecord.authorityClass,
              verificationStatus: caseRecord.verificationStatus,
              documentReference: caseRecord.sourceDocument?.documentReference || null,
              url: caseRecord.sourceDocument?.url || null,
            });
          }
        }
      }
    }

    return {
      directAnswer,
      applicableTaxHead: (classification.taxHeads || []).map((head) => typeof head === "string" ? head : head.id).filter(Boolean),
      taxpayerOrTransaction: transaction ? { ...transaction } : taxpayer ? { ...taxpayer } : null,
      taxPeriod: resolvedPeriod,
      legalBasis: {
        statutoryProvisions,
        uraGuidance,
        judicialSources,
        secondaryCommentary,
      },
      statutoryProvisions,
      uraGuidance,
      caseLaw: caseReferences,
      taxTreatment: supportedClaims,
      computation: calculation ? {
        status: calculation.status,
        calculator: calculation.calculator || null,
        source: calculation.source || null,
        result: calculation.result ?? null,
        explanation: computationExplanation ? { ...computationExplanation } : null,
        methodNote: calculation.status === "completed"
          ? "Calculator output is passed through without recalculation; see the underlying calculator result and its rule-status metadata."
          : null,
      } : null,
      transactionAnalysis: transactionExplanation ? { ...transactionExplanation } : null,
      assumptions: [...assumptions],
      missingInformation,
      verificationStatus,
      complianceImplications: "This output is not a filing determination. Confirm applicable forms, deadlines, payment duties, and procedures with the registered authority and the relevant official source; no deadline is inferred here.",
      limitations: [
        "A citation establishes source identity and traceability, not that the source supports a proposition.",
        "Substantive claims are included only with a recorded human support review and verified, in-period primary evidence.",
        "Unverified or incomplete sources are not presented as authority supporting a conclusion.",
        "Calculator output is deterministic arithmetic and does not establish legal eligibility, recoverability, or filing approval.",
      ],
      citations: allCitations,
      rejectedClaims,
      auditTrail: {
        sourceIds: allCitations.filter((citation) => citation.authorityType !== "judicial_decision").map((citation) => citation.sourceId),
        caseIds: caseReferences.map((record) => record.caseId),
        claimCitationIds: supportedClaims.flatMap((claim) => claim.citationIds),
        createdAt: clock().toISOString(),
      },
      citationTypes: sourceTypes,
    };
  }

  return Object.freeze({ compose });
}

module.exports = {
  createTaxAnswerComposer,
  periodEnd,
};
