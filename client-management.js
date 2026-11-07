"use strict";

const { ClientStatus, createClientRecord } = require("./client-model.js");
const { assertPlainObject, requireText, requireIsoInstant } = require("./phase6-domain.js");

const editableFields = new Set([
  "legalBusinessName",
  "tin",
  "registrationNumber",
  "entityType",
  "taxpayerCategory",
]);

// The caller must derive authorizedPracticeId from a verified server-side identity.
function createClientManagementService({ repository, createId, clock = () => new Date() } = {}) {
  const requiredMethods = ["findById", "findByTin", "listByPractice", "insert", "replace"];
  if (!repository || requiredMethods.some((method) => typeof repository[method] !== "function")) {
    throw new TypeError(`repository must implement: ${requiredMethods.join(", ")}.`);
  }
  if (typeof createId !== "function" || typeof clock !== "function") {
    throw new TypeError("createId and clock functions are required.");
  }

  function timestamp() {
    const value = clock();
    return requireIsoInstant(value instanceof Date ? value.toISOString() : value, "clock");
  }

  function assertScope(practiceId, clientId) {
    return {
      practiceId: requireText(practiceId, "authorizedPracticeId", 120),
      clientId: requireText(clientId, "clientId", 120),
    };
  }

  async function assertUniqueTin(practiceId, tin, exceptClientId = null) {
    if (!tin) return;
    const existing = await repository.findByTin(practiceId, tin);
    if (existing && existing.clientId !== exceptClientId) {
      throw new Error("A client with this TIN already exists in this practice.");
    }
  }

  return Object.freeze({
    async create(authorizedPracticeId, input) {
      const practiceId = requireText(authorizedPracticeId, "authorizedPracticeId", 120);
      assertPlainObject(input, "client input");
      for (const field of ["practiceId", "clientId", "schemaVersion", "status", "createdAt", "updatedAt", "archivedAt"]) {
        if (Object.hasOwn(input, field)) throw new RangeError(`${field} is server-managed.`);
      }
      const clientId = requireText(createId(), "generated clientId", 120);
      const now = timestamp();
      const record = createClientRecord({ ...input, clientId, practiceId, createdAt: now, updatedAt: now }, { now });
      await assertUniqueTin(practiceId, record.tin);
      return repository.insert(record);
    },

    async get(authorizedPracticeId, clientId) {
      const scope = assertScope(authorizedPracticeId, clientId);
      return repository.findById(scope.practiceId, scope.clientId);
    },

    async list(authorizedPracticeId, filters = {}) {
      const practiceId = requireText(authorizedPracticeId, "authorizedPracticeId", 120);
      assertPlainObject(filters, "filters");
      const clients = await repository.listByPractice(practiceId);
      const name = typeof filters.name === "string" ? filters.name.trim().toLowerCase() : "";
      return clients.filter((client) =>
        (!name || client.legalBusinessName.toLowerCase().includes(name)) &&
        (!filters.tin || client.tin === filters.tin) &&
        (!filters.entityType || client.entityType === filters.entityType) &&
        (!filters.taxpayerCategory || client.taxpayerCategory === filters.taxpayerCategory) &&
        (!filters.status || client.status === filters.status));
    },

    async update(authorizedPracticeId, clientId, changes) {
      const scope = assertScope(authorizedPracticeId, clientId);
      assertPlainObject(changes, "client changes");
      const keys = Object.keys(changes);
      if (!keys.length || keys.some((field) => !editableFields.has(field))) {
        throw new RangeError("Only legalBusinessName, tin, registrationNumber, entityType, and taxpayerCategory may be updated.");
      }
      const existing = await repository.findById(scope.practiceId, scope.clientId);
      if (!existing) return null;
      const record = createClientRecord({
        ...existing,
        ...changes,
        clientId: scope.clientId,
        practiceId: scope.practiceId,
        createdAt: existing.createdAt,
        updatedAt: timestamp(),
      });
      await assertUniqueTin(scope.practiceId, record.tin, scope.clientId);
      return repository.replace(record);
    },

    async archive(authorizedPracticeId, clientId) {
      const scope = assertScope(authorizedPracticeId, clientId);
      const existing = await repository.findById(scope.practiceId, scope.clientId);
      if (!existing) return null;
      if (existing.status === ClientStatus.Archived) return existing;
      const now = timestamp();
      return repository.replace(createClientRecord({
        ...existing,
        status: ClientStatus.Archived,
        archivedAt: now,
        updatedAt: now,
      }, { now }));
    },
  });
}

module.exports = { createClientManagementService };