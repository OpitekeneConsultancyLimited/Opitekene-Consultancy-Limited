"use strict";

const allowedSourceTypes = Object.freeze({
  legislation: "legislation",
  regulation: "regulation",
  ura_guidance: "ura_guidance",
  judicial_decision: "judicial_decision",
  secondary_commentary: "secondary_commentary",
});

const allowedVerificationStatuses = Object.freeze([
  "pending-review",
  "verified",
  "superseded",
  "withdrawn",
  "rejected",
]);

function normalizeSourceType(sourceType) {
  if (!sourceType || typeof sourceType !== "string") {
    throw new RangeError("A legal source type is required.");
  }

  const normalized = sourceType.trim().toLowerCase();
  const aliases = {
    legislation: "legislation",
    "tax legislation": "legislation",
    regulation: "regulation",
    "tax regulation": "regulation",
    "ura guidance": "ura_guidance",
    "ura-guidance": "ura_guidance",
    "ura guidance note": "ura_guidance",
    "judicial decision": "judicial_decision",
    "judicial-decision": "judicial_decision",
    "case law": "judicial_decision",
    "secondary commentary": "secondary_commentary",
    "secondary-commentary": "secondary_commentary",
    commentary: "secondary_commentary",
  };

  if (Object.hasOwn(aliases, normalized)) {
    return aliases[normalized];
  }

  if (Object.hasOwn(allowedSourceTypes, normalized)) {
    return allowedSourceTypes[normalized];
  }

  throw new RangeError(`Unsupported legal source type: ${sourceType}.`);
}

function cloneValue(value) {
  if (Array.isArray(value)) {
    return value.map((item) => cloneValue(item));
  }

  if (value && typeof value === "object") {
    return JSON.parse(JSON.stringify(value));
  }

  return value;
}

function isValidDateString(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isValidHttpsUrl(value) {
  try {
    const url = new URL(String(value));
    return url.protocol === "https:" && Boolean(url.hostname);
  } catch {
    return false;
  }
}

function normalizeArray(values) {
  if (!values) {
    return [];
  }

  if (Array.isArray(values)) {
    return values.filter(Boolean).map((item) => String(item));
  }

  return [String(values)];
}

function citationIntegrity(record) {
  const issues = [];

  if (!record || typeof record !== "object") {
    return { valid: false, issues: ["A legal source record is required."] };
  }

  if (!record.title || !String(record.title).trim()) {
    issues.push("Source title is required.");
  }
  if (!record.officialSourceUrl || !String(record.officialSourceUrl).trim()) {
    issues.push("Official source URL is required.");
  } else if (!isValidHttpsUrl(String(record.officialSourceUrl).trim())) {
    issues.push("Official source URL must be a valid https URL.");
  }
  if (!record.documentReference) {
    issues.push("A document reference is required for legal citation integrity.");
  }
  if (!record.issuingAuthority || !String(record.issuingAuthority).trim()) {
    issues.push("Issuing authority is required.");
  }
  if (!isValidDateString(record.publicationDate)) {
    issues.push("Publication date must be a valid ISO date string.");
  }
  if (!isValidDateString(record.effectiveDate)) {
    issues.push("Effective date must be a valid ISO date string.");
  }
  if (record.endDate && !isValidDateString(record.endDate)) {
    issues.push("End date must be a valid ISO date string when provided.");
  }
  if (record.endDate && record.effectiveDate && new Date(record.effectiveDate) > new Date(record.endDate)) {
    issues.push("Effective date cannot be later than the end date.");
  }

  if (record.verificationStatus === "verified") {
    if (!isValidDateString(record.lastVerificationDate)) {
      issues.push("Verified sources require a last verification date.");
    }
    if (!record.reviewer || !String(record.reviewer).trim()) {
      issues.push("Verified sources require a reviewer name.");
    }
  }

  if (record.sourceType === "judicial_decision") {
    if (!record.caseReference && !record.provision) {
      issues.push("Judicial decisions require either a case reference or a provision citation.");
    }
  }

  if (record.sourceType === "legislation" && !record.legislation) {
    issues.push("Legislation records require a legislative title or code reference.");
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

function validateSourceRecord(record) {
  if (!record || typeof record !== "object") {
    throw new RangeError("A legal source record is required.");
  }

  const sourceType = normalizeSourceType(record.sourceType);
  if (!allowedVerificationStatuses.includes(record.verificationStatus)) {
    throw new RangeError(`Source verification status must be one of: ${allowedVerificationStatuses.join(", ")}.`);
  }

  const integrity = citationIntegrity({ ...record, sourceType });
  if (!['pending-review', 'rejected'].includes(record.verificationStatus) && !integrity.valid) {
    throw new RangeError(`Legal source ${record.sourceId || "unknown"} is invalid: ${integrity.issues.join("; ")}.`);
  }

  if (typeof record.primaryAuthority !== "boolean") {
    throw new RangeError("primaryAuthority must be true or false.");
  }

  if (record.officialSourceUrl && !isValidHttpsUrl(String(record.officialSourceUrl).trim())) {
    throw new RangeError("Official source URLs must be valid HTTPS URLs.");
  }

  if (!record.sourceId || !String(record.sourceId).trim()) {
    throw new RangeError("A sourceId is required.");
  }

  return {
    ...record,
    sourceType,
    relatedTaxHeads: normalizeArray(record.relatedTaxHeads),
    ruleIds: normalizeArray(record.ruleIds),
    applicableTaxPeriods: normalizeArray(record.applicableTaxPeriods),
    primaryAuthority: Boolean(record.primaryAuthority),
  };
}

function compareSourcePriority(left, right) {
  return Number(Boolean(right.primaryAuthority)) - Number(Boolean(left.primaryAuthority))
    || Number(right.verificationStatus === "verified") - Number(left.verificationStatus === "verified")
    || new Date(right.effectiveDate) - new Date(left.effectiveDate);
}

function createLegalSourceRegistry(initialSources = []) {
  const registry = {
    sources: [],
    byId: new Map(),
  };

  function addSource(record) {
    const normalized = validateSourceRecord(record);
    if (registry.byId.has(normalized.sourceId)) {
      throw new RangeError(`A legal source with id ${normalized.sourceId} is already registered.`);
    }

    registry.sources.push(Object.freeze(cloneValue(normalized)));
    registry.byId.set(normalized.sourceId, registry.sources[registry.sources.length - 1]);
    return registry.sources[registry.sources.length - 1];
  }

  for (const source of initialSources) {
    addSource(source);
  }

  function resolveSourcesForPeriod({ taxHead, taxPeriod, date }) {
    if (date && !isValidDateString(date)) {
      throw new RangeError("Source resolution date must be a valid ISO date.");
    }

    const selected = registry.sources.filter((source) => {
      const matchesTaxHead = !taxHead || source.relatedTaxHeads.includes(String(taxHead));
      const matchesPeriod = !taxPeriod || source.applicableTaxPeriods.length === 0 || source.applicableTaxPeriods.includes(String(taxPeriod));
      const matchesDate = !date || (
        isValidDateString(source.effectiveDate) &&
        new Date(source.effectiveDate) <= new Date(date) &&
        (!source.endDate || (
          isValidDateString(source.endDate) &&
          new Date(date) <= new Date(source.endDate)
        ))
      );
      return matchesTaxHead && matchesPeriod && matchesDate;
    });

    return [...selected].sort(compareSourcePriority).map((source) => cloneValue(source));
  }

  function getSourceById(sourceId) {
    return registry.byId.has(sourceId) ? cloneValue(registry.byId.get(sourceId)) : null;
  }

  function getVerifiedSources() {
    return registry.sources
      .filter((source) => source.verificationStatus === "verified")
      .map((source) => cloneValue(source));
  }

  function registerSource(source) {
    return addSource(source);
  }

  return Object.freeze({
    sourceTypes: Object.freeze({ ...allowedSourceTypes }),
    verificationStatuses: Object.freeze([...allowedVerificationStatuses]),
    registerSource,
    resolveSourcesForPeriod,
    getSourceById,
    getVerifiedSources,
    getAllSources: () => registry.sources.map((source) => cloneValue(source)),
    validateSourceRecord,
    citationIntegrity,
  });
}

module.exports = {
  allowedSourceTypes,
  allowedVerificationStatuses,
  classifySourceType: normalizeSourceType,
  createLegalSourceRegistry,
  validateSourceRecord,
  citationIntegrity,
};
