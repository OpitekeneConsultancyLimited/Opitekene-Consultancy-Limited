"use strict";

const {
  SCHEMA_VERSION,
  assertPlainObject,
  cloneJson,
  requireIsoInstant,
  requireStringArray,
  requireTaxPeriod,
  requireText,
} = require("./phase6-domain.js");

const ScenarioStatus = Object.freeze({
  Draft: "draft",
  UnderReview: "under-review",
  Archived: "archived",
});

const scenarioTransitions = Object.freeze({
  [ScenarioStatus.Draft]: [ScenarioStatus.UnderReview, ScenarioStatus.Archived],
  [ScenarioStatus.UnderReview]: [ScenarioStatus.Draft, ScenarioStatus.Archived],
  [ScenarioStatus.Archived]: [],
});

function createScenarioRecord(value, { now = new Date().toISOString() } = {}) {
  assertPlainObject(value, "scenario");
  const status = value.status ?? ScenarioStatus.Draft;
  if (!Object.values(ScenarioStatus).includes(status)) throw new RangeError("Invalid scenario status.");
  assertPlainObject(value.inputSnapshot, "inputSnapshot");
  if (value.resultSnapshot != null) assertPlainObject(value.resultSnapshot, "resultSnapshot");
  const assumptions = cloneJson(value.assumptions ?? [], "assumptions");
  const missingFacts = cloneJson(value.missingFacts ?? [], "missingFacts");
  const statusHistory = cloneJson(value.statusHistory ?? [], "statusHistory");
  if (!Array.isArray(assumptions) || !Array.isArray(missingFacts) || !Array.isArray(statusHistory)) {
    throw new TypeError("assumptions, missingFacts, and statusHistory must be arrays.");
  }
  const timestamp = requireIsoInstant(now, "now");
  return {
    schemaVersion: SCHEMA_VERSION,
    scenarioId: requireText(value.scenarioId, "scenarioId", 120),
    practiceId: requireText(value.practiceId, "practiceId", 120),
    clientId: requireText(value.clientId, "clientId", 120),
    taxPeriod: requireTaxPeriod(value.taxPeriod, "taxPeriod", { nullable: true }),
    status,
    inputSnapshot: cloneJson(value.inputSnapshot, "inputSnapshot"),
    resultSnapshot: value.resultSnapshot == null ? null : cloneJson(value.resultSnapshot, "resultSnapshot"),
    taxHeads: requireStringArray(value.taxHeads ?? [], "taxHeads"),
    ruleIds: requireStringArray(value.ruleIds ?? [], "ruleIds"),
    sourceIds: requireStringArray(value.sourceIds ?? [], "sourceIds"),
    assumptions,
    missingFacts,
    createdAt: requireIsoInstant(value.createdAt ?? timestamp, "createdAt"),
    updatedAt: requireIsoInstant(value.updatedAt ?? timestamp, "updatedAt"),
    statusHistory,
  };
}

function transitionScenario(value, status, { now = new Date().toISOString(), actorId = null } = {}) {
  const current = createScenarioRecord({ ...value });
  if (!scenarioTransitions[current.status].includes(status)) {
    throw new RangeError(`Invalid scenario status transition: ${current.status} to ${status}.`);
  }
  const updatedAt = requireIsoInstant(now, "now");
  return createScenarioRecord({
    ...current,
    status,
    updatedAt,
    statusHistory: [...current.statusHistory, {
      at: updatedAt,
      actorId: actorId == null ? null : requireText(actorId, "actorId", 120),
      status,
    }],
  });
}

function createClientReportRecord(value, { now = new Date().toISOString() } = {}) {
  assertPlainObject(value, "client report");
  const generatedAt = requireIsoInstant(now, "now");
  return {
    schemaVersion: SCHEMA_VERSION,
    reportId: requireText(value.reportId, "reportId", 120),
    practiceId: requireText(value.practiceId, "practiceId", 120),
    clientId: requireText(value.clientId, "clientId", 120),
    reportType: requireText(value.reportType, "reportType", 80),
    taxPeriod: requireTaxPeriod(value.taxPeriod, "taxPeriod", { nullable: true }),
    scenarioIds: requireStringArray(value.scenarioIds ?? [], "scenarioIds"),
    sourceIds: requireStringArray(value.sourceIds ?? [], "sourceIds"),
    generatedAt,
    status: "review-required",
    legalVerificationStatus: "not-established",
    reviewHistory: [],
  };
}

function createAuditEvent(value) {
  assertPlainObject(value, "audit event");
  const metadata = cloneJson(value.metadata ?? {}, "metadata");
  assertPlainObject(metadata, "metadata");
  return {
    schemaVersion: SCHEMA_VERSION,
    eventId: requireText(value.eventId, "eventId", 120),
    practiceId: requireText(value.practiceId, "practiceId", 120),
    actorId: requireText(value.actorId, "actorId", 120),
    action: requireText(value.action, "action", 80),
    resourceType: requireText(value.resourceType, "resourceType", 80),
    resourceId: requireText(value.resourceId, "resourceId", 120),
    occurredAt: requireIsoInstant(value.occurredAt, "occurredAt"),
    metadata,
  };
}

module.exports = {
  ScenarioStatus,
  createScenarioRecord,
  transitionScenario,
  createClientReportRecord,
  createAuditEvent,
};