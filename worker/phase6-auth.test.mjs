import assert from "node:assert/strict";
import test from "node:test";
import {
  clearSessionCookie,
  createPhase6AuthService,
  hashPassword,
  hasPermission,
  phase6AuthConstants,
  readSessionCookie,
  sessionCookie,
  verifyPassword,
} from "./phase6-auth.mjs";

const bootstrapSecret = "synthetic-only-bootstrap-secret-32-characters";
const password = "SyntheticPassword-2026";
const resetPassword = "ReplacementPassword-2026";

class D1Fake {
  constructor() {
    this.organizations = [];
    this.users = [];
    this.memberships = [];
    this.sessions = [];
    this.resets = [];
    this.clientAccess = [];
    this.bootstrapState = [];
  }

  prepare(sql) {
    return {
      bind: (...values) => ({
        first: async () => this.first(sql, values),
        run: async () => this.run(sql, values),
        all: async () => ({ results: [] }),
      }),
    };
  }

  async batch(statements) {
    const backup = structuredClone({
      organizations: this.organizations,
      users: this.users,
      memberships: this.memberships,
      sessions: this.sessions,
      resets: this.resets,
      bootstrapState: this.bootstrapState,
    });
    try {
      const results = [];
      for (const statement of statements) {
        results.push(await statement.run());
      }
      return results;
    } catch (error) {
      Object.assign(this, backup);
      throw error;
    }
  }

  async first(sql, values) {
    if (sql.includes("FROM phase6_users u") && sql.includes("JOIN phase6_memberships")) {
      const [email, organizationId] = values;
      const user = this.users.find((item) => item.email === email);
      const membership = this.memberships.find((item) => item.userId === user?.id && item.organizationId === organizationId && item.status === "active");
      return user && membership ? {
        userId: user.id,
        email: user.email,
        passwordHash: user.passwordHash,
        status: user.status,
        failedAttempts: user.failedAttempts,
        lockedUntil: user.lockedUntil,
        organizationId: membership.organizationId,
        role: membership.role,
      } : null;
    }
    if (sql.includes("FROM phase6_sessions s")) {
      const [sessionHash, currentTime] = values;
      const session = this.sessions.find((item) => item.sessionHash === sessionHash && !item.revokedAt && item.expiresAt > currentTime);
      if (!session) return null;
      const user = this.users.find((item) => item.id === session.userId);
      const membership = this.memberships.find((item) => item.userId === session.userId && item.organizationId === session.organizationId);
      return user && membership ? {
        sessionHash: session.sessionHash,
        csrfHash: session.csrfHash,
        expiresAt: session.expiresAt,
        userId: user.id,
        email: user.email,
        userStatus: user.status,
        organizationId: membership.organizationId,
        role: membership.role,
        membershipStatus: membership.status,
      } : null;
    }
    if (sql.includes("SELECT 1 AS allowed FROM phase6_client_access")) {
      const [organizationId, userId, clientId] = values;
      return this.clientAccess.some((item) => item.organizationId === organizationId && item.userId === userId && item.clientId === clientId)
        ? { allowed: 1 }
        : null;
    }
    if (sql.includes("SELECT id FROM phase6_users WHERE email")) {
      const user = this.users.find((item) => item.email === values[0] && item.status !== "inactive");
      return user ? { id: user.id } : null;
    }
    return null;
  }

  async run(sql, values) {
    if (sql.includes("INSERT INTO phase6_bootstrap_state")) {
      if (this.bootstrapState.length) throw new Error("duplicate bootstrap");
      this.bootstrapState.push({ stateKey: "initial-admin-created", completedAt: values[0] });
      return { meta: { changes: 1 } };
    }
    if (sql.includes("INSERT INTO phase6_organizations")) {
      this.organizations.push({ id: values[0], name: values[1] });
      return { meta: { changes: 1 } };
    }
    if (sql.includes("INSERT INTO phase6_users")) {
      this.users.push({ id: values[0], email: values[1], passwordHash: values[2], status: "active", failedAttempts: 0, lockedUntil: null });
      return { meta: { changes: 1 } };
    }
    if (sql.includes("INSERT INTO phase6_memberships")) {
      this.memberships.push({ organizationId: values[0], userId: values[1], role: "system-admin", status: "active" });
      return { meta: { changes: 1 } };
    }
    if (sql.includes("INSERT INTO phase6_sessions")) {
      this.sessions.push({ sessionHash: values[0], organizationId: values[1], userId: values[2], csrfHash: values[3], expiresAt: values[5], revokedAt: null });
      return { meta: { changes: 1 } };
    }
    if (sql.includes("INSERT INTO phase6_password_resets")) {
      this.resets.push({ tokenHash: values[0], userId: values[1], expiresAt: values[3], consumedAt: null });
      return { meta: { changes: 1 } };
    }
    if (sql.includes("SET failed_login_attempts = ?")) {
      const [failedAttempts, status, lockedUntil, , userId] = values;
      const user = this.users.find((item) => item.id === userId);
      Object.assign(user, { failedAttempts, status, lockedUntil });
      return { meta: { changes: 1 } };
    }
    if (sql.includes("SET failed_login_attempts = 0")) {
      const user = this.users.find((item) => item.id === values[1]);
      Object.assign(user, { failedAttempts: 0, status: "active", lockedUntil: null });
      return { meta: { changes: 1 } };
    }
    if (sql.includes("SET last_seen_at = ?")) return { meta: { changes: 1 } };
    if (sql.includes("SET revoked_at = ? WHERE session_hash")) {
      const session = this.sessions.find((item) => item.sessionHash === values[1] && !item.revokedAt);
      if (!session) return { meta: { changes: 0 } };
      session.revokedAt = values[0];
      return { meta: { changes: 1 } };
    }
    if (sql.includes("SET consumed_at = ? WHERE token_hash")) {
      const reset = this.resets.find((item) => item.tokenHash === values[1] && !item.consumedAt && item.expiresAt > values[2]);
      if (!reset) return { meta: { changes: 0 } };
      reset.consumedAt = values[0];
      return { meta: { changes: 1 } };
    }
    if (sql.includes("SET password_hash = ?")) {
      const [, , tokenHash, currentTime] = values;
      const reset = this.resets.find((item) => item.tokenHash === tokenHash && !item.consumedAt && item.expiresAt > currentTime);
      if (!reset) return { meta: { changes: 0 } };
      const user = this.users.find((item) => item.id === reset.userId);
      Object.assign(user, { passwordHash: values[0], failedAttempts: 0, status: "active", lockedUntil: null });
      return { meta: { changes: 1 } };
    }
    if (sql.includes("SET revoked_at = ? WHERE user_id = (SELECT user_id FROM phase6_password_resets")) {
      const reset = this.resets.find((item) => item.tokenHash === values[1] && !item.consumedAt && item.expiresAt > values[2]);
      if (!reset) return { meta: { changes: 0 } };
      let changes = 0;
      for (const session of this.sessions.filter((item) => item.userId === reset.userId && !item.revokedAt)) {
        session.revokedAt = values[0];
        changes += 1;
      }
      return { meta: { changes } };
    }
    return { meta: { changes: 0 } };
  }
}

test("password hashes use PBKDF2 and reject weak inputs", async () => {
  const hash = await hashPassword(password, { iterations: 100_000 });
  assert.match(hash, /^pbkdf2-sha256\$100000\$/);
  assert.equal(await verifyPassword(password, hash), true);
  assert.equal(await verifyPassword("WrongPassword-2026", hash), false);
  await assert.rejects(() => hashPassword("short1"), /12-128 characters/);
});

test("bootstrap is one-time and login creates hashed, expiring CSRF-protected sessions", async () => {
  const db = new D1Fake();
  let current = new Date("2026-11-04T12:00:00.000Z");
  const auth = createPhase6AuthService({ db, clock: () => current, passwordIterations: 100_000 });
  const owner = await auth.bootstrap({
    secret: bootstrapSecret,
    expectedSecret: bootstrapSecret,
    organizationName: "Synthetic Practice",
    email: "OWNER@example.invalid",
    password,
  });
  assert.equal(owner.role, "system-admin");
  assert.equal(db.users[0].email, "owner@example.invalid");
  assert.match(db.users[0].passwordHash, /^pbkdf2-sha256\$/);
  await assert.rejects(() => auth.bootstrap({
    secret: bootstrapSecret,
    expectedSecret: bootstrapSecret,
    organizationName: "Second Practice",
    email: "other@example.invalid",
    password,
  }), /Bootstrap failed/);
  await assert.rejects(() => auth.bootstrap({
    secret: "wrong-bootstrap-secret-32-characters-long",
    expectedSecret: bootstrapSecret,
    organizationName: "Wrong Secret Practice",
    email: "other@example.invalid",
    password,
  }), /Bootstrap authorization failed/);

  const login = await auth.login({ email: "OWNER@example.invalid", password, organizationId: owner.organizationId });
  assert.equal(db.sessions[0].sessionHash === login.sessionToken, false);
  assert.equal(login.principal.organizationId, owner.organizationId);
  assert.equal(await auth.verifyCsrf(await auth.authenticate(login.sessionToken), login.csrfToken), true);
  assert.equal(await auth.verifyCsrf(await auth.authenticate(login.sessionToken), "wrong-token"), false);
  assert.equal(readSessionCookie(new Request("https://worker.example", {
    headers: { Cookie: sessionCookie(login.sessionToken) },
  })), login.sessionToken);
  assert.match(sessionCookie(login.sessionToken), /HttpOnly; Secure; SameSite=None/);
  assert.match(clearSessionCookie(), /Max-Age=0/);

  current = new Date(login.expiresAt);
  assert.equal(await auth.authenticate(login.sessionToken), null);
});

test("failed logins lock accounts and only authorized roles/actions are granted", async () => {
  const db = new D1Fake();
  let current = new Date("2026-11-04T12:00:00.000Z");
  const auth = createPhase6AuthService({ db, clock: () => current, passwordIterations: 100_000 });
  const owner = await auth.bootstrap({ secret: bootstrapSecret, expectedSecret: bootstrapSecret, organizationName: "Synthetic", email: "owner@example.invalid", password });
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await assert.rejects(() => auth.login({ email: "owner@example.invalid", password: "WrongPassword-2026", organizationId: owner.organizationId }), /Invalid credentials/);
  }
  assert.equal(db.users[0].status, "locked");
  await assert.rejects(() => auth.login({ email: "owner@example.invalid", password, organizationId: owner.organizationId }), /Invalid credentials/);
  current = new Date(current.getTime() + 16 * 60_000);
  const login = await auth.login({ email: "owner@example.invalid", password, organizationId: owner.organizationId });
  assert.equal(login.principal.role, "system-admin");

  for (const role of phase6AuthConstants.ROLES) assert.equal(hasPermission(role, "read", "clients"), true);
  assert.equal(hasPermission("reviewer", "create", "clients"), false);
  assert.equal(hasPermission("client", "approve", "reports"), false);
  assert.equal(hasPermission("unknown", "read", "clients"), false);
  assert.equal(await auth.requireClientAccess({ ...login.principal, role: "tax-consultant" }, "client-a", "read", "clients"), false);
  db.clientAccess.push({ organizationId: owner.organizationId, userId: owner.userId, clientId: "client-a" });
  assert.equal(await auth.requireClientAccess({ ...login.principal, role: "tax-consultant" }, "client-a", "read", "clients"), true);
  assert.equal(await auth.requireClientAccess({ ...login.principal, role: "tax-consultant" }, "client-a", "approve", "reports"), false);

  const active = await auth.authenticate(login.sessionToken);
  assert.equal(await auth.logout(active), true);
  assert.equal(await auth.authenticate(login.sessionToken), null);
});

test("password reset is generic without mail and revokes sessions when delivered", async () => {
  const db = new D1Fake();
  let current = new Date("2026-11-04T12:00:00.000Z");
  let deliveredToken = null;
  const auth = createPhase6AuthService({
    db,
    clock: () => current,
    passwordIterations: 100_000,
    mailer: { async sendPasswordReset({ token }) { deliveredToken = token; } },
  });
  const owner = await auth.bootstrap({ secret: bootstrapSecret, expectedSecret: bootstrapSecret, organizationName: "Synthetic", email: "owner@example.invalid", password });
  const login = await auth.login({ email: "owner@example.invalid", password, organizationId: owner.organizationId });
  assert.deepEqual(await auth.requestPasswordReset("unknown@example.invalid"), { accepted: true });
  assert.deepEqual(await auth.requestPasswordReset("owner@example.invalid"), { accepted: true });
  assert.ok(deliveredToken);
  assert.equal(await auth.resetPassword(deliveredToken, resetPassword), true);
  assert.equal(await auth.resetPassword(deliveredToken, resetPassword), false);
  assert.equal(await auth.authenticate(login.sessionToken), null);
  const replacementLogin = await auth.login({ email: "owner@example.invalid", password: resetPassword, organizationId: owner.organizationId });
  assert.equal(replacementLogin.principal.userId, owner.userId);

  const deliveredBeforeUnavailableRequest = deliveredToken;
  const noMailer = createPhase6AuthService({ db, clock: () => current, passwordIterations: 100_000 });
  assert.deepEqual(await noMailer.requestPasswordReset("owner@example.invalid"), { accepted: true });
  assert.equal(deliveredToken, deliveredBeforeUnavailableRequest);
});
