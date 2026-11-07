"use strict";

const {
  SCHEMA_VERSION,
  assertPlainObject,
  cloneJson,
  requireIsoDate,
  requireIsoInstant,
  requireText,
} = require("./phase6-domain.js");

const DEFAULT_VAT_REGISTRATION_STATUS = "not_registered";
const VAT_REGISTRATION_STATUSES = new Set([
  "not_registered",
  "voluntarily_registered",
  "mandatory_registered",
  "cancelled",
]);
const TAXPAYER_TYPES = new Set(["individual", "company"]);
const ACCOUNTING_PERIODS = new Set(["calendar", "fiscal"]);
const FILING_FREQUENCIES = new Set(["monthly", "quarterly", "annually", "semi-annually"]);

function validateFinancialYearEnd(value) {
  if (typeof value !== "string" || !/^\d{2}-\d{2}$/.test(value)) {
    throw new RangeError("financialYearEnd must use MM-DD format.");
  }
  const [month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(2000, month - 1, day));
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new RangeError("financialYearEnd must be a valid calendar date.");
  }
  return value;
}

function createClientTaxProfileRecord(value, { now = new Date().toISOString() } = {}) {
  assertPlainObject(value, "client tax profile");
  const timestamp = requireIsoInstant(now, "now");
  const profile = {
    schemaVersion: SCHEMA_VERSION,
    practiceId: requireText(value.practiceId, "practiceId", 120),
    clientId: requireText(value.clientId, "clientId", 120),
    vatRegistrationStatus: value.vatRegistrationStatus ?? DEFAULT_VAT_REGISTRATION_STATUS,
    vatRegistrationEffectiveDate: value.vatRegistrationEffectiveDate == null
      ? null
      : requireIsoDate(value.vatRegistrationEffectiveDate, "vatRegistrationEffectiveDate"),
    payeObligation: value.payeObligation ?? false,
    whtAgentStatus: value.whtAgentStatus ?? false,
    taxpayerType: value.taxpayerType ?? "individual",
    incomeTaxAccountingPeriod: value.incomeTaxAccountingPeriod ?? "calendar",
    financialYearEnd: validateFinancialYearEnd(value.financialYearEnd ?? "06-30"),
    filingFrequency: value.filingFrequency ?? "monthly",
    taxExemptions: cloneJson(value.taxExemptions ?? [], "taxExemptions"),
    taxClearanceInformation: value.taxClearanceInformation == null
      ? null
      : cloneJson(value.taxClearanceInformation, "taxClearanceInformation"),
    complianceHistory: cloneJson(value.complianceHistory ?? [], "complianceHistory"),
    rentalIncomeTaxApplicable: value.rentalIncomeTaxApplicable ?? false,
    exciseDutyApplicable: value.exciseDutyApplicable ?? false,
    customsObligationsApplicable: value.customsObligationsApplicable ?? false,
    notes: value.notes ?? "",
    createdAt: requireIsoInstant(value.createdAt ?? timestamp, "createdAt"),
    updatedAt: requireIsoInstant(value.updatedAt ?? timestamp, "updatedAt"),
  };

  if (!VAT_REGISTRATION_STATUSES.has(profile.vatRegistrationStatus)) throw new RangeError("Invalid VAT registration status.");
  for (const field of ["payeObligation", "whtAgentStatus", "rentalIncomeTaxApplicable", "exciseDutyApplicable", "customsObligationsApplicable"]) {
    if (typeof profile[field] !== "boolean") throw new TypeError(`${field} must be a boolean.`);
  }
  if (!TAXPAYER_TYPES.has(profile.taxpayerType)) throw new RangeError("Invalid taxpayerType.");
  if (!ACCOUNTING_PERIODS.has(profile.incomeTaxAccountingPeriod)) throw new RangeError("Invalid incomeTaxAccountingPeriod.");
  if (!FILING_FREQUENCIES.has(profile.filingFrequency)) throw new RangeError("Invalid filingFrequency.");
  if (!Array.isArray(profile.taxExemptions) || !Array.isArray(profile.complianceHistory)) {
    throw new TypeError("taxExemptions and complianceHistory must be arrays.");
  }
  if (typeof profile.notes !== "string" || profile.notes.length > 2000) {
    throw new RangeError("notes must be a string of at most 2000 characters.");
  }
  return profile;
}

class ClientTaxProfile {
  constructor(clientId, data = {}, options = {}) {
    assertPlainObject(data, "client tax profile data");
    Object.assign(this, createClientTaxProfileRecord({ ...data, clientId }, options));
  }

  validate() {
    createClientTaxProfileRecord({ ...this });
    return true;
  }
}

module.exports = {
  DEFAULT_VAT_REGISTRATION_STATUS,
  ClientTaxProfile,
  createClientTaxProfileRecord,
};
