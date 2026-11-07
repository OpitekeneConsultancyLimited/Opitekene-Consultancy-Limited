"use strict";

const { validateSourceRecord } = require("./legal-source-registry.js");

const editableFields = new Set([
  "sourceType",
  "title",
  "issuingAuthority",
  "legislation",
  "caseReference",
  "provision",
  "publicationDate",
  "effectiveDate",
  "endDate",
  "applicableTaxPeriods",
  "officialSourceUrl",
  "documentReference",
  "relatedTaxHeads",
  "ruleIds",
  "primaryAuthority",
  "version",
  "keywords",
  "summary",
  "subject",
]);

function isDate(value, today) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value && value <= today;
}

function normalizeActor(value) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 120) {
    throw new RangeError("A named administrator or reviewer is required.");
  }
  return value.trim();
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createDraftSource(record, { submittedBy, clock = () => new Date() } = {}) {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    throw new TypeError("A source record object is required.");
  }
  const actor = normalizeActor(submittedBy);
  const submittedAt = clock().toISOString();
  const pending = validateSourceRecord({
    ...record,
    verificationStatus: "pending-review",
    reviewer: null,
    reviewDate: null,
    lastVerificationDate: null,
    verifiedOn: null,
    reviewHistory: [],
  });
  pending.submittedBy = actor;
  pending.submittedAt = submittedAt;
  pending.reviewHistory = [{
    action: "submitted",
    actor,
    date: submittedAt.slice(0, 10),
    notes: "Submitted for independent source review.",
  }];
  return {
    record: pending,
    auditEntry: { action: "submitted", sourceId: pending.sourceId, actor, createdAt: submittedAt },
  };
}

function updateDraftSource(record, changes, { updatedBy, clock = () => new Date() } = {}) {
  if (!record || record.verificationStatus !== "pending-review") {
    throw new RangeError("Only pending-review source records can be edited.");
  }
  if (!changes || typeof changes !== "object" || Array.isArray(changes)) {
    throw new TypeError("Source draft changes must be an object.");
  }
  const actor = normalizeActor(updatedBy);
  const allowedChanges = Object.fromEntries(Object.entries(changes).filter(([field]) => editableFields.has(field)));
  const updatedAt = clock().toISOString();
  const updated = validateSourceRecord({
    ...record,
    ...allowedChanges,
    sourceId: record.sourceId,
    verificationStatus: "pending-review",
    reviewer: null,
    reviewDate: null,
    lastVerificationDate: null,
    verifiedOn: null,
  });
  updated.submittedBy = record.submittedBy;
  updated.submittedAt = record.submittedAt;
  updated.updatedAt = updatedAt;
  updated.reviewHistory = [
    ...(record.reviewHistory || []),
    { action: "updated-draft", actor, date: updatedAt.slice(0, 10), notes: "Draft metadata updated." },
  ];
  return updated;
}

function reviewLegalSource(record, decision, { clock = () => new Date() } = {}) {
  if (!record || record.verificationStatus !== "pending-review") {
    throw new RangeError("Only pending-review source records can be reviewed.");
  }
  if (!decision || typeof decision !== "object" || Array.isArray(decision)) {
    throw new TypeError("A source review decision is required.");
  }
  const reviewer = normalizeActor(decision.reviewer);
  const today = clock().toISOString().slice(0, 10);
  if (!isDate(decision.reviewDate, today) || typeof decision.notes !== "string" || !decision.notes.trim()) {
    throw new RangeError("A valid non-future review date and written review notes are required.");
  }
  if (!["verified", "rejected"].includes(decision.decision)) {
    throw new RangeError("Review decision must be verified or rejected.");
  }

  const action = decision.decision;
  const review = {
    action,
    actor: reviewer,
    date: decision.reviewDate,
    notes: decision.notes.trim().slice(0, 2000),
  };
  let next;
  if (action === "verified") {
    const changes = decision.updates && typeof decision.updates === "object" && !Array.isArray(decision.updates)
      ? Object.fromEntries(Object.entries(decision.updates).filter(([field]) => editableFields.has(field)))
      : {};
    next = validateSourceRecord({
      ...record,
      ...changes,
      sourceId: record.sourceId,
      verificationStatus: "verified",
      reviewer,
      reviewDate: decision.reviewDate,
      lastVerificationDate: decision.reviewDate,
    });
  } else {
    next = validateSourceRecord({
      ...record,
      verificationStatus: "rejected",
      reviewer,
      reviewDate: decision.reviewDate,
      rejectionReason: decision.notes.trim().slice(0, 2000),
    });
  }
  next.submittedBy = record.submittedBy;
  next.submittedAt = record.submittedAt;
  next.reviewHistory = [...(record.reviewHistory || []), review];

  return {
    record: next,
    auditEntry: { ...review, sourceId: record.sourceId, createdAt: clock().toISOString() },
  };
}

module.exports = {
  createDraftSource,
  updateDraftSource,
  reviewLegalSource,
};
