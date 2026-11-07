const PASSWORD_ITERATIONS = 310_000;
const PASSWORD_SALT_BYTES = 16;
const SESSION_TOKEN_BYTES = 32;
const SESSION_TTL_SECONDS = 8 * 60 * 60;
const RESET_TOKEN_TTL_SECONDS = 30 * 60;
const MAX_FAILED_LOGINS = 5;
const LOCKOUT_MINUTES = 15;
const COOKIE_NAME = "__Host-taxcomp_session";
const dummyHashes = new WeakMap();
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

function base64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64 + "=".repeat((4 - base64.length % 4) % 4));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function assertPassword(password) {
  if (typeof password !== "string" || [...password].length < 12 ||
      [...password].length > 128 || !/[a-z]/i.test(password) || !/\d/.test(password)) {
    throw new RangeError("Password must be 12-128 characters and include a letter and a number.");
  }
  return password;
}

function equalBytes(left, right) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

async function derivePassword(password, salt, cryptoImpl, iterations) {
  const key = await cryptoImpl.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  return new Uint8Array(await cryptoImpl.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256));
}

function getDummyPasswordHash(cryptoImpl, iterations) {
  let hashes = dummyHashes.get(cryptoImpl);
  if (!hashes) {
    hashes = new Map();
    dummyHashes.set(cryptoImpl, hashes);
  }
  if (!hashes.has(iterations)) {
    hashes.set(iterations, hashPassword("TaxComp-Unknown-Account-2026", { cryptoImpl, iterations }));
  }
  return hashes.get(iterations);
}

export async function hashPassword(password, { cryptoImpl = globalThis.crypto, iterations = PASSWORD_ITERATIONS, salt = null } = {}) {
  assertPassword(password);
  if (!cryptoImpl?.subtle || !Number.isInteger(iterations) || iterations < 100_000) {
    throw new TypeError("A Web Crypto implementation and secure PBKDF2 iteration count are required.");
  }
  const saltBytes = salt ? new Uint8Array(salt) : cryptoImpl.getRandomValues(new Uint8Array(PASSWORD_SALT_BYTES));
  const digest = await derivePassword(password, saltBytes, cryptoImpl, iterations);
  return `pbkdf2-sha256$${iterations}$${base64Url(saltBytes)}$${base64Url(digest)}`;
}

export async function verifyPassword(password, encoded, { cryptoImpl = globalThis.crypto } = {}) {
  if (typeof password !== "string" || typeof encoded !== "string" || !cryptoImpl?.subtle) return false;
  const parts = encoded.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2-sha256") return false;
  const iterations = Number(parts[1]);
  if (!Number.isInteger(iterations) || iterations < 100_000 || iterations > 1_000_000) return false;
  try {
    const expected = fromBase64Url(parts[3]);
    if (expected.length !== 32) return false;
    const actual = await derivePassword(password, fromBase64Url(parts[2]), cryptoImpl, iterations);
    return equalBytes(actual, expected);
  } catch {
    return false;
  }
}

export async function hashToken(token, cryptoImpl = globalThis.crypto) {
  const digest = await cryptoImpl.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return base64Url(new Uint8Array(digest));
}

function randomToken(cryptoImpl, byteLength = SESSION_TOKEN_BYTES) {
  return base64Url(cryptoImpl.getRandomValues(new Uint8Array(byteLength)));
}

function normalizeEmail(value) {
  if (typeof value !== "string") throw new RangeError("A valid email is required.");
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new RangeError("A valid email is required.");
  }
  return email;
}

function parseCookies(header = "") {
  const cookies = new Map();
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator <= 0) continue;
    cookies.set(part.slice(0, separator).trim(), part.slice(separator + 1).trim());
  }
  return cookies;
}

export function sessionCookie(token, maxAge = SESSION_TTL_SECONDS) {
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=${maxAge}`;
}

export function clearSessionCookie() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=0`;
}

export function hasPermission(role, action, resource) {
  if (!ROLES.includes(role) || typeof action !== "string" || typeof resource !== "string") return false;
  const allowed = permissionMatrix[role];
  return allowed.includes("*:*" ) || allowed.includes(`${resource}:${action}`) || allowed.includes(`${action}:${resource}`);
}

export function assertRole(role) {
  if (!ROLES.includes(role)) throw new RangeError("Invalid organization role.");
  return role;
}

export function createPhase6AuthService({
  db,
  cryptoImpl = globalThis.crypto,
  clock = () => new Date(),
  mailer = null,
  passwordIterations = PASSWORD_ITERATIONS,
} = {}) {
  if (!db || typeof db.prepare !== "function" || typeof db.batch !== "function") {
    throw new TypeError("A D1-compatible database with prepare() and batch() is required.");
  }
  if (!cryptoImpl?.subtle || typeof clock !== "function" ||
      !Number.isInteger(passwordIterations) || passwordIterations < 100_000 || passwordIterations > 1_000_000) {
    throw new TypeError("Web Crypto, clock, and a secure PBKDF2 iteration count are required.");
  }

  function now() {
    const value = clock();
    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(date.getTime())) throw new TypeError("clock must return a valid date.");
    return date;
  }

  async function bootstrap({ secret, expectedSecret, organizationName, email, password }) {
    if (typeof expectedSecret !== "string" || expectedSecret.length < 32 ||
        typeof secret !== "string" || secret.length !== expectedSecret.length ||
        !equalBytes(new TextEncoder().encode(secret), new TextEncoder().encode(expectedSecret))) {
      throw new Error("Bootstrap authorization failed.");
    }
    const name = typeof organizationName === "string" ? organizationName.trim() : "";
    if (!name || name.length > 160) throw new RangeError("Organization name is required and must be at most 160 characters.");
    const normalizedEmail = normalizeEmail(email);
    const passwordHash = await hashPassword(password, { cryptoImpl, iterations: passwordIterations });
    const organizationId = cryptoImpl.randomUUID();
    const userId = cryptoImpl.randomUUID();
    const createdAt = now().toISOString();
    const statements = [
      db.prepare("INSERT INTO phase6_bootstrap_state (state_key, completed_at) VALUES ('initial-admin-created', ?)").bind(createdAt),
      db.prepare("INSERT INTO phase6_organizations (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)").bind(organizationId, name, createdAt, createdAt),
      db.prepare("INSERT INTO phase6_users (id, email, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)").bind(userId, normalizedEmail, passwordHash, createdAt, createdAt),
      db.prepare("INSERT INTO phase6_memberships (organization_id, user_id, role, created_at) VALUES (?, ?, 'system-admin', ?)").bind(organizationId, userId, createdAt),
    ];
    try {
      await db.batch(statements);
    } catch {
      throw new Error("Bootstrap failed; it may already be complete or the database may be unavailable.");
    }
    return { organizationId, userId, email: normalizedEmail, role: "system-admin", createdAt };
  }

  async function login({ email, password, organizationId }) {
    const normalizedEmail = normalizeEmail(email);
    if (typeof password !== "string" || password.length > 1024) throw new RangeError("Invalid credentials.");
    if (typeof organizationId !== "string" || !organizationId.trim()) throw new RangeError("Invalid credentials.");
    const result = await db.prepare(
      `SELECT u.id AS userId, u.email, u.password_hash AS passwordHash, u.status,
              u.failed_login_attempts AS failedAttempts, u.locked_until AS lockedUntil,
              m.organization_id AS organizationId, m.role
         FROM phase6_users u
         JOIN phase6_memberships m ON m.user_id = u.id
        WHERE u.email = ? AND m.organization_id = ? AND m.status = 'active'
        LIMIT 1`,
    ).bind(normalizedEmail, organizationId).first();
    const currentTime = now();
    const locked = result?.status === "locked" && result.lockedUntil && new Date(result.lockedUntil) > currentTime;
    const lockExpired = result?.status === "locked" && result.lockedUntil && new Date(result.lockedUntil) <= currentTime;
    const accountEligible = result?.status === "active" || lockExpired;
    const storedHash = result?.passwordHash || await getDummyPasswordHash(cryptoImpl, passwordIterations);
    const passwordMatches = await verifyPassword(password, storedHash, { cryptoImpl });
    if (!result || !accountEligible || locked || !passwordMatches) {
      if (accountEligible && !locked) {
        const failedAttempts = Number(result.failedAttempts || 0) + 1;
        const lockedUntil = failedAttempts >= MAX_FAILED_LOGINS
          ? new Date(currentTime.getTime() + LOCKOUT_MINUTES * 60_000).toISOString()
          : null;
        await db.prepare(
          `UPDATE phase6_users SET failed_login_attempts = ?, status = ?, locked_until = ?, updated_at = ? WHERE id = ?`,
        ).bind(failedAttempts, lockedUntil ? "locked" : "active", lockedUntil, currentTime.toISOString(), result.userId).run();
      }
      throw new Error("Invalid credentials.");
    }

    const sessionToken = randomToken(cryptoImpl);
    const csrfToken = randomToken(cryptoImpl);
    const sessionHash = await hashToken(sessionToken, cryptoImpl);
    const csrfHash = await hashToken(csrfToken, cryptoImpl);
    const expiresAt = new Date(currentTime.getTime() + SESSION_TTL_SECONDS * 1000).toISOString();
    await db.batch([
      db.prepare("UPDATE phase6_users SET failed_login_attempts = 0, status = 'active', locked_until = NULL, updated_at = ? WHERE id = ?").bind(currentTime.toISOString(), result.userId),
      db.prepare("INSERT INTO phase6_sessions (session_hash, organization_id, user_id, csrf_hash, created_at, expires_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(sessionHash, result.organizationId, result.userId, csrfHash, currentTime.toISOString(), expiresAt, currentTime.toISOString()),
    ]);
    return {
      principal: { userId: result.userId, email: result.email, organizationId: result.organizationId, role: assertRole(result.role) },
      sessionToken,
      csrfToken,
      expiresAt,
    };
  }

  async function authenticate(sessionToken) {
    if (typeof sessionToken !== "string" || sessionToken.length < 32) return null;
    const sessionHash = await hashToken(sessionToken, cryptoImpl);
    const currentTime = now().toISOString();
    const row = await db.prepare(
      `SELECT s.session_hash AS sessionHash, s.csrf_hash AS csrfHash, s.expires_at AS expiresAt,
              u.id AS userId, u.email, u.status AS userStatus,
              m.organization_id AS organizationId, m.role, m.status AS membershipStatus
         FROM phase6_sessions s
         JOIN phase6_users u ON u.id = s.user_id
         JOIN phase6_memberships m ON m.user_id = s.user_id AND m.organization_id = s.organization_id
        WHERE s.session_hash = ? AND s.revoked_at IS NULL AND s.expires_at > ?
        LIMIT 1`,
    ).bind(sessionHash, currentTime).first();
    if (!row || row.userStatus !== "active" || row.membershipStatus !== "active") return null;
    await db.prepare("UPDATE phase6_sessions SET last_seen_at = ? WHERE session_hash = ? AND revoked_at IS NULL").bind(currentTime, sessionHash).run();
    return {
      principal: { userId: row.userId, email: row.email, organizationId: row.organizationId, role: assertRole(row.role) },
      sessionHash: row.sessionHash,
      csrfHash: row.csrfHash,
      expiresAt: row.expiresAt,
    };
  }

  async function verifyCsrf(session, csrfToken) {
    if (!session?.csrfHash || typeof csrfToken !== "string") return false;
    return equalBytes(
      fromBase64Url(await hashToken(csrfToken, cryptoImpl)),
      fromBase64Url(session.csrfHash),
    );
  }

  async function logout(session) {
    if (!session?.sessionHash) return false;
    const result = await db.prepare("UPDATE phase6_sessions SET revoked_at = ? WHERE session_hash = ? AND revoked_at IS NULL")
      .bind(now().toISOString(), session.sessionHash).run();
    return (result.meta?.changes || 0) > 0;
  }

  async function requestPasswordReset(email, { reportDelivery = false } = {}) {
    const normalizedEmail = normalizeEmail(email);
    const user = await db.prepare("SELECT id FROM phase6_users WHERE email = ? AND status != 'inactive' LIMIT 1").bind(normalizedEmail).first();
    if (!user || typeof mailer?.sendPasswordReset !== "function") {
      await hashPassword("TaxComp-Unknown-Account-2026", { cryptoImpl, iterations: passwordIterations });
      return reportDelivery ? { accepted: true, delivered: false } : { accepted: true };
    }
    const token = randomToken(cryptoImpl);
    const tokenHash = await hashToken(token, cryptoImpl);
    const currentTime = now();
    const expiresAt = new Date(currentTime.getTime() + RESET_TOKEN_TTL_SECONDS * 1000).toISOString();
    await db.prepare("INSERT INTO phase6_password_resets (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
      .bind(tokenHash, user.id, currentTime.toISOString(), expiresAt).run();
    let delivered = true;
    try {
      await mailer.sendPasswordReset({ email: normalizedEmail, token, expiresAt });
    } catch {
      delivered = false;
      await db.prepare("UPDATE phase6_password_resets SET consumed_at = ? WHERE token_hash = ? AND consumed_at IS NULL")
        .bind(currentTime.toISOString(), tokenHash).run();
    }
    return reportDelivery ? { accepted: true, delivered } : { accepted: true };
  }

  async function resetPassword(token, newPassword) {
    assertPassword(newPassword);
    if (typeof token !== "string" || token.length < 32) return false;
    const tokenHash = await hashToken(token, cryptoImpl);
    const passwordHash = await hashPassword(newPassword, { cryptoImpl, iterations: passwordIterations });
    const currentTime = now().toISOString();
    const results = await db.batch([
      db.prepare(
        `UPDATE phase6_users SET password_hash = ?, failed_login_attempts = 0, status = 'active', locked_until = NULL, updated_at = ?
          WHERE id = (SELECT user_id FROM phase6_password_resets WHERE token_hash = ? AND consumed_at IS NULL AND expires_at > ?)`,
      ).bind(passwordHash, currentTime, tokenHash, currentTime),
      db.prepare(
        `UPDATE phase6_sessions SET revoked_at = ? WHERE user_id = (SELECT user_id FROM phase6_password_resets WHERE token_hash = ? AND consumed_at IS NULL AND expires_at > ?) AND revoked_at IS NULL`,
      ).bind(currentTime, tokenHash, currentTime),
      db.prepare("UPDATE phase6_password_resets SET consumed_at = ? WHERE token_hash = ? AND consumed_at IS NULL AND expires_at > ?")
        .bind(currentTime, tokenHash, currentTime),
    ]);
    return (results[0]?.meta?.changes || 0) > 0 && (results[2]?.meta?.changes || 0) > 0;
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
    bootstrap,
    login,
    authenticate,
    verifyCsrf,
    logout,
    requestPasswordReset,
    resetPassword,
    requireClientAccess,
  });
}

export const phase6AuthConstants = Object.freeze({
  PASSWORD_ITERATIONS,
  SESSION_TTL_SECONDS,
  RESET_TOKEN_TTL_SECONDS,
  MAX_FAILED_LOGINS,
  LOCKOUT_MINUTES,
  COOKIE_NAME,
  ROLES,
});

export function readSessionCookie(request) {
  return parseCookies(request.headers.get("Cookie") || "").get(COOKIE_NAME) || null;
}
