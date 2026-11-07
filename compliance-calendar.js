"use strict";

const {
  SCHEMA_VERSION,
  assertPlainObject,
  cloneJson,
  optionalText,
  requireIsoDate,
  requireIsoInstant,
  requireStringArray,
  requireTaxPeriod,
  requireText,
} = require("./phase6-domain.js");

const ComplianceStatus = Object.freeze({
  Upcoming: "upcoming",
  DueSoon: "due-soon",
  Overdue: "overdue",
  Prepared: "prepared",
  Filed: "filed",
  Paid: "paid",
  PartiallyPaid: "partially-paid",
  UnderReview: "under-review",
});

const TaxObligationType = Object.freeze({
  VAT: "vat",
  PAYE: "paye",
  CorporateIncomeTax: "corporate-income-tax",
  IndividualIncomeTax: "individual-income-tax",
  RentalIncomeTax: "rental-income-tax",
  WithholdingTax: "withholding-tax",
  ExciseDuty: "excise-duty",
  CustomsDuty: "customs-duty",
  CapitalGainsTax: "capital-gains-tax",
  CapitalAllowances: "capital-allowances",
  StampDuty: "stamp-duty",
  PresumptiveTax: "presumptive-tax",
});

const filingStatuses = new Set([
  ComplianceStatus.Upcoming,
  ComplianceStatus.DueSoon,
  ComplianceStatus.Overdue,
  ComplianceStatus.Prepared,
  ComplianceStatus.Filed,
  ComplianceStatus.UnderReview,
]);
const paymentStatuses = new Set([
  ComplianceStatus.Upcoming,
  ComplianceStatus.DueSoon,
  ComplianceStatus.Overdue,
  ComplianceStatus.Paid,
  ComplianceStatus.PartiallyPaid,
  ComplianceStatus.UnderReview,
]);

const filingTransitions = Object.freeze({
  [ComplianceStatus.Upcoming]: [ComplianceStatus.DueSoon, ComplianceStatus.Overdue, ComplianceStatus.Prepared, ComplianceStatus.UnderReview],
  [ComplianceStatus.DueSoon]: [ComplianceStatus.Overdue, ComplianceStatus.Prepared, ComplianceStatus.UnderReview],
  [ComplianceStatus.Overdue]: [ComplianceStatus.Prepared, ComplianceStatus.UnderReview],
  [ComplianceStatus.Prepared]: [ComplianceStatus.Overdue, ComplianceStatus.UnderReview, ComplianceStatus.Filed],
  [ComplianceStatus.UnderReview]: [ComplianceStatus.Prepared, ComplianceStatus.Filed],
  [ComplianceStatus.Filed]: [],
});
const paymentTransitions = Object.freeze({
  [ComplianceStatus.Upcoming]: [ComplianceStatus.DueSoon, ComplianceStatus.Overdue, ComplianceStatus.PartiallyPaid, ComplianceStatus.Paid, ComplianceStatus.UnderReview],
  [ComplianceStatus.DueSoon]: [ComplianceStatus.Overdue, ComplianceStatus.PartiallyPaid, ComplianceStatus.Paid, ComplianceStatus.UnderReview],
  [ComplianceStatus.Overdue]: [ComplianceStatus.PartiallyPaid, ComplianceStatus.Paid, ComplianceStatus.UnderReview],
  [ComplianceStatus.PartiallyPaid]: [ComplianceStatus.Overdue, ComplianceStatus.Paid, ComplianceStatus.UnderReview],
  [ComplianceStatus.UnderReview]: [ComplianceStatus.Overdue, ComplianceStatus.PartiallyPaid, ComplianceStatus.Paid],
  [ComplianceStatus.Paid]: [],
});

function timestamp(value, field) {
  const instant = value instanceof Date ? value.toISOString() : value;
  return requireIsoInstant(instant, field);
}

function createCalendarEntryRecord(value, { now = new Date().toISOString() } = {}) {
  assertPlainObject(value, "calendar entry");
  const currentTime = timestamp(now, "now");
  const filingStatus = value.filingStatus ?? ComplianceStatus.Upcoming;
  const paymentStatus = value.paymentStatus ?? ComplianceStatus.Upcoming;
  if (!Object.values(TaxObligationType).includes(value.taxObligationType)) {
    throw new RangeError("Invalid tax obligation type.");
  }
  if (!filingStatuses.has(filingStatus)) throw new RangeError("Invalid filing status.");
  if (!paymentStatuses.has(paymentStatus)) throw new RangeError("Invalid payment status.");
  if (typeof value.outstandingAmount !== "number" || !Number.isFinite(value.outstandingAmount) || value.outstandingAmount < 0) {
    throw new RangeError("outstandingAmount must be a finite non-negative number.");
  }
  if (value.notes != null && (typeof value.notes !== "string" || value.notes.length > 4000)) {
    throw new RangeError("notes must be a string of at most 4000 characters.");
  }
  const statusHistory = cloneJson(value.statusHistory ?? [], "statusHistory");
  if (!Array.isArray(statusHistory)) throw new TypeError("statusHistory must be an array.");

  return {
    schemaVersion: SCHEMA_VERSION,
    obligationId: requireText(value.obligationId, "obligationId", 120),
    practiceId: requireText(value.practiceId, "practiceId", 120),
    clientId: requireText(value.clientId, "clientId", 120),
    taxObligationType: value.taxObligationType,
    taxPeriod: requireTaxPeriod(value.taxPeriod, "taxPeriod", { nullable: true }),
    description: optionalText(value.description, "description", 500) || "",
    filingDeadline: value.filingDeadline == null ? null : requireIsoDate(value.filingDeadline, "filingDeadline"),
    paymentDeadline: value.paymentDeadline == null ? null : requireIsoDate(value.paymentDeadline, "paymentDeadline"),
    filingStatus,
    paymentStatus,
    outstandingAmount: value.outstandingAmount,
    responsibleStaff: optionalText(value.responsibleStaff, "responsibleStaff", 120) || "",
    supportingDocuments: requireStringArray(value.supportingDocuments ?? [], "supportingDocuments"),
    notes: value.notes ?? "",
    deadlineSourceId: value.deadlineSourceId == null ? null : requireText(value.deadlineSourceId, "deadlineSourceId", 120),
    deadlineVerificationStatus: "unverified",
    statusHistory,
    createdAt: timestamp(value.createdAt ?? currentTime, "createdAt"),
    updatedAt: timestamp(value.updatedAt ?? currentTime, "updatedAt"),
  };
}

class CalendarEntry {
  constructor(data = {}, options = {}) {
    Object.assign(this, createCalendarEntryRecord(data, options));
  }

  validate() {
    createCalendarEntryRecord({ ...this });
    return true;
  }

  updateStatuses(filingStatus, paymentStatus, now = new Date().toISOString()) {
    Object.assign(this, transitionComplianceEntry({ ...this }, { filingStatus, paymentStatus }, { now }));
    return this;
  }

  isFilingDeadlineOverdue(asOf = new Date()) {
    return isDeadlineOverdue(this.filingDeadline, asOf);
  }

  isPaymentDeadlineOverdue(asOf = new Date()) {
    return isDeadlineOverdue(this.paymentDeadline, asOf);
  }

  getStatusDisplay() {
    return `Filing: ${this.filingStatus}, Payment: ${this.paymentStatus}`;
  }
}

function isDeadlineOverdue(deadline, asOf) {
  if (!deadline) return false;
  const date = asOf instanceof Date ? asOf.toISOString().slice(0, 10) : requireIsoDate(asOf, "asOf");
  return date > deadline;
}

function transitionComplianceEntry(value, changes, { now = new Date().toISOString(), actorId = null } = {}) {
  const current = createCalendarEntryRecord({ ...value });
  assertPlainObject(changes, "status changes");
  const keys = Object.keys(changes);
  if (!keys.length || keys.some((key) => !["filingStatus", "paymentStatus", "outstandingAmount"].includes(key))) {
    throw new RangeError("Only filingStatus, paymentStatus, and outstandingAmount may be changed here.");
  }
  if (changes.filingStatus !== undefined &&
      !filingTransitions[current.filingStatus].includes(changes.filingStatus)) {
    throw new RangeError(`Invalid filing status transition: ${current.filingStatus} to ${changes.filingStatus}.`);
  }
  if (changes.paymentStatus !== undefined &&
      !paymentTransitions[current.paymentStatus].includes(changes.paymentStatus)) {
    throw new RangeError(`Invalid payment status transition: ${current.paymentStatus} to ${changes.paymentStatus}.`);
  }
  const updatedAt = timestamp(now, "now");
  const next = createCalendarEntryRecord({
    ...current,
    ...changes,
    updatedAt,
    statusHistory: [
      ...current.statusHistory,
      {
        at: updatedAt,
        actorId: actorId == null ? null : requireText(actorId, "actorId", 120),
        filingStatus: changes.filingStatus ?? current.filingStatus,
        paymentStatus: changes.paymentStatus ?? current.paymentStatus,
      },
    ],
  });
  return next;
}

function filterComplianceEntries(entries, filters = {}) {
  if (!Array.isArray(entries)) throw new TypeError("entries must be an array.");
  assertPlainObject(filters, "filters");
  return entries.filter((entry) =>
    (!filters.practiceId || entry.practiceId === filters.practiceId) &&
    (!filters.clientId || entry.clientId === filters.clientId) &&
    (!filters.taxObligationType || entry.taxObligationType === filters.taxObligationType) &&
    (!filters.taxPeriod || entry.taxPeriod === filters.taxPeriod) &&
    (!filters.filingStatus || entry.filingStatus === filters.filingStatus) &&
    (!filters.paymentStatus || entry.paymentStatus === filters.paymentStatus));
}

function getPaidComplianceEntries(entries) {
  return filterComplianceEntries(entries, { paymentStatus: ComplianceStatus.Paid });
}

module.exports = {
  SCHEMA_VERSION,
  ComplianceStatus,
  TaxObligationType,
  CalendarEntry,
  createCalendarEntryRecord,
  transitionComplianceEntry,
  filterComplianceEntries,
  getPaidComplianceEntries,
};
