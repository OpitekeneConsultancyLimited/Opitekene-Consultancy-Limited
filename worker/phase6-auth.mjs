// Phase 6 authentication and authorization.
//
// Identity: Supabase Auth. The browser signs in with Supabase and sends its
// access token as "Authorization: Bearer <token>"; the Worker verifies it
// locally (worker/supabase-auth.mjs). Passwords, lockout, password reset and
// invitation emails are handled by Supabase Auth, not by this Worker.
//
// Authorization: TaxComp's own tables. A verified Supabase user only gets
// access through an active phase6_memberships row (organization + role) and,
// for non-admin roles, phase6_client_access rows. These are re-checked on every
// request, so deactivating a membership takes effect immediately even though
// the user's Supabase token is still valid until it expires.
//
// Bearer tokens are never sent automatically by browsers, so the API needs no
// CSRF tokens or cookies.

import { readBearerToken } from "./supabase-auth.mjs";

const ROLES = Object.freeze([
  "system-admin",
  "practice-admin",
  "tax-consultant",
  "accountant",
  "reviewer",
  "client",
]);

const permissionMatrix = Object.freeze({
  "system-admin": ["*:*"],
  "practice-admin": [
    "users:read", "users:create", "users:update",
    "clients:read", "clients:create", "clients:update", "clients:archive",
    "profiles:read", "profiles:create", "profiles:update",
    "engagements:read", "engagements:create", "engagements:update",
    "compliance:read", "compliance:create", "compliance:update",
    "documents:read", "documents:create", "documents:update", "documents:review",
    "scenarios:read", "scenarios:create", "scenarios:update",
    "reports:read", "reports:create", "reports:review", "reports:approve",
    "audit:read",
  ],
  "tax-consultant": [
    "clients:read", "profiles:read", "profiles:update",
    "engagements:read", "engagements:create", "engagements:update",
    "compliance:read", "compliance:create", "compliance:update",
    "documents:read", "documents:create", "documents:update",
    "scenarios:read", "scenarios:create", "scenarios:update",
    "reports:read", "reports:create",
  ],
  accountant: [
    "clients:read", "profiles:read",
    "engagements:read", "compliance:read", "compliance:update",
    "documents:read", "documents:create", "documents:update",
    "scenarios:read", "scenarios:create", "scenarios:update",
    "reports:read", "reports:create",
  ],
  reviewer: ["clients:read", "compliance:update", "documents:read", "documents:review", "scenarios:read", "reports:read", "reports:review", "reports:approve", "audit:read"],
  client: ["clients:read", "profiles:read", "engagements:read", "compliance:read", "documents:read", "scenarios:read", "reports:read"],
});

const ORGANIZATION_ID = /^[A-Za-z0-9._-]{1,120}$/;

function equalBytes(left, right) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

export function normalizeEmail(value) {
  if (typeof value !== "string") throw new RangeError("A valid email is required.");
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new RangeError("A valid email is required.");
  }
  return email;
}

export function hasPermission(role, action, resource) {
  if (!ROLES.includes(role) || typeof action !== "string" || typeof resource !== "string") return false;
  const allowed = permissionMatrix[role];
  return allowed.includes("*:*") || allowed.includes(`${resource}:${action}`) || allowed.includes(`${action}:${resource}`);
}

export function assertRole(role) {
  if (!ROLES.includes(role)) throw new RangeError("Invalid organization role.");
  return role;
}

/**
 * @param {object} options
 * @param {object} options.db        D1-compatible database (worker/db.mjs on Supabase)
 * @param {{ verify(token: string): Promise<object|null> }} options.verifier  Supabase token verifier
 * @param {{ inviteUser(email: string, o?: object): Promise<{userId: string|null, alreadyRegistered: boolean}> } | null} [options.admin]
 * @param {() => Date} [options.clock]
 */
export function createPhase6AuthService({ db, verifier, admin = null, clock = () => new Date() } = {}) {
  if (!db || typeof db.prepare !== "function" || typeof db.batch !== "function") {
    throw new TypeError("A D1-compatible database with prepare() and batch() is required.");
  }
  if (!verifier || typeof verifier.verify !== "function") {
    throw new TypeError("A Supabase token verifier is required.");
  }

  const now = () => clock().toISOString();

  async function verifiedIdentity(request) {
    const token = readBearerToken(request);
    if (!token) return null;
    const claims = await verifier.verify(token);
    if (!claims) return null;
    return {
      userId: claims.sub,
      email: typeof claims.email === "string" ? claims.email.toLowerCase() : null,
      expiresAt: new Date(claims.exp * 1000).toISOString(),
    };
  }

  /** Active organizations for a verified user (for the organization picker). */
  async function memberships(userId) {
    const { results = [] } = await db.prepare(
      `SELECT m.organization_id AS organizationId, o.name AS organizationName, m.role
         FROM phase6_memberships m
         JOIN phase6_organizations o ON o.id = m.organization_id
         JOIN phase6_users u ON u.id = m.user_id
        WHERE m.user_id = ? AND m.status = 'active' AND u.status = 'active' AND o.status = 'active'
        ORDER BY o.name LIMIT 50`,
    ).bind(userId).all();
    return results;
  }

  /**
   * Returns { identity, principal, memberships } for a valid token, or null.
   * principal is null when the user has no usable membership, or has several
   * and did not choose one with the X-Organization-Id header.
   */
  async function authenticate(request) {
    const identity = await verifiedIdentity(request);
    if (!identity) return null;
    const requested = request.headers.get("X-Organization-Id");
    if (requested !== null && !ORGANIZATION_ID.test(requested)) return { identity, principal: null, memberships: [] };
    const available = await memberships(identity.userId);
    const chosen = requested
      ? available.find((item) => item.organizationId === requested)
      : available.length === 1 ? available[0] : null;
    const principal = chosen
      ? { userId: identity.userId, email: identity.email, organizationId: chosen.organizationId, role: assertRole(chosen.role) }
      : null;
    return { identity, principal, memberships: available, expiresAt: identity.expiresAt };
  }

  /** One-time creation of the first organization, owned by the calling Supabase user. */
  async function bootstrap({ secret, expectedSecret, organizationName, identity }) {
    if (typeof expectedSecret !== "string" || expectedSecret.length < 32 ||
        typeof secret !== "string" || secret.length !== expectedSecret.length ||
        !equalBytes(new TextEncoder().encode(secret), new TextEncoder().encode(expectedSecret))) {
      throw new Error("Bootstrap authorization failed.");
    }
    if (!identity?.userId || !identity.email) throw new Error("Bootstrap authorization failed.");
    const name = typeof organizationName === "string" ? organizationName.trim() : "";
    if (!name || name.length > 160) throw new RangeError("Organization name is required and must be at most 160 characters.");
    const organizationId = crypto.randomUUID();
    const createdAt = now();
    try {
      await db.batch([
        db.prepare("INSERT INTO phase6_bootstrap_state (state_key, completed_at) VALUES ('initial-admin-created', ?)").bind(createdAt),
        db.prepare("INSERT INTO phase6_organizations (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)").bind(organizationId, name, createdAt, createdAt),
        db.prepare("INSERT INTO phase6_users (id, email, status, created_at, updated_at) VALUES (?, ?, 'active', ?, ?) ON CONFLICT (id) DO NOTHING")
          .bind(identity.userId, identity.email, createdAt, createdAt),
        db.prepare("INSERT INTO phase6_memberships (organization_id, user_id, role, created_at) VALUES (?, ?, 'system-admin', ?)").bind(organizationId, identity.userId, createdAt),
      ]);
    } catch {
      throw new Error("Bootstrap failed; it may already be complete or the database may be unavailable.");
    }
    return { organizationId, userId: identity.userId, email: identity.email, role: "system-admin", createdAt };
  }

  /**
   * Resolves the Supabase user id for an invitee, sending Supabase's invitation
   * email when the address has no account yet. Existing accounts are looked up
   * through taxcomp.auth_user_id_by_email (SECURITY DEFINER, returns the id only).
   */
  async function inviteUser(email, { redirectTo } = {}) {
    if (!admin) throw new Error("Invitations require SUPABASE_SERVICE_ROLE_KEY.");
    const normalized = normalizeEmail(email);
    const existing = await db.prepare("SELECT auth_user_id_by_email(?) AS userId").bind(normalized).first();
    if (existing?.userId) return { userId: existing.userId, email: normalized, invited: false };
    const result = await admin.inviteUser(normalized, { redirectTo });
    if (result.userId) return { userId: result.userId, email: normalized, invited: true };
    const raced = await db.prepare("SELECT auth_user_id_by_email(?) AS userId").bind(normalized).first();
    if (raced?.userId) return { userId: raced.userId, email: normalized, invited: false };
    throw new Error("Could not resolve the invited Supabase user.");
  }

  async function requireClientAccess(principal, clientId, action, resource) {
    if (!principal || !ROLES.includes(principal.role) || !hasPermission(principal.role, action, resource)) return false;
    if (["system-admin", "practice-admin"].includes(principal.role)) return true;
    const access = await db.prepare(
      "SELECT 1 AS allowed FROM phase6_client_access WHERE organization_id = ? AND user_id = ? AND client_id = ? LIMIT 1",
    ).bind(principal.organizationId, principal.userId, clientId).first();
    return Boolean(access);
  }

  return Object.freeze({
    authenticate,
    memberships,
    bootstrap,
    inviteUser,
    requireClientAccess,
  });
}

export const phase6AuthConstants = Object.freeze({ ROLES });
