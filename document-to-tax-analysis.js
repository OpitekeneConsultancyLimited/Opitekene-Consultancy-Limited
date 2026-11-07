"use strict";

const {
  SCHEMA_VERSION,
  assertPlainObject,
  cloneJson,
  requireIsoInstant,
  requireTaxPeriod,
  requireText,
} = require("./phase6-domain.js");

const TaxHead = Object.freeze({
  ValueAddedTax: "value-added-tax",
  Paye: "pay-as-you-earn",
  CorporateIncomeTax: "corporate-income-tax",
  IndividualIncomeTax: "individual-income-tax",
  RentalIncomeTax: "rental-income-tax",
  WithholdingTax: "withholding-tax",
  CapitalGainsTax: "capital-gains-tax",
  CapitalAllowances: "capital-allowances",
  StampDuty: "stamp-duty",
  PresumptiveTax: "presumptive-tax",
  CustomsImportTax: "customs-import-tax",
});

const TransactionStatus = Object.freeze({
  Proposed: "proposed",
  Accepted: "accepted",
  Rejected: "rejected",
  Corrected: "corrected",
});

function createDocumentAnalysisProposal(value, { now = new Date().toISOString() } = {}) {
  assertPlainObject(value, "document analysis proposal");
  if (!Object.values(TaxHead).includes(value.taxHead)) throw new RangeError("Invalid taxHead.");
  if (!Number.isSafeInteger(value.sourcePage) || value.sourcePage < 1) throw new RangeError("sourcePage must be a positive integer.");
  if (typeof value.confidence !== "number" || !Number.isFinite(value.confidence) || value.confidence < 0 || value.confidence > 1) {
    throw new RangeError("confidence must be between 0 and 1.");
  }
  const createdAt = requireIsoInstant(now, "now");
  return {
    schemaVersion: SCHEMA_VERSION,
    proposalId: requireText(value.proposalId, "proposalId", 120),
    practiceId: requireText(value.practiceId, "practiceId", 120),
    clientId: requireText(value.clientId, "clientId", 120),
    documentId: requireText(value.documentId, "documentId", 120),
    taxPeriod: requireTaxPeriod(value.taxPeriod, "taxPeriod", { nullable: true }),
    taxHead: value.taxHead,
    field: requireText(value.field, "field", 120),
    proposedValue: cloneJson(value.proposedValue, "proposedValue"),
    sourcePage: value.sourcePage,
    confidence: value.confidence,
    status: TransactionStatus.Proposed,
    confirmedValue: null,
    createdAt,
    updatedAt: createdAt,
    reviewHistory: [],
  };
}

function reviewDocumentAnalysisProposal(value, { decision, reviewerId, correctedValue } = {}, { now = new Date().toISOString() } = {}) {
  assertPlainObject(value, "document analysis proposal");
  if (value.status !== TransactionStatus.Proposed) throw new RangeError("Only proposed document analysis can be reviewed.");
  const reviewHistory = cloneJson(value.reviewHistory ?? [], "reviewHistory");
  if (!Array.isArray(reviewHistory)) throw new TypeError("reviewHistory must be an array.");
  if (![TransactionStatus.Accepted, TransactionStatus.Rejected, TransactionStatus.Corrected].includes(decision)) {
    throw new RangeError("A valid analysis review decision is required.");
  }
  const reviewer = requireText(reviewerId, "reviewerId", 120);
  if (decision === TransactionStatus.Corrected && correctedValue === undefined) {
    throw new RangeError("correctedValue is required for a corrected decision.");
  }
  const at = requireIsoInstant(now, "now");
  const confirmedValue = decision === TransactionStatus.Accepted
    ? cloneJson(value.proposedValue, "proposedValue")
    : decision === TransactionStatus.Corrected
      ? cloneJson(correctedValue, "correctedValue")
      : null;
  return {
    ...value,
    status: decision,
    confirmedValue,
    updatedAt: at,
    reviewHistory: [...reviewHistory, { at, actorId: reviewer, decision }],
  };
}

module.exports = {
  TaxHead,
  TransactionStatus,
  createDocumentAnalysisProposal,
  reviewDocumentAnalysisProposal,
};
