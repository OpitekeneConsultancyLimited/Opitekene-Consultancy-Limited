// Phase 6 authorization on top of Supabase Auth identities (real Postgres via
// PGlite, real ES256 tokens via the fake Supabase APIs).
import assert from "node:assert/strict";
import test from "node:test";
import { assertRole, createPhase6AuthService, hasPermission, phase6AuthConstants } from "./phase6-auth.mjs";
import { clearSupabaseKeyCache, createSupabaseAdmin, createSupabaseTokenVerifier } from "./supabase-auth.mjs";
import { createMigratedDatabase } from "./pglite-test-support.mjs";
import { createFakeSupabase } from "./supabase-test-fakes.mjs";

const bootstrapSecret = "synthetic-bootstrap-secret-at-least-32-bytes";

async function setup({ withAdmin = true } = {}) {
  clearSupabaseKeyCache();
  const { pg, db } = await createMigratedDatabase();
  const supabase = await createFakeSupabase(pg);
  const auth = createPhase6AuthService({
    db,
    verifier: createSupabaseTokenVerifier({ supabaseUrl: supabase.url, fetchImpl: supabase.fetch }),
    admin: withAdmin ? createSupabaseAdmin({ supabaseUrl: supabase.url, serviceKey: supabase.serviceKey, fetchImpl: supabase.fetch }) : null,
  });
  const requestWith = (token, organizationId) => new Request("https://worker.example/api/phase6/auth/me", {
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(organizationId ? { "X-Organization-Id": organizationId } : {}) },
  });
  return { pg, db, supabase, auth, requestWith };
}

test("role permissions are unchanged by the move to Supabase Auth", () => {
  assert.deepEqual(phase6AuthConstants.ROLES, ["system-admin", "practice-admin", "tax-consultant", "accountant", "reviewer", "client"]);
  assert.equal(hasPermission("system-admin", "delete", "anything"), true);
  assert.equal(hasPermission("practice-admin", "create", "users"), true);
  assert.equal(hasPermission("tax-consultant", "create", "users"), false);
  assert.equal(hasPermission("reviewer", "approve", "reports"), true);
  assert.equal(hasPermission("reviewer", "read", "compliance"), false);
  assert.equal(hasPermission("client", "update", "clients"), false);
  assert.equal(hasPermission("not-a-role", "read", "clients"), false);
  assert.throws(() => assertRole("owner"), /Invalid organization role/);
});

test("bootstrap is one-time and makes the calling Supabase user system-admin", async () => {
  const { pg, auth, supabase, requestWith } = await setup();
  const { token } = await supabase.issueToken({ email: "Founder@Example.invalid" });
  const session = await auth.authenticate(requestWith(token));
  assert.equal(session.principal, null, "no organization yet");
  assert.deepEqual(session.memberships, []);
  await assert.rejects(auth.bootstrap({ secret: "wrong".padEnd(bootstrapSecret.length, "x"), expectedSecret: bootstrapSecret, organizationName: "X", identity: session.identity }), /Bootstrap authorization failed/);
  const organization = await auth.bootstrap({ secret: bootstrapSecret, expectedSecret: bootstrapSecret, organizationName: "Synthetic Practice", identity: session.identity });
  assert.equal(organization.role, "system-admin");
  assert.equal(organization.email, "founder@example.invalid");
  await assert.rejects(auth.bootstrap({ secret: bootstrapSecret, expectedSecret: bootstrapSecret, organizationName: "Again", identity: session.identity }), /already be complete/);
  const after = await auth.authenticate(requestWith(token));
  assert.deepEqual(after.principal, { userId: session.identity.userId, email: "founder@example.invalid", organizationId: organization.organizationId, role: "system-admin" });
  await pg.close();
});

test("authentication rejects bad tokens and resolves the organization from memberships", async () => {
  const { pg, db, auth, supabase, requestWith } = await setup();
  assert.equal(await auth.authenticate(requestWith(null)), null);
  assert.equal(await auth.authenticate(requestWith((await supabase.issueToken({ email: "x@example.invalid", forgeWithOtherKey: true })).token)), null);
  assert.equal(await auth.authenticate(requestWith((await supabase.issueToken({ email: "x@example.invalid", expiresInSeconds: -300 })).token)), null);

  const { token, userId } = await supabase.issueToken({ email: "multi@example.invalid" });
  const now = new Date().toISOString();
  await db.batch([
    db.prepare("INSERT INTO phase6_organizations (id, name, created_at, updated_at) VALUES ('org-a', 'Alpha', ?, ?), ('org-b', 'Beta', ?, ?)").bind(now, now, now, now),
    db.prepare("INSERT INTO phase6_users (id, email, status, created_at, updated_at) VALUES (?, 'multi@example.invalid', 'active', ?, ?)").bind(userId, now, now),
    db.prepare("INSERT INTO phase6_memberships (organization_id, user_id, role, created_at) VALUES ('org-a', ?, 'accountant', ?), ('org-b', ?, 'reviewer', ?)").bind(userId, now, userId, now),
  ]);
  const ambiguous = await auth.authenticate(requestWith(token));
  assert.equal(ambiguous.principal, null, "two organizations and none chosen");
  assert.deepEqual(ambiguous.memberships.map((m) => [m.organizationId, m.role]), [["org-a", "accountant"], ["org-b", "reviewer"]]);
  assert.equal((await auth.authenticate(requestWith(token, "org-b"))).principal.role, "reviewer");
  assert.equal((await auth.authenticate(requestWith(token, "org-unknown"))).principal, null, "cannot pick an organization you do not belong to");
  assert.equal((await auth.authenticate(requestWith(token, "bad org id!"))).principal, null);

  // Deactivation is immediate even though the Supabase token is still valid.
  await db.prepare("UPDATE phase6_memberships SET status = 'inactive' WHERE organization_id = 'org-b' AND user_id = ?").bind(userId).run();
  assert.equal((await auth.authenticate(requestWith(token, "org-b"))).principal, null);
  assert.equal((await auth.authenticate(requestWith(token))).principal.organizationId, "org-a", "single remaining membership is chosen automatically");
  await db.prepare("UPDATE phase6_users SET status = 'inactive' WHERE id = ?").bind(userId).run();
  assert.equal((await auth.authenticate(requestWith(token))).principal, null, "inactive user has no access anywhere");
  await pg.close();
});

test("inviting sends a Supabase invitation for new emails and links existing accounts", async () => {
  const { pg, auth, supabase } = await setup();
  const fresh = await auth.inviteUser("New.Person@Example.invalid", { redirectTo: "https://app.example.invalid" });
  assert.equal(fresh.invited, true);
  assert.equal(supabase.invitations.length, 1);
  const { userId } = await supabase.issueToken({ email: "existing@example.invalid" });
  const linked = await auth.inviteUser("existing@example.invalid");
  assert.deepEqual(linked, { userId, email: "existing@example.invalid", invited: false });
  assert.equal(supabase.invitations.length, 1, "no email for an existing account");
  await assert.rejects(auth.inviteUser("not-an-email"), RangeError);
  const { auth: noAdmin, pg: pg2 } = await setup({ withAdmin: false });
  await assert.rejects(noAdmin.inviteUser("a@example.invalid"), /SUPABASE_SERVICE_ROLE_KEY/);
  await pg.close();
  await pg2.close();
});

test("client access stays scoped to assignments for non-admin roles", async () => {
  const { pg, db, auth } = await setup();
  const now = new Date().toISOString();
  await db.batch([
    db.prepare("INSERT INTO phase6_organizations (id, name, created_at, updated_at) VALUES ('org', 'Org', ?, ?)").bind(now, now),
    db.prepare("INSERT INTO phase6_users (id, email, status, created_at, updated_at) VALUES ('u-admin', 'a@x.invalid', 'active', ?, ?), ('u-acc', 'b@x.invalid', 'active', ?, ?)").bind(now, now, now, now),
    db.prepare("INSERT INTO phase6_memberships (organization_id, user_id, role, created_at) VALUES ('org', 'u-admin', 'practice-admin', ?), ('org', 'u-acc', 'accountant', ?)").bind(now, now),
    db.prepare("INSERT INTO phase6_clients (id, organization_id, legal_business_name, entity_type, taxpayer_category, created_by, updated_by, created_at, updated_at) VALUES ('c1', 'org', 'C1', 'company', 'company', 'u-admin', 'u-admin', ?, ?), ('c2', 'org', 'C2', 'company', 'company', 'u-admin', 'u-admin', ?, ?)").bind(now, now, now, now),
    db.prepare("INSERT INTO phase6_client_access (organization_id, user_id, client_id, assigned_by, created_at) VALUES ('org', 'u-acc', 'c1', 'u-admin', ?)").bind(now),
  ]);
  const accountant = { userId: "u-acc", organizationId: "org", role: "accountant" };
  assert.equal(await auth.requireClientAccess(accountant, "c1", "read", "clients"), true);
  assert.equal(await auth.requireClientAccess(accountant, "c2", "read", "clients"), false);
  assert.equal(await auth.requireClientAccess(accountant, "c1", "create", "users"), false);
  assert.equal(await auth.requireClientAccess({ userId: "u-admin", organizationId: "org", role: "practice-admin" }, "c2", "update", "clients"), true);
  await pg.close();
});
