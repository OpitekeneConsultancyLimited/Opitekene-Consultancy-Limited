import clientManagementModule from "../client-management.js";
import clientModelModule from "../client-model.js";
import clientTaxProfilesModule from "../client-tax-profiles.js";
import complianceModule from "../compliance-calendar.js";
import documentModule from "../document-management.js";
import documentAnalysisModule from "../document-to-tax-analysis.js";
import multiTaxModule from "../multi-tax-analysis.js";
import taxCalculatorModule from "../tax-calculator.js";
import phase6RecordsModule from "../phase6-records.js";
import reportModule from "../tax-research-report.js";
import legalSourceModule from "../legal-source-registry.js";
import caseLawModule from "../case-law-registry.js";
import {
  clearSessionCookie,
  createPhase6AuthService,
  hashPassword,
  hasPermission,
  phase6AuthConstants,
  readSessionCookie,
  sessionCookie,
} from "./phase6-auth.mjs";
import { validateDeploymentReadiness } from "./deployment-security.mjs";
import { createOperationsAnalyticsService } from "./operations-analytics.mjs";
import { getCommercialLaunchReadiness } from "./commercial-governance.mjs";

const { createClientManagementService } = clientManagementModule;
const { createClientRecord } = clientModelModule;
const { createClientTaxProfileRecord } = clientTaxProfilesModule;
const {
  createCalendarEntryRecord,
  transitionComplianceEntry,
} = complianceModule;
const {
  createDocumentRecord,
  isValidFileSize,
  isValidFileType,
  transitionDocumentRecord,
  DocumentStatus,
} = documentModule;
const {
  createDocumentAnalysisProposal,
  reviewDocumentAnalysisProposal,
} = documentAnalysisModule;
const { assessTransaction } = multiTaxModule;
const {
  createScenarioRecord,
  transitionScenario,
  createClientReportRecord,
} = phase6RecordsModule;
const { createTaxResearchReportService, toPrintableHtml, toCitationCsv } = reportModule;
const { createLegalSourceRegistry } = legalSourceModule;
const { createCaseLawRegistry } = caseLawModule;
const API_PREFIX = "/api/phase6";
const MAX_JSON_BYTES = 64_000;

function response(data, status, corsHeaders, extraHeaders = {}) {
  return new Response(data === null ? null : JSON.stringify(data), {
    status,
    headers: {
      "Cache-Control": "no-store, private",
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      "Vary": "Origin",
      ...corsHeaders,
      ...extraHeaders,
    },
  });
}

function corsFor(request, env) {
  const origin = request.headers.get("Origin");
  if (!origin || origin !== env.ALLOWED_ORIGIN) return null;
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-CSRF-Token, X-Phase6-Bootstrap",
    "Access-Control-Max-Age": "600",
  };
}

async function jsonBody(request) {
  if (request.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    throw new TypeError("Send the request body as JSON.");
  }
  if (!request.body) throw new TypeError("A JSON request body is required.");
  const reader = request.body.getReader();
  const chunks = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > MAX_JSON_BYTES) {
      await reader.cancel();
      throw new RangeError("Request body is too large.");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}

function requestLimiter(request, env, keyPrefix) {
  if (!env.CHAT_LIMITER || typeof env.CHAT_LIMITER.limit !== "function") return false;
  return env.CHAT_LIMITER.limit({
    key: `${keyPrefix}:${request.headers.get("CF-Connecting-IP") || "unknown"}`,
  });
}

function makeMailer(env) {
  if (env.PHASE6_EMAIL_SERVICE && typeof env.PHASE6_EMAIL_SERVICE.fetch === "function" &&
      typeof env.PHASE6_EMAIL_API_KEY === "string" && env.PHASE6_EMAIL_API_KEY.length >= 24 &&
      typeof env.PHASE6_EMAIL_ENDPOINT === "string" && env.PHASE6_EMAIL_ENDPOINT.startsWith("https://") &&
      typeof env.PHASE6_APP_ORIGIN === "string" && env.PHASE6_APP_ORIGIN.startsWith("https://")) {
    return {
      async sendPasswordReset({ email, token, expiresAt }) {
        const resetUrl = new URL("/", env.PHASE6_APP_ORIGIN);
        resetUrl.searchParams.set("phase6Reset", token);
        const result = await env.PHASE6_EMAIL_SERVICE.fetch(env.PHASE6_EMAIL_ENDPOINT, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${env.PHASE6_EMAIL_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ to: email, resetUrl: resetUrl.toString(), expiresAt }),
        });
        if (!result.ok) throw new Error("Email delivery failed.");
      },
    };
  }
  if (env.PHASE6_TEST_MAILER && typeof env.PHASE6_TEST_MAILER.sendPasswordReset === "function") {
    return env.PHASE6_TEST_MAILER;
  }
  return null;
}

function makeAuth(env) {
  return createPhase6AuthService({
    db: env.UNANSWERED_QUESTIONS,
    mailer: makeMailer(env),
  });
}

async function authenticate(request, auth) {
  const token = readSessionCookie(request);
  return token ? auth.authenticate(token) : null;
}

async function checkCsrf(request, auth, session) {
  return auth.verifyCsrf(session, request.headers.get("X-CSRF-Token"));
}

async function audit(db, principal, action, resourceType, resourceId, details = {}) {
  const eventId = crypto.randomUUID();
  const now = new Date().toISOString();
  await db.prepare(
    "INSERT INTO phase6_audit_log (id, organization_id, actor_user_id, action, resource_type, resource_id, details_json, occurred_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  ).bind(
    eventId,
    principal.organizationId,
    principal.userId,
    action,
    resourceType,
    resourceId,
    JSON.stringify(details),
    now,
  ).run();
}

function clientFromRow(row) {
  return createClientRecord({
    schemaVersion: 1,
    clientId: row.id,
    practiceId: row.organizationId,
    legalBusinessName: row.legalBusinessName,
    tin: row.tin,
    registrationNumber: row.registrationNumber,
    entityType: row.entityType,
    taxpayerCategory: row.taxpayerCategory,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    archivedAt: row.archivedAt,
  });
}

function createClientRepository(db, actorId) {
  const selectFields = `id, organization_id AS organizationId, legal_business_name AS legalBusinessName,
    tin, registration_number AS registrationNumber, entity_type AS entityType,
    taxpayer_category AS taxpayerCategory, status, created_at AS createdAt,
    updated_at AS updatedAt, archived_at AS archivedAt`;
  return {
    async findById(practiceId, clientId) {
      const row = await db.prepare(`SELECT ${selectFields} FROM phase6_clients WHERE organization_id = ? AND id = ? LIMIT 1`)
        .bind(practiceId, clientId).first();
      return row ? clientFromRow(row) : null;
    },
    async findByTin(practiceId, tin) {
      const row = await db.prepare(`SELECT ${selectFields} FROM phase6_clients WHERE organization_id = ? AND tin = ? LIMIT 1`)
        .bind(practiceId, tin).first();
      return row ? clientFromRow(row) : null;
    },
    async listByPractice(practiceId) {
      const { results = [] } = await db.prepare(`SELECT ${selectFields} FROM phase6_clients WHERE organization_id = ? ORDER BY legal_business_name COLLATE NOCASE LIMIT 500`)
        .bind(practiceId).all();
      return results.map(clientFromRow);
    },
    async insert(record) {
      const recordWithRegistration = { registrationNumber: null, ...record };
      const now = record.createdAt;
      await db.batch([
        db.prepare(
        `INSERT INTO phase6_clients
         (id, organization_id, legal_business_name, tin, registration_number, entity_type,
          taxpayer_category, status, created_by, updated_by, created_at, updated_at, archived_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        record.clientId, record.practiceId, record.legalBusinessName, record.tin,
        recordWithRegistration.registrationNumber, record.entityType, record.taxpayerCategory,
        record.status, actorId, actorId, record.createdAt, record.updatedAt, record.archivedAt,
        ),
        db.prepare("INSERT INTO phase6_audit_log (id, organization_id, actor_user_id, action, resource_type, resource_id, details_json, occurred_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
          .bind(crypto.randomUUID(), record.practiceId, actorId, "client.created", "client", record.clientId,
            JSON.stringify({ entityType: record.entityType }), now),
      ]);
      return recordWithRegistration;
    },
    async replace(record) {
      const now = record.updatedAt;
      const action = record.status === "archived" ? "client.archived" : "client.updated";
      const results = await db.batch([
        db.prepare(
        `UPDATE phase6_clients SET legal_business_name = ?, tin = ?, registration_number = ?, entity_type = ?,
          taxpayer_category = ?, status = ?, updated_by = ?, updated_at = ?, archived_at = ?
          WHERE organization_id = ? AND id = ?`,
      ).bind(
        record.legalBusinessName, record.tin, record.registrationNumber, record.entityType, record.taxpayerCategory,
        record.status, actorId, record.updatedAt, record.archivedAt, record.practiceId, record.clientId,
        ),
        db.prepare("INSERT INTO phase6_audit_log (id, organization_id, actor_user_id, action, resource_type, resource_id, details_json, occurred_at) SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE changes() = 1")
          .bind(crypto.randomUUID(), record.practiceId, actorId, action, "client", record.clientId,
            JSON.stringify({ entityType: record.entityType }), now),
      ]);
      return (results[0]?.meta?.changes || 0) ? record : null;
    },
  };
}

function roleCanAssign(actorRole, requestedRole) {
  if (!phase6AuthConstants.ROLES.includes(requestedRole)) return false;
  if (actorRole === "system-admin") return true;
  return actorRole === "practice-admin" && !["system-admin", "practice-admin"].includes(requestedRole);
}

async function listClients(db, principal, filters = {}) {
  const columns = `c.id AS clientId, c.organization_id AS practiceId,
    c.legal_business_name AS legalBusinessName, c.tin, c.registration_number AS registrationNumber,
    c.entity_type AS entityType, c.taxpayer_category AS taxpayerCategory, c.status,
    c.created_at AS createdAt, c.updated_at AS updatedAt, c.archived_at AS archivedAt`;
  let query = `SELECT ${columns} FROM phase6_clients c WHERE c.organization_id = ?`;
  const values = [principal.organizationId];
  if (!["system-admin", "practice-admin"].includes(principal.role)) {
    query += " AND EXISTS (SELECT 1 FROM phase6_client_access ca WHERE ca.organization_id = c.organization_id AND ca.client_id = c.id AND ca.user_id = ?)";
    values.push(principal.userId);
  }
  if (filters.name) {
    query += " AND instr(lower(c.legal_business_name), lower(?)) > 0";
    values.push(filters.name);
  }
  for (const [field, column, maxLength] of [
    ["tin", "c.tin", 40],
    ["entityType", "c.entity_type", 32],
    ["taxpayerCategory", "c.taxpayer_category", 32],
    ["status", "c.status", 16],
  ]) {
    if (filters[field]) {
      if (typeof filters[field] !== "string" || filters[field].length > maxLength) throw new RangeError(`Invalid ${field} filter.`);
      query += ` AND ${column} = ?`;
      values.push(filters[field]);
    }
  }
  query += " ORDER BY c.legal_business_name COLLATE NOCASE LIMIT 500";
  return db.prepare(query).bind(...values).all();
}

async function handleUsers(request, env, auth, principal, path) {
  const db = env.UNANSWERED_QUESTIONS;
  if (request.method === "GET" && path === `${API_PREFIX}/users`) {
    if (!hasPermission(principal.role, "read", "users")) return response({ error: "Forbidden." }, 403, corsFor(request, env));
    const { results = [] } = await db.prepare(
      `SELECT u.id AS userId, u.email, u.status, u.created_at AS createdAt,
              m.role, m.status AS membershipStatus
         FROM phase6_memberships m JOIN phase6_users u ON u.id = m.user_id
        WHERE m.organization_id = ? ORDER BY u.email LIMIT 500`,
    ).bind(principal.organizationId).all();
    const users = await Promise.all(results.map(async (user) => {
      const { results: assignments = [] } = await db.prepare(
        "SELECT client_id AS clientId FROM phase6_client_access WHERE organization_id = ? AND user_id = ? ORDER BY client_id",
      ).bind(principal.organizationId, user.userId).all();
      return { ...user, clientIds: assignments.map((item) => item.clientId) };
    }));
    await audit(db, principal, "users.listed", "user-list", principal.organizationId, { count: users.length });
    return response({ users }, 200, corsFor(request, env));
  }
  if (request.method === "POST" && path === `${API_PREFIX}/users`) {
    if (!hasPermission(principal.role, "create", "users")) return response({ error: "Forbidden." }, 403, corsFor(request, env));
    const mailer = makeMailer(env);
    if (!mailer) return response({ error: "Invitation delivery is not configured." }, 503, corsFor(request, env));
    const body = await jsonBody(request);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new TypeError("A user record is required.");
    if (!roleCanAssign(principal.role, body.role)) return response({ error: "Role assignment is not permitted." }, 403, corsFor(request, env));
    if (!Array.isArray(body.clientIds ?? [])) throw new TypeError("clientIds must be an array.");
    const userId = crypto.randomUUID();
    const email = String(body.email || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new RangeError("A valid email is required.");
    const timestamp = new Date().toISOString();
    const placeholderPassword = `${crypto.randomUUID()}-A1`;
    const passwordHash = await hashPassword(placeholderPassword);
    const clientIds = [...new Set(body.clientIds ?? [])];
    if (clientIds.some((id) => typeof id !== "string" || !id.trim() || id.length > 120)) throw new RangeError("Every client assignment must have a valid ID.");
    if (clientIds.length && !("system-admin" === principal.role || "practice-admin" === principal.role)) {
      return response({ error: "Only practice administrators can assign clients during invitation." }, 403, corsFor(request, env));
    }
    if (clientIds.length) {
      const placeholders = clientIds.map(() => "?").join(",");
      const { results = [] } = await db.prepare(
        `SELECT id FROM phase6_clients WHERE organization_id = ? AND id IN (${placeholders})`,
      ).bind(principal.organizationId, ...clientIds).all();
      if (results.length !== clientIds.length) return response({ error: "One or more clients are unavailable." }, 404, corsFor(request, env));
    }
    const statements = [
      db.prepare("INSERT INTO phase6_users (id, email, password_hash, status, created_at, updated_at) VALUES (?, ?, ?, 'pending', ?, ?)")
        .bind(userId, email, passwordHash, timestamp, timestamp),
      db.prepare("INSERT INTO phase6_memberships (organization_id, user_id, role, created_at) VALUES (?, ?, ?, ?)")
        .bind(principal.organizationId, userId, body.role, timestamp),
      ...clientIds.map((clientId) => db.prepare(
        "INSERT INTO phase6_client_access (organization_id, user_id, client_id, assigned_by, created_at) VALUES (?, ?, ?, ?, ?)",
      ).bind(principal.organizationId, userId, clientId, principal.userId, timestamp)),
    ];
    await db.batch(statements);
    const invitation = await auth.requestPasswordReset(email, { reportDelivery: true });
    await audit(db, principal, "user.invited", "user", userId, { role: body.role, assignedClientCount: clientIds.length });
    if (!invitation.delivered) {
      return response({ error: "Invitation delivery failed; the account remains pending." }, 503, corsFor(request, env));
    }
    return response({ user: { userId, email, role: body.role, status: "pending" } }, 201, corsFor(request, env));
  }
  const userMatch = path.match(/^\/api\/phase6\/users\/([a-z0-9._-]{1,120})$/i);
  const assignmentMatch = path.match(/^\/api\/phase6\/users\/([a-z0-9._-]{1,120})\/clients$/i);
  const targetUserId = assignmentMatch?.[1] || userMatch?.[1];
  if (!targetUserId) return null;
  if (!hasPermission(principal.role, "update", "users")) return response({ error: "Forbidden." }, 403, corsFor(request, env));
  const target = await db.prepare(
    `SELECT m.user_id AS userId, m.role, m.status FROM phase6_memberships m
     WHERE m.organization_id = ? AND m.user_id = ? LIMIT 1`,
  ).bind(principal.organizationId, targetUserId).first();
  if (!target) return response({ error: "User not found." }, 404, corsFor(request, env));

  if (assignmentMatch && request.method === "PUT") {
    if (["system-admin", "practice-admin"].includes(target.role)) return response({ error: "Organization administrators do not use client assignments." }, 409, corsFor(request, env));
    const body = await jsonBody(request);
    if (!Array.isArray(body.clientIds)) throw new TypeError("clientIds must be an array.");
    const clientIds = [...new Set(body.clientIds)];
    if (clientIds.some((id) => typeof id !== "string" || !id.trim() || id.length > 120)) throw new RangeError("Every client assignment must have a valid ID.");
    if (clientIds.length) {
      const placeholders = clientIds.map(() => "?").join(",");
      const { results = [] } = await db.prepare(
        `SELECT id FROM phase6_clients WHERE organization_id = ? AND id IN (${placeholders})`,
      ).bind(principal.organizationId, ...clientIds).all();
      if (results.length !== clientIds.length) return response({ error: "One or more clients are unavailable." }, 404, corsFor(request, env));
    }
    const now = new Date().toISOString();
    await db.batch([
      db.prepare("DELETE FROM phase6_client_access WHERE organization_id = ? AND user_id = ?").bind(principal.organizationId, targetUserId),
      ...clientIds.map((clientId) => db.prepare(
        "INSERT INTO phase6_client_access (organization_id, user_id, client_id, assigned_by, created_at) VALUES (?, ?, ?, ?, ?)",
      ).bind(principal.organizationId, targetUserId, clientId, principal.userId, now)),
      db.prepare("INSERT INTO phase6_audit_log (id, organization_id, actor_user_id, action, resource_type, resource_id, details_json, occurred_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(crypto.randomUUID(), principal.organizationId, principal.userId, "user.clients-assigned", "user", targetUserId,
          JSON.stringify({ assignedClientCount: clientIds.length }), now),
    ]);
    return response({ userId: targetUserId, clientIds }, 200, corsFor(request, env));
  }

  if (userMatch && request.method === "PATCH") {
    const body = await jsonBody(request);
    const nextRole = body.role ?? target.role;
    const nextStatus = body.status ?? target.status;
    if (!roleCanAssign(principal.role, nextRole)) return response({ error: "Role assignment is not permitted." }, 403, corsFor(request, env));
    if (!["active", "inactive"].includes(nextStatus)) throw new RangeError("Membership status must be active or inactive.");
    if (targetUserId === principal.userId && (nextRole !== target.role || nextStatus !== "active")) {
      return response({ error: "Administrators cannot remove their own current access." }, 409, corsFor(request, env));
    }
    if (target.role === "system-admin" && (nextRole !== target.role || nextStatus !== "active")) {
      const count = await db.prepare(
        "SELECT COUNT(*) AS count FROM phase6_memberships WHERE organization_id = ? AND role = 'system-admin' AND status = 'active'",
      ).bind(principal.organizationId).first();
      if (Number(count?.count || 0) <= 1) return response({ error: "The organization must retain an active system administrator." }, 409, corsFor(request, env));
    }
    const now = new Date().toISOString();
    const statements = [
      db.prepare("UPDATE phase6_memberships SET role = ?, status = ? WHERE organization_id = ? AND user_id = ?")
        .bind(nextRole, nextStatus, principal.organizationId, targetUserId),
      ...(nextStatus === "inactive" ? [db.prepare("UPDATE phase6_sessions SET revoked_at = ? WHERE organization_id = ? AND user_id = ? AND revoked_at IS NULL")
        .bind(now, principal.organizationId, targetUserId)] : []),
      db.prepare("INSERT INTO phase6_audit_log (id, organization_id, actor_user_id, action, resource_type, resource_id, details_json, occurred_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(crypto.randomUUID(), principal.organizationId, principal.userId, "user.membership-updated", "user", targetUserId,
          JSON.stringify({ role: nextRole, status: nextStatus }), now),
    ];
    await db.batch(statements);
    return response({ userId: targetUserId, role: nextRole, status: nextStatus }, 200, corsFor(request, env));
  }
  return null;
}

async function handleClients(request, env, auth, principal, path) {
  const db = env.UNANSWERED_QUESTIONS;
  const root = `${API_PREFIX}/clients`;
  const match = path.match(/^\/api\/phase6\/clients\/([a-z0-9._-]{1,120})(?:\/tax-profile)?$/i);
  const clientId = match?.[1] || null;
  const isProfile = Boolean(clientId && path.endsWith("/tax-profile"));
  if (request.method === "GET" && path === root) {
    if (!hasPermission(principal.role, "read", "clients")) return response({ error: "Forbidden." }, 403, corsFor(request, env));
    const url = new URL(request.url);
    const { results = [] } = await listClients(db, principal, {
      name: url.searchParams.get("name") || "",
      tin: url.searchParams.get("tin") || "",
      entityType: url.searchParams.get("entityType") || "",
      taxpayerCategory: url.searchParams.get("taxpayerCategory") || "",
      status: url.searchParams.get("status") || "",
    });
    await audit(db, principal, "clients.listed", "client-list", principal.organizationId, { count: results.length });
    return response({ clients: results }, 200, corsFor(request, env));
  }
  if (request.method === "POST" && path === root) {
    if (!hasPermission(principal.role, "create", "clients")) return response({ error: "Forbidden." }, 403, corsFor(request, env));
    const body = await jsonBody(request);
    const service = createClientManagementService({
      repository: createClientRepository(db, principal.userId),
      createId: () => crypto.randomUUID(),
    });
    const client = await service.create(principal.organizationId, body);
    return response({ client }, 201, corsFor(request, env));
  }
  if (!clientId) return null;
  const canAccess = await auth.requireClientAccess(principal, clientId, "read", "clients");
  if (request.method === "GET" && !isProfile) {
    if (!canAccess) return response({ error: "Client not found." }, 404, corsFor(request, env));
    const record = await db.prepare(
      `SELECT id AS clientId, organization_id AS practiceId, legal_business_name AS legalBusinessName,
              tin, registration_number AS registrationNumber, entity_type AS entityType,
              taxpayer_category AS taxpayerCategory, status, created_at AS createdAt,
              updated_at AS updatedAt, archived_at AS archivedAt
         FROM phase6_clients WHERE organization_id = ? AND id = ? LIMIT 1`,
    ).bind(principal.organizationId, clientId).first();
    if (record) await audit(db, principal, "client.read", "client", clientId);
    return record ? response({ client: record }, 200, corsFor(request, env)) : response({ error: "Client not found." }, 404, corsFor(request, env));
  }
  if (isProfile && (request.method === "GET" || request.method === "PUT")) {
    if (!canAccess) return response({ error: "Client not found." }, 404, corsFor(request, env));
    if (request.method === "GET") {
      const profile = await db.prepare(
        "SELECT profile_json AS profile, created_at AS createdAt, updated_at AS updatedAt FROM phase6_client_tax_profiles WHERE organization_id = ? AND client_id = ?",
      ).bind(principal.organizationId, clientId).first();
      await audit(db, principal, "client-profile.read", "client", clientId);
      return response({ profile: profile ? JSON.parse(profile.profile) : null }, 200, corsFor(request, env));
    }
    if (!hasPermission(principal.role, "update", "profiles")) return response({ error: "Forbidden." }, 403, corsFor(request, env));
    const body = await jsonBody(request);
    const existing = await db.prepare(
      "SELECT created_at AS createdAt FROM phase6_client_tax_profiles WHERE organization_id = ? AND client_id = ?",
    ).bind(principal.organizationId, clientId).first();
    const timestamp = new Date().toISOString();
    const profile = createClientTaxProfileRecord({
      ...body,
      practiceId: principal.organizationId,
      clientId,
      createdAt: existing?.createdAt || timestamp,
      updatedAt: timestamp,
    }, { now: timestamp });
    await db.prepare(
      `INSERT INTO phase6_client_tax_profiles (organization_id, client_id, schema_version, profile_json, created_by, updated_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(organization_id, client_id) DO UPDATE SET profile_json = excluded.profile_json,
         updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
    ).bind(principal.organizationId, clientId, profile.schemaVersion, JSON.stringify(profile), principal.userId, principal.userId,
      existing?.createdAt || timestamp, timestamp).run();
    await audit(db, principal, existing ? "client-profile.updated" : "client-profile.created", "client", clientId);
    return response({ profile }, existing ? 200 : 201, corsFor(request, env));
  }
  if (request.method === "PATCH" && !isProfile) {
    if (!await auth.requireClientAccess(principal, clientId, "update", "clients")) return response({ error: "Client not found." }, 404, corsFor(request, env));
    const body = await jsonBody(request);
    const service = createClientManagementService({
      repository: createClientRepository(db, principal.userId),
      createId: () => crypto.randomUUID(),
    });
    const client = await service.update(principal.organizationId, clientId, body);
    if (!client) return response({ error: "Client not found." }, 404, corsFor(request, env));
    return response({ client }, 200, corsFor(request, env));
  }
  if (request.method === "DELETE" && !isProfile) {
    if (!await auth.requireClientAccess(principal, clientId, "archive", "clients")) return response({ error: "Client not found." }, 404, corsFor(request, env));
    const service = createClientManagementService({
      repository: createClientRepository(db, principal.userId),
      createId: () => crypto.randomUUID(),
    });
    const client = await service.archive(principal.organizationId, clientId);
    if (!client) return response({ error: "Client not found." }, 404, corsFor(request, env));
    return response({ client }, 200, corsFor(request, env));
  }
  return null;
}

function complianceRecordFromRow(row) {
  return createCalendarEntryRecord({
    schemaVersion: 1,
    obligationId: row.obligationId,
    practiceId: row.organizationId,
    clientId: row.clientId,
    taxObligationType: row.taxType,
    taxPeriod: row.taxPeriod,
    description: row.description,
    filingDeadline: row.filingDeadline,
    paymentDeadline: row.paymentDeadline,
    filingStatus: row.filingStatus,
    paymentStatus: row.paymentStatus,
    outstandingAmount: row.outstandingAmount,
    deadlineSourceId: row.deadlineSourceId,
    deadlineVerificationStatus: row.deadlineVerificationStatus,
    responsibleStaff: row.responsibleUserId,
    supportingDocuments: row.supportingDocuments || [],
    statusHistory: row.statusHistory,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

async function handleCompliance(request, env, auth, principal, path) {
  const db = env.UNANSWERED_QUESTIONS;
  const root = `${API_PREFIX}/compliance`;
  const match = path.match(/^\/api\/phase6\/compliance\/([a-z0-9._-]{1,120})$/i);
  const obligationId = match?.[1] || null;
  const selectFields = `o.id AS obligationId, o.organization_id AS organizationId, o.client_id AS clientId,
    o.tax_type AS taxType, o.tax_period AS taxPeriod, o.description,
    o.filing_deadline AS filingDeadline, o.payment_deadline AS paymentDeadline,
    o.filing_status AS filingStatus, o.payment_status AS paymentStatus,
    o.outstanding_amount AS outstandingAmount, o.deadline_source_id AS deadlineSourceId,
    o.deadline_verification_status AS deadlineVerificationStatus,
    o.responsible_user_id AS responsibleUserId, o.status_history_json AS statusHistoryJson,
    o.created_at AS createdAt, o.updated_at AS updatedAt`;

  if (request.method === "GET" && path === root) {
    if (!hasPermission(principal.role, "read", "compliance")) return response({ error: "Forbidden." }, 403, corsFor(request, env));
    const url = new URL(request.url);
    const conditions = ["o.organization_id = ?"];
    const values = [principal.organizationId];
    if (url.searchParams.has("clientId")) {
      const clientId = url.searchParams.get("clientId");
      if (!await auth.requireClientAccess(principal, clientId, "read", "compliance")) {
        return response({ obligations: [] }, 200, corsFor(request, env));
      }
      conditions.push("o.client_id = ?");
      values.push(clientId);
    } else if (!["system-admin", "practice-admin"].includes(principal.role)) {
      conditions.push("EXISTS (SELECT 1 FROM phase6_client_access ca WHERE ca.organization_id = o.organization_id AND ca.client_id = o.client_id AND ca.user_id = ?)");
      values.push(principal.userId);
    }
    for (const [parameter, column] of [
      ["taxPeriod", "o.tax_period"],
      ["taxType", "o.tax_type"],
      ["filingStatus", "o.filing_status"],
      ["paymentStatus", "o.payment_status"],
    ]) {
      const value = url.searchParams.get(parameter);
      if (value) {
        conditions.push(`${column} = ?`);
        values.push(value);
      }
    }
    const { results = [] } = await db.prepare(
      `SELECT ${selectFields} FROM phase6_obligations o WHERE ${conditions.join(" AND ")} ORDER BY COALESCE(o.filing_deadline, o.payment_deadline), o.id LIMIT 500`,
    ).bind(...values).all();
    await audit(db, principal, "compliance.listed", "obligation-list", principal.organizationId, { count: results.length });
    let evidenceByObligation = new Map();
    if (results.length) {
      const placeholders = results.map(() => "?").join(",");
      const { results: evidence = [] } = await db.prepare(
        `SELECT obligation_id AS obligationId, document_id AS documentId FROM phase6_compliance_documents
         WHERE organization_id = ? AND obligation_id IN (${placeholders})`,
      ).bind(principal.organizationId, ...results.map((item) => item.obligationId)).all();
      evidenceByObligation = new Map(results.map((item) => [item.obligationId, []]));
      for (const item of evidence) evidenceByObligation.get(item.obligationId)?.push(item.documentId);
    }
    return response({ obligations: results.map((row) => complianceRecordFromRow({
      ...row,
      statusHistory: JSON.parse(row.statusHistoryJson || "[]"),
      supportingDocuments: evidenceByObligation.get(row.obligationId) || [],
    })) }, 200, corsFor(request, env));
  }

  if (request.method === "POST" && path === root) {
    const body = await jsonBody(request);
    if (!await auth.requireClientAccess(principal, body.clientId, "create", "compliance")) {
      return response({ error: "Client not found." }, 404, corsFor(request, env));
    }
    const supportingDocuments = [...new Set(body.supportingDocuments || [])];
    if (supportingDocuments.some((id) => typeof id !== "string" || !id.trim() || id.length > 120)) {
      throw new RangeError("Every supporting document ID must be valid.");
    }
    if (supportingDocuments.length) {
      const placeholders = supportingDocuments.map(() => "?").join(",");
      const { results = [] } = await db.prepare(
        `SELECT id FROM phase6_documents WHERE organization_id = ? AND client_id = ? AND id IN (${placeholders})`,
      ).bind(principal.organizationId, body.clientId, ...supportingDocuments).all();
      if (results.length !== supportingDocuments.length) return response({ error: "One or more supporting documents are unavailable." }, 404, corsFor(request, env));
    }
    const now = new Date().toISOString();
    const record = createCalendarEntryRecord({
      ...body,
      obligationId: crypto.randomUUID(),
      practiceId: principal.organizationId,
      outstandingAmount: body.outstandingAmount ?? 0,
      createdAt: now,
      updatedAt: now,
      statusHistory: [],
      supportingDocuments,
      deadlineVerificationStatus: "unverified",
    }, { now });
    const statements = [
      db.prepare(
        `INSERT INTO phase6_obligations
         (id, organization_id, client_id, tax_type, tax_period, description,
          filing_deadline, payment_deadline, filing_status, payment_status,
          outstanding_amount, deadline_source_id, deadline_verification_status,
          responsible_user_id, status_history_json, created_by, updated_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'unverified', ?, ?, ?, ?, ?, ?)`,
      ).bind(
        record.obligationId, record.practiceId, record.clientId, record.taxObligationType,
        record.taxPeriod, record.description, record.filingDeadline, record.paymentDeadline,
        record.filingStatus, record.paymentStatus, record.outstandingAmount, record.deadlineSourceId,
        body.responsibleUserId || null, JSON.stringify(record.statusHistory), principal.userId,
        principal.userId, record.createdAt, record.updatedAt,
      ),
      db.prepare(
        "INSERT INTO phase6_audit_log (id, organization_id, actor_user_id, action, resource_type, resource_id, details_json, occurred_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      ).bind(crypto.randomUUID(), principal.organizationId, principal.userId, "compliance.created", "obligation", record.obligationId,
        JSON.stringify({ clientId: record.clientId, taxType: record.taxObligationType }), now),
      ...supportingDocuments.map((documentId) => db.prepare(
        "INSERT INTO phase6_compliance_documents (organization_id, obligation_id, document_id, added_by, created_at) VALUES (?, ?, ?, ?, ?)",
      ).bind(principal.organizationId, record.obligationId, documentId, principal.userId, now)),
    ];
    await db.batch(statements);
    return response({ obligation: record }, 201, corsFor(request, env));
  }

  if (!obligationId) return null;
  const row = await db.prepare(
    `SELECT ${selectFields} FROM phase6_obligations o WHERE o.organization_id = ? AND o.id = ? LIMIT 1`,
  ).bind(principal.organizationId, obligationId).first();
  if (!row) return response({ error: "Obligation not found." }, 404, corsFor(request, env));
  if (!await auth.requireClientAccess(principal, row.clientId, request.method === "GET" ? "read" : "update", "compliance")) {
    return response({ error: "Obligation not found." }, 404, corsFor(request, env));
  }
  const { results: evidence = [] } = await db.prepare(
    "SELECT document_id AS documentId FROM phase6_compliance_documents WHERE organization_id = ? AND obligation_id = ?",
  ).bind(principal.organizationId, obligationId).all();
  const current = complianceRecordFromRow({
    ...row,
    statusHistory: JSON.parse(row.statusHistoryJson || "[]"),
    supportingDocuments: evidence.map((item) => item.documentId),
  });
  if (request.method === "GET") {
    await audit(db, principal, "compliance.read", "obligation", obligationId);
    return response({ obligation: current }, 200, corsFor(request, env));
  }
  if (request.method !== "PATCH") return response({ error: "Method not allowed." }, 405, corsFor(request, env));
  const body = await jsonBody(request);
  const updated = transitionComplianceEntry(current, body, { actorId: principal.userId });
  const statements = [
    db.prepare(
      `UPDATE phase6_obligations SET filing_status = ?, payment_status = ?, outstanding_amount = ?,
       status_history_json = ?, updated_by = ?, updated_at = ? WHERE organization_id = ? AND id = ?`,
    ).bind(updated.filingStatus, updated.paymentStatus, updated.outstandingAmount, JSON.stringify(updated.statusHistory),
      principal.userId, updated.updatedAt, principal.organizationId, obligationId),
    db.prepare(
      "INSERT INTO phase6_audit_log (id, organization_id, actor_user_id, action, resource_type, resource_id, details_json, occurred_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    ).bind(crypto.randomUUID(), principal.organizationId, principal.userId, "compliance.status-updated", "obligation", obligationId,
      JSON.stringify({ filingStatus: updated.filingStatus, paymentStatus: updated.paymentStatus }), updated.updatedAt),
  ];
  await db.batch(statements);
  return response({ obligation: updated }, 200, corsFor(request, env));
}

async function boundedRequestBytes(request, maximumBytes) {
  const declaredLength = Number(request.headers.get("Content-Length") || 0);
  if (declaredLength > maximumBytes) throw new RangeError("Document request exceeds the maximum size.");
  const reader = request.body?.getReader();
  if (!reader) throw new TypeError("A document body is required.");
  const chunks = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > maximumBytes) {
      await reader.cancel();
      throw new RangeError("Document request exceeds the maximum size.");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function hasBytesPrefix(bytes, prefix) {
  return prefix.every((byte, index) => bytes[index] === byte);
}

function contentMatchesFile(bytes, filename, contentType) {
  if (!isValidFileType(filename, contentType)) return false;
  const extension = filename.split(".").pop().toLowerCase();
  if (extension === "pdf") return new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-";
  if (extension === "png") return hasBytesPrefix(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (extension === "jpg" || extension === "jpeg") return hasBytesPrefix(bytes, [0xff, 0xd8, 0xff]);
  if (extension === "gif") return ["GIF87a", "GIF89a"].includes(new TextDecoder().decode(bytes.slice(0, 6)));
  if (extension === "bmp") return hasBytesPrefix(bytes, [0x42, 0x4d]);
  if (extension === "tiff") return hasBytesPrefix(bytes, [0x49, 0x49, 0x2a, 0x00]) || hasBytesPrefix(bytes, [0x4d, 0x4d, 0x00, 0x2a]);
  if (extension === "xlsx") return hasBytesPrefix(bytes, [0x50, 0x4b, 0x03, 0x04]);
  if (extension === "xls") return hasBytesPrefix(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  if (extension === "csv") {
    if (bytes.includes(0)) return false;
    try {
      new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

function publicDocument(row) {
  const { objectKey, ...safe } = row;
  return safe;
}

async function scanDocument(env, bytes, metadata) {
  if (!env.PHASE6_MALWARE_SCANNER || typeof env.PHASE6_MALWARE_SCANNER.fetch !== "function") return false;
  const scan = await env.PHASE6_MALWARE_SCANNER.fetch("https://phase6-scanner.internal/scan", {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
      "X-Document-SHA256": metadata.sha256,
      "X-Document-Type": metadata.contentType,
    },
    body: bytes,
  });
  if (!scan.ok) return false;
  const result = await scan.json();
  return result?.clean === true;
}

async function handleDocuments(request, env, auth, principal, path) {
  const db = env.UNANSWERED_QUESTIONS;
  const root = `${API_PREFIX}/documents`;
  const downloadMatch = path.match(/^\/api\/phase6\/documents\/([a-z0-9._-]{1,120})\/download$/i);
  const versionMatch = path.match(/^\/api\/phase6\/documents\/([a-z0-9._-]{1,120})\/versions$/i);
  const versionDownloadMatch = path.match(/^\/api\/phase6\/documents\/([a-z0-9._-]{1,120})\/versions\/(\d+)\/download$/i);
  const reviewMatch = path.match(/^\/api\/phase6\/documents\/([a-z0-9._-]{1,120})\/review$/i);
  const proposalCollectionMatch = path.match(/^\/api\/phase6\/documents\/([a-z0-9._-]{1,120})\/proposals$/i);
  const proposalMatch = path.match(/^\/api\/phase6\/proposals\/([a-z0-9._-]{1,120})$/i);
  const documentMatch = path.match(/^\/api\/phase6\/documents\/([a-z0-9._-]{1,120})$/i);

  if (request.method === "POST" && (path === root || versionMatch)) {
    if (!env.PHASE6_DOCUMENTS || typeof env.PHASE6_DOCUMENTS.put !== "function" ||
        typeof env.PHASE6_DOCUMENTS.get !== "function" || typeof env.PHASE6_DOCUMENTS.delete !== "function" ||
        !env.PHASE6_MALWARE_SCANNER) {
      return response({ error: "Private document storage and scanning are not configured." }, 503, corsFor(request, env));
    }
    const requestBytes = await boundedRequestBytes(request, 15 * 1024 * 1024 + 128 * 1024);
    const formRequest = new Request(request.url, { method: "POST", headers: request.headers, body: requestBytes });
    const form = await formRequest.formData();
    const file = form.get("file");
    if (!file || typeof file.arrayBuffer !== "function") throw new TypeError("A file is required.");
    const existing = versionMatch
      ? await db.prepare(
        `SELECT id AS documentId, organization_id AS practiceId, client_id AS clientId,
          document_type AS documentType, file_name AS fileName, content_type AS contentType,
          size_bytes AS sizeBytes, sha256, object_key AS objectKey, tax_period AS taxPeriod,
          transaction_date AS transactionDate, status, version, created_at AS uploadedAt, updated_at AS updatedAt
         FROM phase6_documents WHERE organization_id = ? AND id = ? LIMIT 1`,
      ).bind(principal.organizationId, versionMatch[1]).first()
      : null;
    if (versionMatch && (!existing || existing.status === "archived" ||
        !await auth.requireClientAccess(principal, existing.clientId, "update", "documents"))) {
      return response({ error: "Document not found." }, 404, corsFor(request, env));
    }
    const clientId = existing?.clientId || String(form.get("clientId") || "");
    if (!await auth.requireClientAccess(principal, clientId, existing ? "update" : "create", "documents")) {
      return response({ error: "Client not found." }, 404, corsFor(request, env));
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const fileName = file.name;
    const contentType = file.type;
    const documentType = existing?.documentType || form.get("documentType");
    if (!isValidFileSize(bytes.byteLength, documentType)) throw new RangeError("File size exceeds the selected document type limit.");
    if (!contentMatchesFile(bytes, fileName, contentType)) throw new TypeError("File content does not match its allowed type and declared content type.");
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
    const sha256 = Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
    const clean = await scanDocument(env, bytes, { sha256, contentType });
    if (!clean) return response({ error: "Document scanning is unavailable or the file was rejected." }, 422, corsFor(request, env));

    const now = new Date().toISOString();
    const documentId = existing?.documentId || crypto.randomUUID();
    const versionNumber = Number(existing?.version || 0) + 1;
    const record = createDocumentRecord({
      documentId,
      practiceId: principal.organizationId,
      clientId,
      documentType,
      fileName,
      contentType,
      sizeBytes: bytes.byteLength,
      sha256,
      taxPeriod: form.get("taxPeriod") || null,
      transactionDate: form.get("transactionDate") || null,
      uploadedAt: now,
      updatedAt: now,
    }, { now });
    const objectKey = `${principal.organizationId}/${clientId}/${documentId}/v${versionNumber}/${sha256}`;
    await env.PHASE6_DOCUMENTS.put(objectKey, bytes, {
      httpMetadata: { contentType: "application/octet-stream", contentDisposition: "attachment" },
      customMetadata: { sha256, version: String(versionNumber) },
    });
    try {
      const statements = existing ? [
        db.prepare(
          `UPDATE phase6_documents SET file_name = ?, content_type = ?, size_bytes = ?, sha256 = ?,
           object_key = ?, tax_period = ?, transaction_date = ?, status = 'pending-review',
           version = ?, updated_by = ?, updated_at = ? WHERE organization_id = ? AND id = ? AND version = ?`,
        ).bind(record.fileName, record.contentType, record.sizeBytes, sha256, objectKey,
          record.taxPeriod, record.transactionDate, versionNumber, principal.userId, now,
          principal.organizationId, documentId, existing.version),
        db.prepare(
          `INSERT INTO phase6_document_versions
           (organization_id, document_id, version, object_key, file_name, content_type, size_bytes, sha256, created_by, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).bind(principal.organizationId, documentId, versionNumber, objectKey, record.fileName,
          record.contentType, record.sizeBytes, sha256, principal.userId, now),
        db.prepare(
          "INSERT INTO phase6_audit_log (id, organization_id, actor_user_id, action, resource_type, resource_id, details_json, occurred_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        ).bind(crypto.randomUUID(), principal.organizationId, principal.userId, "document.version-uploaded", "document", documentId,
          JSON.stringify({ clientId, sha256, sizeBytes: record.sizeBytes, version: versionNumber }), now),
      ] : [
        db.prepare(
          `INSERT INTO phase6_documents
           (id, organization_id, client_id, document_type, file_name, content_type, size_bytes,
            sha256, object_key, tax_period, transaction_date, status, version, created_by, updated_by, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending-review', 1, ?, ?, ?, ?)`,
        ).bind(documentId, principal.organizationId, clientId, documentType, record.fileName, record.contentType,
          record.sizeBytes, sha256, objectKey, record.taxPeriod, record.transactionDate, principal.userId,
          principal.userId, now, now),
        db.prepare(
          `INSERT INTO phase6_document_versions
           (organization_id, document_id, version, object_key, file_name, content_type, size_bytes, sha256, created_by, created_at)
           VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?)`,
        ).bind(principal.organizationId, documentId, objectKey, record.fileName, record.contentType, record.sizeBytes, sha256, principal.userId, now),
        db.prepare(
          "INSERT INTO phase6_audit_log (id, organization_id, actor_user_id, action, resource_type, resource_id, details_json, occurred_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        ).bind(crypto.randomUUID(), principal.organizationId, principal.userId, "document.uploaded", "document", documentId,
          JSON.stringify({ clientId, sha256, sizeBytes: record.sizeBytes }), now),
      ];
      await db.batch(statements);
    } catch (error) {
      await env.PHASE6_DOCUMENTS.delete(objectKey);
      throw error;
    }
    return response({ document: publicDocument({ ...record, status: DocumentStatus.PendingReview, version: versionNumber }) }, 201, corsFor(request, env));
  }

  if (versionMatch && request.method === "GET") {
    const document = await db.prepare(
      "SELECT client_id AS clientId FROM phase6_documents WHERE organization_id = ? AND id = ? LIMIT 1",
    ).bind(principal.organizationId, versionMatch[1]).first();
    if (!document || !await auth.requireClientAccess(principal, document.clientId, "read", "documents")) {
      return response({ error: "Document not found." }, 404, corsFor(request, env));
    }
    const { results = [] } = await db.prepare(
      `SELECT version, file_name AS fileName, content_type AS contentType, size_bytes AS sizeBytes,
        sha256, created_at AS createdAt FROM phase6_document_versions
       WHERE organization_id = ? AND document_id = ? ORDER BY version DESC`,
    ).bind(principal.organizationId, versionMatch[1]).all();
    await audit(db, principal, "document.versions-listed", "document", versionMatch[1], { count: results.length });
    return response({ versions: results }, 200, corsFor(request, env));
  }

  if (versionDownloadMatch && request.method === "GET") {
    const version = await db.prepare(
      `SELECT v.object_key AS objectKey, v.file_name AS fileName, v.sha256, d.client_id AS clientId
       FROM phase6_document_versions v JOIN phase6_documents d
         ON d.organization_id = v.organization_id AND d.id = v.document_id
       WHERE v.organization_id = ? AND v.document_id = ? AND v.version = ? LIMIT 1`,
    ).bind(principal.organizationId, versionDownloadMatch[1], Number(versionDownloadMatch[2])).first();
    if (!version || !await auth.requireClientAccess(principal, version.clientId, "read", "documents")) {
      return response({ error: "Document version not found." }, 404, corsFor(request, env));
    }
    if (!env.PHASE6_DOCUMENTS || typeof env.PHASE6_DOCUMENTS.get !== "function") {
      return response({ error: "Private document storage is not configured." }, 503, corsFor(request, env));
    }
    const object = await env.PHASE6_DOCUMENTS.get(version.objectKey);
    if (!object) return response({ error: "Document version not found." }, 404, corsFor(request, env));
    await audit(db, principal, "document.version-downloaded", "document", versionDownloadMatch[1], { version: Number(versionDownloadMatch[2]), sha256: version.sha256 });
    return new Response(object.body, {
      status: 200,
      headers: {
        "Cache-Control": "no-store, private",
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${version.fileName.replace(/["\\]/g, "_")}"`,
        "X-Content-Type-Options": "nosniff",
        ...corsFor(request, env),
      },
    });
  }

  if (request.method === "GET" && path === root) {
    if (!hasPermission(principal.role, "read", "documents")) return response({ error: "Forbidden." }, 403, corsFor(request, env));
    const url = new URL(request.url);
    const clientId = url.searchParams.get("clientId");
    if (clientId && !await auth.requireClientAccess(principal, clientId, "read", "documents")) {
      return response({ documents: [] }, 200, corsFor(request, env));
    }
    const parameters = [principal.organizationId];
    let query = `SELECT id AS documentId, organization_id AS practiceId, client_id AS clientId,
      document_type AS documentType, file_name AS fileName, content_type AS contentType,
      size_bytes AS sizeBytes, sha256, tax_period AS taxPeriod, transaction_date AS transactionDate,
      status, version, created_at AS uploadedAt, updated_at AS updatedAt, object_key AS objectKey
      FROM phase6_documents WHERE organization_id = ?`;
    if (clientId) {
      query += " AND client_id = ?";
      parameters.push(clientId);
    } else if (!["system-admin", "practice-admin"].includes(principal.role)) {
      query += " AND EXISTS (SELECT 1 FROM phase6_client_access ca WHERE ca.organization_id = phase6_documents.organization_id AND ca.client_id = phase6_documents.client_id AND ca.user_id = ?)";
      parameters.push(principal.userId);
    }
    query += " ORDER BY updated_at DESC LIMIT 500";
    const { results = [] } = await db.prepare(query).bind(...parameters).all();
    await audit(db, principal, "documents.listed", "document-list", principal.organizationId, { count: results.length });
    return response({ documents: results.map(publicDocument) }, 200, corsFor(request, env));
  }

  const documentId = downloadMatch?.[1] || versionMatch?.[1] || reviewMatch?.[1] || proposalCollectionMatch?.[1] || documentMatch?.[1];
  if (documentId) {
    const documentAction = reviewMatch && request.method === "POST"
      ? "review"
      : request.method === "GET"
        ? "read"
        : "update";
    const row = await db.prepare(
      `SELECT id AS documentId, organization_id AS practiceId, client_id AS clientId,
        document_type AS documentType, file_name AS fileName, content_type AS contentType,
        size_bytes AS sizeBytes, sha256, object_key AS objectKey, tax_period AS taxPeriod,
        transaction_date AS transactionDate, status, version, created_at AS uploadedAt, updated_at AS updatedAt
       FROM phase6_documents WHERE organization_id = ? AND id = ? LIMIT 1`,
    ).bind(principal.organizationId, documentId).first();
    if (!row || !await auth.requireClientAccess(principal, row.clientId, documentAction, "documents")) {
      return response({ error: "Document not found." }, 404, corsFor(request, env));
    }
    if (downloadMatch && request.method === "GET") {
      if (!env.PHASE6_DOCUMENTS || typeof env.PHASE6_DOCUMENTS.get !== "function") {
        return response({ error: "Private document storage is not configured." }, 503, corsFor(request, env));
      }
      const object = await env.PHASE6_DOCUMENTS.get(row.objectKey);
      if (!object) return response({ error: "Document not found." }, 404, corsFor(request, env));
      await audit(db, principal, "document.downloaded", "document", documentId, { clientId: row.clientId, sha256: row.sha256 });
      const safeAscii = row.fileName.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
      const disposition = `attachment; filename="${safeAscii}"; filename*=UTF-8''${encodeURIComponent(row.fileName)}`;
      return new Response(object.body, {
        status: 200,
        headers: {
          "Cache-Control": "no-store, private",
          "Content-Type": "application/octet-stream",
          "Content-Disposition": disposition,
          "X-Content-Type-Options": "nosniff",
          "Access-Control-Allow-Origin": corsFor(request, env)["Access-Control-Allow-Origin"],
          "Access-Control-Allow-Credentials": "true",
          "Vary": "Origin",
        },
      });
    }
    if (reviewMatch && request.method === "POST") {
      if (!hasPermission(principal.role, "review", "documents")) return response({ error: "Forbidden." }, 403, corsFor(request, env));
      const body = await jsonBody(request);
      const now = new Date().toISOString();
      const updated = transitionDocumentRecord(row, {
        decision: body.decision,
        reviewerId: principal.userId,
        correctedType: body.correctedType,
      }, { now });
      const statements = [
        db.prepare("UPDATE phase6_documents SET document_type = ?, status = ?, updated_by = ?, updated_at = ? WHERE organization_id = ? AND id = ? AND status = ?")
          .bind(updated.documentType, updated.status, principal.userId, now, principal.organizationId, documentId, row.status),
        db.prepare("INSERT INTO phase6_document_reviews (id, organization_id, document_id, reviewer_id, decision, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
          .bind(crypto.randomUUID(), principal.organizationId, documentId, principal.userId, body.decision,
            typeof body.notes === "string" ? body.notes.trim().slice(0, 2000) : "", now),
        db.prepare("INSERT INTO phase6_audit_log (id, organization_id, actor_user_id, action, resource_type, resource_id, details_json, occurred_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
          .bind(crypto.randomUUID(), principal.organizationId, principal.userId, "document.reviewed", "document", documentId,
            JSON.stringify({ clientId: row.clientId, decision: body.decision }), now),
      ];
      const result = await db.batch(statements);
      if ((result[0]?.meta?.changes || 0) === 0) return response({ error: "Document status changed; reload before reviewing." }, 409, corsFor(request, env));
      return response({ document: publicDocument(updated) }, 200, corsFor(request, env));
    }
    if (proposalCollectionMatch && request.method === "POST") {
      const body = await jsonBody(request);
      const proposal = createDocumentAnalysisProposal({
        ...body,
        proposalId: crypto.randomUUID(),
        practiceId: principal.organizationId,
        clientId: row.clientId,
        documentId,
      });
      await db.batch([
        db.prepare(`INSERT INTO phase6_analysis_proposals
          (id, organization_id, client_id, document_id, tax_period, tax_head, field, proposed_json,
           confirmed_json, source_page, confidence, status, created_by, reviewed_by, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, 'proposed', ?, NULL, ?, ?)`)
          .bind(proposal.proposalId, principal.organizationId, row.clientId, documentId, proposal.taxPeriod,
            proposal.taxHead, proposal.field, JSON.stringify(proposal.proposedValue), proposal.sourcePage,
            proposal.confidence, principal.userId, proposal.createdAt, proposal.updatedAt),
        db.prepare("INSERT INTO phase6_audit_log (id, organization_id, actor_user_id, action, resource_type, resource_id, details_json, occurred_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
          .bind(crypto.randomUUID(), principal.organizationId, principal.userId, "document-analysis.proposed", "analysis-proposal", proposal.proposalId,
            JSON.stringify({ clientId: row.clientId, documentId, taxHead: proposal.taxHead }), proposal.createdAt),
      ]);
      return response({ proposal }, 201, corsFor(request, env));
    }
    if (documentMatch && request.method === "GET") return response({ document: publicDocument(row) }, 200, corsFor(request, env));
  }

  if (proposalMatch && request.method === "PATCH") {
    const proposalRow = await db.prepare(
      "SELECT id AS proposalId, organization_id AS practiceId, client_id AS clientId, document_id AS documentId, tax_period AS taxPeriod, tax_head AS taxHead, field, proposed_json AS proposedJson, confirmed_json AS confirmedJson, source_page AS sourcePage, confidence, status, created_at AS createdAt, updated_at AS updatedAt FROM phase6_analysis_proposals WHERE organization_id = ? AND id = ? LIMIT 1",
    ).bind(principal.organizationId, proposalMatch[1]).first();
    if (!proposalRow || !await auth.requireClientAccess(principal, proposalRow.clientId, "review", "documents")) {
      return response({ error: "Proposal not found." }, 404, corsFor(request, env));
    }
    const body = await jsonBody(request);
    const proposal = {
      ...proposalRow,
      proposedValue: JSON.parse(proposalRow.proposedJson),
      confirmedValue: proposalRow.confirmedJson == null ? null : JSON.parse(proposalRow.confirmedJson),
      reviewHistory: [],
    };
    const reviewed = reviewDocumentAnalysisProposal(proposal, {
      decision: body.decision,
      reviewerId: principal.userId,
      correctedValue: body.correctedValue,
    });
    await db.batch([
      db.prepare("UPDATE phase6_analysis_proposals SET confirmed_json = ?, status = ?, reviewed_by = ?, updated_at = ? WHERE organization_id = ? AND id = ? AND status = 'proposed'")
        .bind(reviewed.confirmedValue === null ? null : JSON.stringify(reviewed.confirmedValue), reviewed.status,
          principal.userId, reviewed.updatedAt, principal.organizationId, proposalMatch[1]),
      db.prepare("INSERT INTO phase6_audit_log (id, organization_id, actor_user_id, action, resource_type, resource_id, details_json, occurred_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(crypto.randomUUID(), principal.organizationId, principal.userId, "document-analysis.reviewed", "analysis-proposal", proposalMatch[1],
          JSON.stringify({ decision: body.decision, clientId: proposalRow.clientId }), reviewed.updatedAt),
    ]);
    return response({ proposal: reviewed }, 200, corsFor(request, env));
  }
  return null;
}

function parseScenario(row) {
  return JSON.parse(row.scenarioJson);
}

function reportAnswerForScenario(scenario, question) {
  const result = scenario.resultSnapshot || {};
  return {
    directAnswer: "This saved scenario is a preliminary calculation and review record. No verified legal conclusion or filing determination is available.",
    applicableTaxHead: scenario.taxHeads,
    taxpayerOrTransaction: { scenario: scenario.inputSnapshot.scenario || null },
    taxPeriod: scenario.taxPeriod,
    legalBasis: { statutoryProvisions: [], uraGuidance: [], judicialSources: [], secondaryCommentary: [] },
    statutoryProvisions: [],
    uraGuidance: [],
    caseLaw: [],
    taxTreatment: [],
    computation: { status: "provisional-existing-calculator-output", result },
    assumptions: scenario.assumptions,
    missingInformation: scenario.missingFacts,
    verificationStatus: { adequateVerifiedPrimaryAuthority: false },
    complianceImplications: "Not a filing determination; review each tax head, input and applicable source independently.",
    limitations: [
      "Software tests do not establish tax-law accuracy.",
      "No verified legal source has been linked to this report claim.",
      "The scenario is not a tax return, filing approval, or URA determination.",
    ],
    citations: [],
    auditTrail: { sourceIds: [], caseIds: [], claimCitationIds: [] },
    question,
  };
}

function createReportPayload(scenario, client, body, now) {
  const service = createTaxResearchReportService({
    legalSourceRegistry: createLegalSourceRegistry([]),
    caseLawRegistry: createCaseLawRegistry([]),
    clock: () => new Date(now),
  });
  const answer = reportAnswerForScenario(scenario, body.question);
  const report = service.buildResearchReport({
    answer,
    question: body.question,
    client: { name: client.legalBusinessName, type: client.entityType },
    facts: body.facts || {},
    risks: scenario.resultSnapshot?.riskFlags || [],
    recommendations: body.recommendations || [],
    reportDate: now.slice(0, 10),
  });
  return { report, html: toPrintableHtml(report), citationCsv: toCitationCsv(report) };
}

async function handleScenariosAndReports(request, env, auth, principal, path) {
  const db = env.UNANSWERED_QUESTIONS;
  const scenarioRoot = `${API_PREFIX}/scenarios`;
  const reportRoot = `${API_PREFIX}/reports`;

  if (request.method === "GET" && path === scenarioRoot) {
    if (!hasPermission(principal.role, "read", "scenarios")) return response({ error: "Forbidden." }, 403, corsFor(request, env));
    const url = new URL(request.url);
    const conditions = ["organization_id = ?"];
    const values = [principal.organizationId];
    const clientId = url.searchParams.get("clientId");
    if (clientId) {
      if (!await auth.requireClientAccess(principal, clientId, "read", "scenarios")) return response({ scenarios: [] }, 200, corsFor(request, env));
      conditions.push("client_id = ?");
      values.push(clientId);
    } else if (!["system-admin", "practice-admin"].includes(principal.role)) {
      conditions.push("EXISTS (SELECT 1 FROM phase6_client_access ca WHERE ca.organization_id = phase6_scenarios.organization_id AND ca.client_id = phase6_scenarios.client_id AND ca.user_id = ?)");
      values.push(principal.userId);
    }
    const { results = [] } = await db.prepare(
      `SELECT id AS scenarioId, client_id AS clientId, tax_period AS taxPeriod, status,
        version, scenario_json AS scenarioJson, created_at AS createdAt, updated_at AS updatedAt
       FROM phase6_scenarios WHERE ${conditions.join(" AND ")} ORDER BY updated_at DESC LIMIT 500`,
    ).bind(...values).all();
    await audit(db, principal, "scenarios.listed", "scenario-list", principal.organizationId, { count: results.length });
    return response({ scenarios: results.map((row) => ({ ...parseScenario(row), version: row.version })) }, 200, corsFor(request, env));
  }

  if (request.method === "POST" && path === scenarioRoot) {
    const body = await jsonBody(request);
    if (!hasPermission(principal.role, "create", "scenarios") ||
        !await auth.requireClientAccess(principal, body.clientId, "create", "scenarios")) {
      return response({ error: "Client not found." }, 404, corsFor(request, env));
    }
    if (!body.inputSnapshot || typeof body.inputSnapshot !== "object" || Array.isArray(body.inputSnapshot)) {
      throw new TypeError("inputSnapshot is required.");
    }
    const documentIds = [...new Set(body.documentIds || [])];
    if (documentIds.some((id) => typeof id !== "string" || !id.trim() || id.length > 120)) throw new RangeError("Invalid associated document ID.");
    if (documentIds.length) {
      const placeholders = documentIds.map(() => "?").join(",");
      const { results = [] } = await db.prepare(
        `SELECT id FROM phase6_documents WHERE organization_id = ? AND client_id = ? AND id IN (${placeholders})`,
      ).bind(principal.organizationId, body.clientId, ...documentIds).all();
      if (results.length !== documentIds.length) return response({ error: "One or more documents are unavailable." }, 404, corsFor(request, env));
    }
    if (body.engagementId) {
      const engagement = await db.prepare("SELECT id FROM phase6_engagements WHERE organization_id = ? AND client_id = ? AND id = ?")
        .bind(principal.organizationId, body.clientId, body.engagementId).first();
      if (!engagement) return response({ error: "Engagement not found." }, 404, corsFor(request, env));
    }
    const assessment = assessTransaction(body.inputSnapshot, taxCalculatorModule);
    const now = new Date().toISOString();
    const inputSnapshot = { ...body.inputSnapshot, associatedDocumentIds: documentIds };
    const scenario = createScenarioRecord({
      scenarioId: crypto.randomUUID(),
      practiceId: principal.organizationId,
      clientId: body.clientId,
      taxPeriod: body.taxPeriod ?? null,
      status: "draft",
      inputSnapshot,
      resultSnapshot: assessment,
      taxHeads: assessment.taxHeads.map((head) => head.key),
      ruleIds: [],
      sourceIds: [],
      assumptions: body.assumptions || [],
      missingFacts: assessment.taxHeads.flatMap((head) => head.informationRequired.map((question) => ({ taxHead: head.key, question }))),
      createdAt: now,
      updatedAt: now,
      statusHistory: [{ at: now, actorId: principal.userId, status: "draft" }],
    }, { now });
    const serialized = JSON.stringify(scenario);
    const statements = [
      db.prepare(
        `INSERT INTO phase6_scenarios
         (id, organization_id, client_id, engagement_id, tax_period, status, scenario_json,
          version, created_by, updated_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'draft', ?, 1, ?, ?, ?, ?)`,
      ).bind(scenario.scenarioId, principal.organizationId, scenario.clientId, body.engagementId || null,
        scenario.taxPeriod, serialized, principal.userId, principal.userId, now, now),
      db.prepare(
        "INSERT INTO phase6_scenario_versions (organization_id, scenario_id, version, scenario_json, created_by, created_at) VALUES (?, ?, 1, ?, ?, ?)",
      ).bind(principal.organizationId, scenario.scenarioId, serialized, principal.userId, now),
      ...documentIds.map((documentId) => db.prepare(
        "INSERT INTO phase6_scenario_documents (organization_id, scenario_id, document_id, added_by, created_at) VALUES (?, ?, ?, ?, ?)",
      ).bind(principal.organizationId, scenario.scenarioId, documentId, principal.userId, now)),
      db.prepare("INSERT INTO phase6_audit_log (id, organization_id, actor_user_id, action, resource_type, resource_id, details_json, occurred_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(crypto.randomUUID(), principal.organizationId, principal.userId, "scenario.created", "scenario", scenario.scenarioId,
          JSON.stringify({ clientId: scenario.clientId, taxPeriod: scenario.taxPeriod, documentCount: documentIds.length }), now),
    ];
    await db.batch(statements);
    return response({ scenario: { ...scenario, version: 1 } }, 201, corsFor(request, env));
  }

  const scenarioMatch = path.match(/^\/api\/phase6\/scenarios\/([a-z0-9._-]{1,120})$/i);
  if (scenarioMatch) {
    const row = await db.prepare(
      "SELECT id AS scenarioId, organization_id AS practiceId, client_id AS clientId, tax_period AS taxPeriod, status, version, scenario_json AS scenarioJson FROM phase6_scenarios WHERE organization_id = ? AND id = ? LIMIT 1",
    ).bind(principal.organizationId, scenarioMatch[1]).first();
    if (!row || !await auth.requireClientAccess(principal, row.clientId, request.method === "GET" ? "read" : "update", "scenarios")) {
      return response({ error: "Scenario not found." }, 404, corsFor(request, env));
    }
    if (request.method === "GET") {
      await audit(db, principal, "scenario.read", "scenario", row.scenarioId);
      return response({ scenario: { ...parseScenario(row), version: row.version } }, 200, corsFor(request, env));
    }
    if (request.method !== "PATCH") return response({ error: "Method not allowed." }, 405, corsFor(request, env));
    const body = await jsonBody(request);
    const updated = transitionScenario(parseScenario(row), body.status, { actorId: principal.userId });
    const version = Number(row.version) + 1;
    const serialized = JSON.stringify(updated);
    const results = await db.batch([
      db.prepare("UPDATE phase6_scenarios SET status = ?, scenario_json = ?, version = ?, updated_by = ?, updated_at = ? WHERE organization_id = ? AND id = ? AND version = ?")
        .bind(updated.status, serialized, version, principal.userId, updated.updatedAt, principal.organizationId, row.scenarioId, row.version),
      db.prepare("INSERT INTO phase6_scenario_versions (organization_id, scenario_id, version, scenario_json, created_by, created_at) SELECT ?, ?, ?, ?, ?, ? WHERE changes() = 1")
        .bind(principal.organizationId, row.scenarioId, version, serialized, principal.userId, updated.updatedAt),
      db.prepare("INSERT INTO phase6_audit_log (id, organization_id, actor_user_id, action, resource_type, resource_id, details_json, occurred_at) SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE changes() = 1")
        .bind(crypto.randomUUID(), principal.organizationId, principal.userId, "scenario.status-updated", "scenario", row.scenarioId,
          JSON.stringify({ status: updated.status, version }), updated.updatedAt),
    ]);
    if ((results[0]?.meta?.changes || 0) === 0) return response({ error: "Scenario changed; reload before updating." }, 409, corsFor(request, env));
    return response({ scenario: { ...updated, version } }, 200, corsFor(request, env));
  }

  if (request.method === "GET" && path === reportRoot) {
    if (!hasPermission(principal.role, "read", "reports")) return response({ error: "Forbidden." }, 403, corsFor(request, env));
    const url = new URL(request.url);
    const clientId = url.searchParams.get("clientId");
    const conditions = ["organization_id = ?"];
    const values = [principal.organizationId];
    if (clientId) {
      if (!await auth.requireClientAccess(principal, clientId, "read", "reports")) return response({ reports: [] }, 200, corsFor(request, env));
      conditions.push("client_id = ?");
      values.push(clientId);
    } else if (!["system-admin", "practice-admin"].includes(principal.role)) {
      conditions.push("EXISTS (SELECT 1 FROM phase6_client_access ca WHERE ca.organization_id = phase6_reports.organization_id AND ca.client_id = phase6_reports.client_id AND ca.user_id = ?)");
      values.push(principal.userId);
    }
    const { results = [] } = await db.prepare(
      `SELECT id AS reportId, client_id AS clientId, report_type AS reportType, tax_period AS taxPeriod,
        status, version, created_by AS createdBy, reviewed_by AS reviewedBy, created_at AS createdAt, updated_at AS updatedAt
       FROM phase6_reports WHERE ${conditions.join(" AND ")} ORDER BY updated_at DESC LIMIT 500`,
    ).bind(...values).all();
    await audit(db, principal, "reports.listed", "report-list", principal.organizationId, { count: results.length });
    return response({ reports: results }, 200, corsFor(request, env));
  }

  if (request.method === "POST" && path === reportRoot) {
    const body = await jsonBody(request);
    if (!hasPermission(principal.role, "create", "reports")) return response({ error: "Forbidden." }, 403, corsFor(request, env));
    const scenarioRow = await db.prepare(
      "SELECT id AS scenarioId, organization_id AS practiceId, client_id AS clientId, tax_period AS taxPeriod, scenario_json AS scenarioJson FROM phase6_scenarios WHERE organization_id = ? AND id = ? LIMIT 1",
    ).bind(principal.organizationId, body.scenarioId).first();
    if (!scenarioRow || !await auth.requireClientAccess(principal, scenarioRow.clientId, "create", "reports")) {
      return response({ error: "Scenario not found." }, 404, corsFor(request, env));
    }
    const scenario = parseScenario(scenarioRow);
    const client = await db.prepare("SELECT legal_business_name AS legalBusinessName, entity_type AS entityType FROM phase6_clients WHERE organization_id = ? AND id = ?")
      .bind(principal.organizationId, scenario.clientId).first();
    if (!client) return response({ error: "Client not found." }, 404, corsFor(request, env));
    if (typeof body.question !== "string" || !body.question.trim()) throw new TypeError("A report question is required.");
    const now = new Date().toISOString();
    const payload = createReportPayload(scenario, client, body, now);
    const record = createClientReportRecord({
      reportId: crypto.randomUUID(),
      practiceId: principal.organizationId,
      clientId: scenario.clientId,
      reportType: body.reportType || "tax-scenario-review",
      taxPeriod: scenario.taxPeriod,
      scenarioIds: [scenario.scenarioId],
      sourceIds: [],
    }, { now });
    const reportJson = JSON.stringify(payload.report);
    await db.batch([
      db.prepare(
        `INSERT INTO phase6_reports
         (id, organization_id, client_id, engagement_id, scenario_id, report_type, tax_period,
          status, report_json, version, created_by, reviewed_by, review_notes, created_at, updated_at)
         VALUES (?, ?, ?, NULL, ?, ?, ?, 'review-required', ?, 1, ?, NULL, NULL, ?, ?)`,
      ).bind(record.reportId, principal.organizationId, scenario.clientId, scenario.scenarioId, record.reportType,
        record.taxPeriod, reportJson, principal.userId, now, now),
      db.prepare("INSERT INTO phase6_report_versions (organization_id, report_id, version, report_json, status, created_by, created_at) VALUES (?, ?, 1, ?, 'review-required', ?, ?)")
        .bind(principal.organizationId, record.reportId, reportJson, principal.userId, now),
      db.prepare("INSERT INTO phase6_audit_log (id, organization_id, actor_user_id, action, resource_type, resource_id, details_json, occurred_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(crypto.randomUUID(), principal.organizationId, principal.userId, "report.created", "report", record.reportId,
          JSON.stringify({ clientId: record.clientId, scenarioId: scenario.scenarioId, status: record.status }), now),
    ]);
    return response({ report: { ...record, version: 1 } }, 201, corsFor(request, env));
  }

  const reportDownload = path.match(/^\/api\/phase6\/reports\/([a-z0-9._-]{1,120})\/download$/i);
  const reportReview = path.match(/^\/api\/phase6\/reports\/([a-z0-9._-]{1,120})\/review$/i);
  const reportMatch = path.match(/^\/api\/phase6\/reports\/([a-z0-9._-]{1,120})$/i);
  const reportId = reportDownload?.[1] || reportReview?.[1] || reportMatch?.[1];
  if (!reportId) return null;
  const row = await db.prepare(
    `SELECT id AS reportId, organization_id AS practiceId, client_id AS clientId, report_type AS reportType,
      tax_period AS taxPeriod, status, report_json AS reportJson, version, created_by AS createdBy,
      reviewed_by AS reviewedBy, review_notes AS reviewNotes, created_at AS createdAt, updated_at AS updatedAt
     FROM phase6_reports WHERE organization_id = ? AND id = ? LIMIT 1`,
  ).bind(principal.organizationId, reportId).first();
  if (!row || !await auth.requireClientAccess(principal, row.clientId, request.method === "GET" ? "read" : "review", "reports")) {
    return response({ error: "Report not found." }, 404, corsFor(request, env));
  }
  if (reportDownload && request.method === "GET") {
    const report = JSON.parse(row.reportJson);
    const format = new URL(request.url).searchParams.get("format") || "html";
    await audit(db, principal, "report.downloaded", "report", reportId, { format, version: row.version });
    if (format === "html") {
      return new Response(toPrintableHtml(report), {
        status: 200,
        headers: {
          "Cache-Control": "no-store, private",
          "Content-Type": "text/html; charset=utf-8",
          "Content-Disposition": `attachment; filename="tax-report-${encodeURIComponent(reportId)}.html"`,
          "X-Content-Type-Options": "nosniff",
          ...corsFor(request, env),
        },
      });
    }
    if (format === "csv") {
      return new Response(toCitationCsv(report), {
        status: 200,
        headers: {
          "Cache-Control": "no-store, private",
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="tax-report-citations-${encodeURIComponent(reportId)}.csv"`,
          "X-Content-Type-Options": "nosniff",
          ...corsFor(request, env),
        },
      });
    }
    return response({ error: "Choose html or csv format." }, 400, corsFor(request, env));
  }
  if (reportReview && request.method === "POST") {
    if (!hasPermission(principal.role, "approve", "reports")) return response({ error: "Forbidden." }, 403, corsFor(request, env));
    if (row.createdBy === principal.userId) return response({ error: "A report author cannot approve their own report." }, 403, corsFor(request, env));
    if (row.status !== "review-required") return response({ error: "Report is not awaiting review." }, 409, corsFor(request, env));
    const body = await jsonBody(request);
    const status = body.decision === "approve" ? "approved" : body.decision === "reject" ? "rejected" : null;
    if (!status) throw new RangeError("Review decision must be approve or reject.");
    const now = new Date().toISOString();
    const results = await db.batch([
      db.prepare("UPDATE phase6_reports SET status = ?, reviewed_by = ?, review_notes = ?, version = version + 1, updated_at = ? WHERE organization_id = ? AND id = ? AND status = 'review-required' AND created_by != ?")
        .bind(status, principal.userId, typeof body.notes === "string" ? body.notes.trim().slice(0, 2000) : "", now,
          principal.organizationId, reportId, principal.userId),
      db.prepare("INSERT INTO phase6_report_versions (organization_id, report_id, version, report_json, status, created_by, created_at) SELECT ?, ?, ?, ?, ?, ?, ? WHERE changes() = 1")
        .bind(principal.organizationId, reportId, row.version + 1, row.reportJson, status, principal.userId, now),
      db.prepare("INSERT INTO phase6_audit_log (id, organization_id, actor_user_id, action, resource_type, resource_id, details_json, occurred_at) SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE changes() = 1")
        .bind(crypto.randomUUID(), principal.organizationId, principal.userId, `report.${status}`, "report", reportId,
          JSON.stringify({ clientId: row.clientId, version: row.version + 1 }), now),
    ]);
    if ((results[0]?.meta?.changes || 0) === 0) return response({ error: "Report changed or is not awaiting review." }, 409, corsFor(request, env));
    return response({ report: { reportId, status, version: row.version + 1, reviewedBy: principal.userId, updatedAt: now } }, 200, corsFor(request, env));
  }
  if (reportMatch && request.method === "GET") {
    await audit(db, principal, "report.read", "report", reportId, { version: row.version });
    return response({ report: {
      reportId: row.reportId,
      clientId: row.clientId,
      reportType: row.reportType,
      taxPeriod: row.taxPeriod,
      status: row.status,
      version: row.version,
      createdBy: row.createdBy,
      reviewedBy: row.reviewedBy,
      reviewNotes: row.reviewNotes,
      legalVerificationStatus: "not-established",
      updatedAt: row.updatedAt,
    } }, 200, corsFor(request, env));
  }
  return response({ error: "Method not allowed." }, 405, corsFor(request, env));
}

async function handleEngagementsAndDashboard(request, env, auth, principal, path) {
  const db = env.UNANSWERED_QUESTIONS;
  const engagementRoot = `${API_PREFIX}/engagements`;
  if (path === `${API_PREFIX}/dashboard` && request.method === "GET") {
    if (!hasPermission(principal.role, "read", "clients")) return response({ error: "Forbidden." }, 403, corsFor(request, env));
    const url = new URL(request.url);
    const clientId = url.searchParams.get("clientId");
    if (clientId && !await auth.requireClientAccess(principal, clientId, "read", "clients")) {
      return response({ error: "Client not found." }, 404, corsFor(request, env));
    }
    const values = [principal.organizationId];
    const clientClause = clientId ? " AND id = ?" : "";
    const childClientClause = clientId ? " AND client_id = ?" : "";
    if (clientId) values.push(clientId);
    const accessClause = !clientId && !["system-admin", "practice-admin"].includes(principal.role)
      ? " AND EXISTS (SELECT 1 FROM phase6_client_access ca WHERE ca.organization_id = phase6_clients.organization_id AND ca.client_id = phase6_clients.id AND ca.user_id = ?)"
      : "";
    const scopedValues = accessClause ? [...values, principal.userId] : values;
    const clientCounts = await db.prepare(
      `SELECT COUNT(*) AS totalClients,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS activeClients
       FROM phase6_clients WHERE organization_id = ?${clientClause}${accessClause}`,
    ).bind(...scopedValues).first();
    const categoryRows = await db.prepare(
      `SELECT taxpayer_category AS category, COUNT(*) AS count FROM phase6_clients
       WHERE organization_id = ?${clientClause}${accessClause} GROUP BY taxpayer_category ORDER BY taxpayer_category`,
    ).bind(...scopedValues).all();
    const obligationCounts = await db.prepare(
      `SELECT COUNT(*) AS totalObligations,
        SUM(CASE WHEN filing_status = 'overdue' OR payment_status = 'overdue' THEN 1 ELSE 0 END) AS overdueTasks,
        SUM(CASE WHEN filing_deadline >= date('now') AND filing_deadline <= date('now', '+30 day') THEN 1 ELSE 0 END) AS upcomingDeadlines
      FROM phase6_obligations o WHERE organization_id = ?${childClientClause}${!clientId && !["system-admin", "practice-admin"].includes(principal.role) ? " AND EXISTS (SELECT 1 FROM phase6_client_access ca WHERE ca.organization_id = o.organization_id AND ca.client_id = o.client_id AND ca.user_id = ?)" : ""}`,
    ).bind(...scopedValues).first();
    const documentCounts = await db.prepare(
      `SELECT COUNT(*) AS pendingDocuments FROM phase6_documents d
      WHERE organization_id = ? AND status = 'pending-review'${childClientClause}${!clientId && !["system-admin", "practice-admin"].includes(principal.role) ? " AND EXISTS (SELECT 1 FROM phase6_client_access ca WHERE ca.organization_id = d.organization_id AND ca.client_id = d.client_id AND ca.user_id = ?)" : ""}`,
    ).bind(...scopedValues).first();
    const engagementCounts = await db.prepare(
      `SELECT SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completedEngagements,
        SUM(CASE WHEN status IN ('pending', 'active') THEN 1 ELSE 0 END) AS pendingEngagements
      FROM phase6_engagements e WHERE organization_id = ?${childClientClause}${!clientId && !["system-admin", "practice-admin"].includes(principal.role) ? " AND EXISTS (SELECT 1 FROM phase6_client_access ca WHERE ca.organization_id = e.organization_id AND ca.client_id = e.client_id AND ca.user_id = ?)" : ""}`,
    ).bind(...scopedValues).first();
    const reportCounts = await db.prepare(
      `SELECT COUNT(*) AS reportsAwaitingReview FROM phase6_reports r
      WHERE organization_id = ? AND status = 'review-required'${childClientClause}${!clientId && !["system-admin", "practice-admin"].includes(principal.role) ? " AND EXISTS (SELECT 1 FROM phase6_client_access ca WHERE ca.organization_id = r.organization_id AND ca.client_id = r.client_id AND ca.user_id = ?)" : ""}`,
    ).bind(...scopedValues).first();
    const analyticsService = createOperationsAnalyticsService({
      enabled: env.PHASE10_OPERATIONS_ANALYTICS_ENABLED === "true",
    });
    const analytics = analyticsService.summarize({
      totalClients: Number(clientCounts?.totalClients || 0),
      activeClients: Number(clientCounts?.activeClients || 0),
      totalObligations: Number(obligationCounts?.totalObligations || 0),
      overdueTasks: Number(obligationCounts?.overdueTasks || 0),
      pendingDocuments: Number(documentCounts?.pendingDocuments || 0),
      pendingEngagements: Number(engagementCounts?.pendingEngagements || 0),
      reportsAwaitingReview: Number(reportCounts?.reportsAwaitingReview || 0),
    });
    let consultantWorkload = [];
    let organizationActivity = [];
    if (["system-admin", "practice-admin"].includes(principal.role) && !clientId) {
      const workload = await db.prepare(
        `SELECT assigned_consultant_id AS consultantId, COUNT(*) AS activeEngagements
         FROM phase6_engagements WHERE organization_id = ? AND status = 'active'
         GROUP BY assigned_consultant_id ORDER BY activeEngagements DESC`,
      ).bind(principal.organizationId).all();
      consultantWorkload = workload.results || [];
      const activity = await db.prepare(
        `SELECT action, resource_type AS resourceType, occurred_at AS occurredAt
         FROM phase6_audit_log WHERE organization_id = ? ORDER BY occurred_at DESC LIMIT 20`,
      ).bind(principal.organizationId).all();
      organizationActivity = activity.results || [];
    }
    await audit(db, principal, "dashboard.read", "dashboard", clientId || principal.organizationId, { scope: clientId ? "client" : "authorized" });
    return response({
      asOf: new Date().toISOString(),
      scope: clientId ? "client" : ["system-admin", "practice-admin"].includes(principal.role) ? "organization" : "assigned-clients",
      totalClients: Number(clientCounts?.totalClients || 0),
      activeClients: Number(clientCounts?.activeClients || 0),
      classifications: categoryRows.results || [],
      totalObligations: Number(obligationCounts?.totalObligations || 0),
      upcomingDeadlines: Number(obligationCounts?.upcomingDeadlines || 0),
      overdueTasks: Number(obligationCounts?.overdueTasks || 0),
      pendingDocuments: Number(documentCounts?.pendingDocuments || 0),
      completedEngagements: Number(engagementCounts?.completedEngagements || 0),
      pendingEngagements: Number(engagementCounts?.pendingEngagements || 0),
      reportsAwaitingReview: Number(reportCounts?.reportsAwaitingReview || 0),
      analytics,
      consultantWorkload,
      organizationActivity,
      deadlineCaveat: "Deadline counts use stored user-entered dates and do not establish statutory accuracy.",
    }, 200, corsFor(request, env));
  }

  if (request.method === "GET" && path === engagementRoot) {
    if (!hasPermission(principal.role, "read", "engagements")) return response({ error: "Forbidden." }, 403, corsFor(request, env));
    const url = new URL(request.url);
    const clientId = url.searchParams.get("clientId");
    const values = [principal.organizationId];
    let query = `SELECT id AS engagementId, client_id AS clientId, title, service_type AS serviceType,
      status, assigned_consultant_id AS assignedConsultantId, created_by AS createdBy,
      created_at AS createdAt, updated_at AS updatedAt, completed_at AS completedAt
      FROM phase6_engagements e WHERE organization_id = ?`;
    if (clientId) {
      if (!await auth.requireClientAccess(principal, clientId, "read", "engagements")) return response({ engagements: [] }, 200, corsFor(request, env));
      query += " AND client_id = ?";
      values.push(clientId);
    } else if (!["system-admin", "practice-admin"].includes(principal.role)) {
      query += " AND EXISTS (SELECT 1 FROM phase6_client_access ca WHERE ca.organization_id = e.organization_id AND ca.client_id = e.client_id AND ca.user_id = ?)";
      values.push(principal.userId);
    }
    query += " ORDER BY updated_at DESC LIMIT 500";
    const { results = [] } = await db.prepare(query).bind(...values).all();
    await audit(db, principal, "engagements.listed", "engagement-list", principal.organizationId, { count: results.length });
    return response({ engagements: results }, 200, corsFor(request, env));
  }

  if (request.method === "POST" && path === engagementRoot) {
    const body = await jsonBody(request);
    if (!await auth.requireClientAccess(principal, body.clientId, "create", "engagements")) return response({ error: "Client not found." }, 404, corsFor(request, env));
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const serviceType = typeof body.serviceType === "string" ? body.serviceType.trim() : "";
    if (!title || title.length > 200 || !serviceType || serviceType.length > 120) throw new RangeError("Engagement title and serviceType are required and bounded.");
    if (body.assignedConsultantId) {
      const assignee = await db.prepare(
        "SELECT m.role FROM phase6_memberships m WHERE m.organization_id = ? AND m.user_id = ? AND m.status = 'active' LIMIT 1",
      ).bind(principal.organizationId, body.assignedConsultantId).first();
      if (!assignee || !["tax-consultant", "accountant"].includes(assignee.role)) return response({ error: "Assigned consultant is unavailable." }, 404, corsFor(request, env));
    }
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await db.batch([
      db.prepare(`INSERT INTO phase6_engagements
        (id, organization_id, client_id, title, service_type, status, assigned_consultant_id, created_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)`)
        .bind(id, principal.organizationId, body.clientId, title, serviceType, body.assignedConsultantId || null, principal.userId, now, now),
      db.prepare("INSERT INTO phase6_audit_log (id, organization_id, actor_user_id, action, resource_type, resource_id, details_json, occurred_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(crypto.randomUUID(), principal.organizationId, principal.userId, "engagement.created", "engagement", id,
          JSON.stringify({ clientId: body.clientId, serviceType }), now),
    ]);
    return response({ engagement: { engagementId: id, clientId: body.clientId, title, serviceType, status: "pending", assignedConsultantId: body.assignedConsultantId || null, createdAt: now, updatedAt: now } }, 201, corsFor(request, env));
  }

  const engagementMatch = path.match(/^\/api\/phase6\/engagements\/([a-z0-9._-]{1,120})$/i);
  if (engagementMatch && request.method === "PATCH") {
    const row = await db.prepare(
      "SELECT id AS engagementId, client_id AS clientId, status FROM phase6_engagements WHERE organization_id = ? AND id = ? LIMIT 1",
    ).bind(principal.organizationId, engagementMatch[1]).first();
    if (!row || !await auth.requireClientAccess(principal, row.clientId, "update", "engagements")) return response({ error: "Engagement not found." }, 404, corsFor(request, env));
    const body = await jsonBody(request);
    const transitions = {
      pending: ["active", "cancelled"],
      active: ["completed", "cancelled"],
      completed: [],
      cancelled: [],
    };
    if (!transitions[row.status]?.includes(body.status)) throw new RangeError("Invalid engagement status transition.");
    const now = new Date().toISOString();
    const completedAt = body.status === "completed" ? now : null;
    const results = await db.batch([
      db.prepare("UPDATE phase6_engagements SET status = ?, updated_at = ?, completed_at = ? WHERE organization_id = ? AND id = ? AND status = ?")
        .bind(body.status, now, completedAt, principal.organizationId, row.engagementId, row.status),
      db.prepare("UPDATE phase6_clients SET engagement_status = ?, updated_by = ?, updated_at = ? WHERE organization_id = ? AND id = ?")
        .bind(body.status === "completed" ? "completed" : body.status === "active" ? "active" : "pending", principal.userId, now, principal.organizationId, row.clientId),
      db.prepare("INSERT INTO phase6_audit_log (id, organization_id, actor_user_id, action, resource_type, resource_id, details_json, occurred_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(crypto.randomUUID(), principal.organizationId, principal.userId, "engagement.status-updated", "engagement", row.engagementId,
          JSON.stringify({ clientId: row.clientId, from: row.status, to: body.status }), now),
    ]);
    if ((results[0]?.meta?.changes || 0) === 0) return response({ error: "Engagement changed; reload before updating." }, 409, corsFor(request, env));
    return response({ engagement: { engagementId: row.engagementId, clientId: row.clientId, status: body.status, updatedAt: now, completedAt } }, 200, corsFor(request, env));
  }
  return null;
}

export async function handlePhase6Request(request, env) {
  const corsHeaders = corsFor(request, env);
  if (!corsHeaders) return response({ error: "Origin is not allowed." }, 403, {});
  if (request.method === "OPTIONS") return response(null, 204, corsHeaders);
  const url = new URL(request.url);
  if (!url.pathname.startsWith(API_PREFIX)) return response({ error: "Not found." }, 404, corsHeaders);
  const deploymentReadiness = validateDeploymentReadiness(env);
  if (!deploymentReadiness.isReady) {
    return response({
      error: "Phase 6 operations are disabled until security, at-rest protection, and backup/restore prerequisites are reviewed.",
      missingFlags: deploymentReadiness.missingFlags,
      missingBindings: deploymentReadiness.missingBindings,
      warnings: deploymentReadiness.warnings,
    }, 503, corsHeaders);
  }
  if (!env.UNANSWERED_QUESTIONS) return response({ error: "Phase 6 database is not configured." }, 503, corsHeaders);
  let limit;
  try {
    limit = await requestLimiter(request, env, "phase6");
  } catch {
    return response({ error: "Service temporarily unavailable." }, 503, corsHeaders);
  }
  if (!limit) return response({ error: "Rate limiter is not configured." }, 503, corsHeaders);
  if (!limit.success) return response({ error: "Too many requests." }, 429, corsHeaders);

  const auth = makeAuth(env);
  const path = url.pathname;
  try {
    if (path === `${API_PREFIX}/auth/bootstrap` && request.method === "POST") {
      const body = await jsonBody(request);
      const organization = await auth.bootstrap({
        secret: request.headers.get("X-Phase6-Bootstrap"),
        expectedSecret: env.PHASE6_BOOTSTRAP_SECRET,
        organizationName: body.organizationName,
        email: body.email,
        password: body.password,
      });
      return response({ organization }, 201, corsHeaders);
    }
    if (path === `${API_PREFIX}/auth/login` && request.method === "POST") {
      const body = await jsonBody(request);
      const session = await auth.login(body);
      return response({ principal: session.principal, csrfToken: session.csrfToken, expiresAt: session.expiresAt }, 200, corsHeaders, {
        "Set-Cookie": sessionCookie(session.sessionToken),
      });
    }
    if (path === `${API_PREFIX}/auth/password-reset/request` && request.method === "POST") {
      const body = await jsonBody(request);
      return response(await auth.requestPasswordReset(body.email), 202, corsHeaders);
    }
    if (path === `${API_PREFIX}/auth/password-reset/confirm` && request.method === "POST") {
      const body = await jsonBody(request);
      if (!await auth.resetPassword(body.token, body.password)) return response({ error: "Reset token is invalid or expired." }, 400, corsHeaders);
      return response({ reset: true }, 200, corsHeaders);
    }

    const session = await authenticate(request, auth);
    if (!session) return response({ error: "Authentication required." }, 401, corsHeaders);
    const principal = session.principal;
    if (path === `${API_PREFIX}/auth/me` && request.method === "GET") return response({ principal, expiresAt: session.expiresAt }, 200, corsHeaders);
    if (path === `${API_PREFIX}/governance/readiness` && request.method === "GET") {
      if (!hasPermission(principal.role, "read", "users")) {
        return response({ error: "Forbidden." }, 403, corsHeaders);
      }
      const readiness = getCommercialLaunchReadiness(env);
      await audit(env.UNANSWERED_QUESTIONS, principal, "governance.readiness-viewed", "launch-readiness", principal.organizationId, {
        status: readiness.status,
      });
      return response({ readiness }, 200, corsHeaders);
    }
    if (path === `${API_PREFIX}/auth/logout` && request.method === "POST") {
      if (!await checkCsrf(request, auth, session)) return response({ error: "CSRF validation failed." }, 403, corsHeaders);
      await auth.logout(session);
      return response({ loggedOut: true }, 200, corsHeaders, { "Set-Cookie": clearSessionCookie() });
    }
    if (request.method !== "GET") {
      if (!await checkCsrf(request, auth, session)) return response({ error: "CSRF validation failed." }, 403, corsHeaders);
    }
    const userResult = await handleUsers(request, env, auth, principal, path);
    if (userResult) return userResult;
    const clientResult = await handleClients(request, env, auth, principal, path);
    if (clientResult) return clientResult;
    const complianceResult = await handleCompliance(request, env, auth, principal, path);
    if (complianceResult) return complianceResult;
    const documentResult = await handleDocuments(request, env, auth, principal, path);
    if (documentResult) return documentResult;
    const scenarioReportResult = await handleScenariosAndReports(request, env, auth, principal, path);
    if (scenarioReportResult) return scenarioReportResult;
    const engagementDashboardResult = await handleEngagementsAndDashboard(request, env, auth, principal, path);
    if (engagementDashboardResult) return engagementDashboardResult;
    return response({ error: "Not found." }, 404, corsHeaders);
  } catch (error) {
    if (error instanceof RangeError || error instanceof TypeError || error instanceof SyntaxError) {
      return response({ error: error.message }, 400, corsHeaders);
    }
    if (/unique|constraint/i.test(error instanceof Error ? error.message : "")) {
      return response({ error: "The record conflicts with existing data." }, 409, corsHeaders);
    }
    if (/Invalid credentials|Bootstrap authorization failed/.test(error instanceof Error ? error.message : "")) {
      return response({ error: "Authentication failed." }, 401, corsHeaders);
    }
    console.error("Phase 6 request failed", { errorName: error instanceof Error ? error.name : "UnknownError" });
    return response({ error: "Phase 6 request failed." }, 500, corsHeaders);
  }
}