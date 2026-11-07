"use strict";

// Client model for Opitekene TaxComp 2.0
// Supports: SMEs, companies, NGOs, individual taxpayers, accountants, auditors,
// tax consultants, finance professionals, tax advisory practices.

const DEFAULT_CLIENT_STATUS = "active";
const DEFAULT_TAXPAYER_CATEGORY = "individual";

// Client entity types
const EntityType = {
  Individual: "individual",
  Company: "company",
  Partnership: "partnership",
  NGO: "ngo",
  Trust: "trust",
  Other: "other",
};

// Taxpayer categories
const TaxpayerCategory = {
  Individual: "individual",
  Company: "company",
  NGO: "ngo",
  SME: "sme",
  Other: "other",
};

// Validate client entity type
function isValidEntityType(type) {
  return Object.values(EntityType).includes(type);
}

// Validate taxpayer category
function isValidTaxpayerCategory(category) {
  return Object.values(TaxpayerCategory).includes(category);
}

const { SCHEMA_VERSION, assertPlainObject, requireText, optionalText, requireIsoInstant } = require("./phase6-domain");

const ClientStatus = Object.freeze({
  Active: "active",
  Archived: "archived",
});

function validateClientRecord(value) {
  assertPlainObject(value, "client");
  if (value.schemaVersion !== SCHEMA_VERSION) {
    throw new RangeError(`Client schemaVersion must be ${SCHEMA_VERSION}.`);
  }
  const clientId = requireText(value.clientId, "clientId", 120);
  const practiceId = requireText(value.practiceId, "practiceId", 120);
  const legalBusinessName = requireText(value.legalBusinessName, "legalBusinessName", 200);
  const tin = optionalText(value.tin, "tin", 40);
  const registrationNumber = optionalText(value.registrationNumber, "registrationNumber", 80);
  const entityType = value.entityType || EntityType.Individual;
  const taxpayerCategory = value.taxpayerCategory || DEFAULT_TAXPAYER_CATEGORY;
  const status = value.status || ClientStatus.Active;

  if (!isValidEntityType(entityType)) throw new RangeError("Invalid client entityType.");
  if (!isValidTaxpayerCategory(taxpayerCategory)) throw new RangeError("Invalid client taxpayerCategory.");
  if (!Object.values(ClientStatus).includes(status)) throw new RangeError("Invalid client status.");

  const createdAt = requireIsoInstant(value.createdAt, "createdAt");
  const updatedAt = requireIsoInstant(value.updatedAt, "updatedAt");
  const archivedAt = value.archivedAt == null
    ? null
    : requireIsoInstant(value.archivedAt, "archivedAt");
  if ((status === ClientStatus.Archived) !== (archivedAt !== null)) {
    throw new RangeError("Archived clients require archivedAt; active clients must not have it.");
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    clientId,
    practiceId,
    legalBusinessName,
    tin,
    registrationNumber,
    entityType,
    taxpayerCategory,
    status,
    createdAt,
    updatedAt,
    archivedAt,
  };
}

function createClientRecord(value, { now = new Date().toISOString() } = {}) {
  assertPlainObject(value, "client");
  const timestamp = requireIsoInstant(now, "now");
  return validateClientRecord({
    schemaVersion: SCHEMA_VERSION,
    ...value,
    status: value.status || ClientStatus.Active,
    createdAt: value.createdAt || timestamp,
    updatedAt: value.updatedAt || timestamp,
    archivedAt: value.archivedAt || null,
  });
}

module.exports = {
  SCHEMA_VERSION,
  DEFAULT_CLIENT_STATUS,
  DEFAULT_TAXPAYER_CATEGORY,
  EntityType,
  TaxpayerCategory,
  ClientStatus,
  isValidEntityType,
  isValidTaxpayerCategory,
  createClientRecord,
  validateClientRecord,
};