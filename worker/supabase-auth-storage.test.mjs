// Supabase Auth token verification, the admin invite client and the Storage
// adapter, against the fake Supabase APIs (real ES256 keys, real Postgres).
import test from "node:test";
import assert from "node:assert/strict";
import { createSupabaseAdmin, createSupabaseTokenVerifier, clearSupabaseKeyCache } from "./supabase-auth.mjs";
import { createSupabaseStorageBucket, withSupabaseStorage } from "./supabase-storage.mjs";
import { createMigratedDatabase } from "./pglite-test-support.mjs";
import { createFakeSupabase } from "./supabase-test-fakes.mjs";

async function setup() {
  clearSupabaseKeyCache();
  const { pg, db } = await createMigratedDatabase();
  const supabase = await createFakeSupabase(pg);
  const verifier = createSupabaseTokenVerifier({ supabaseUrl: supabase.url, fetchImpl: supabase.fetch });
  return { pg, db, supabase, verifier };
}

test("valid Supabase access tokens verify; forged, expired and foreign ones do not", async () => {
  const { pg, supabase, verifier } = await setup();
  const { token, userId } = await supabase.issueToken({ email: "Person@Example.invalid" });
  const claims = await verifier.verify(token);
  assert.equal(claims.sub, userId);
  assert.equal(claims.email, "person@example.invalid");

  const rejected = {
    forgedKey: (await supabase.issueToken({ email: "a@example.invalid", forgeWithOtherKey: true })).token,
    expired: (await supabase.issueToken({ email: "a@example.invalid", expiresInSeconds: -120 })).token,
    otherIssuer: (await supabase.issueToken({ email: "a@example.invalid", overrides: { iss: "https://evil.example.invalid/auth/v1" } })).token,
    anonRole: (await supabase.issueToken({ email: "a@example.invalid", overrides: { role: "anon" } })).token,
    otherAudience: (await supabase.issueToken({ email: "a@example.invalid", overrides: { aud: "service" } })).token,
    notYetValid: (await supabase.issueToken({ email: "a@example.invalid", overrides: { nbf: Math.floor(Date.now() / 1000) + 600 } })).token,
  };
  const [head, body, signature] = token.split(".");
  rejected.tamperedPayload = `${head}.${Buffer.from(JSON.stringify({ ...claims, sub: "00000000-0000-0000-0000-000000000000" })).toString("base64url")}.${signature}`;
  rejected.algNone = `${Buffer.from(JSON.stringify({ alg: "none", kid: supabase.keyId })).toString("base64url")}.${body}.`;
  rejected.hs256 = `${Buffer.from(JSON.stringify({ alg: "HS256", kid: supabase.keyId })).toString("base64url")}.${body}.${signature}`;
  rejected.garbage = "not-a-jwt";
  for (const [name, value] of Object.entries(rejected)) {
    assert.equal(await verifier.verify(value), null, `${name} must be rejected`);
  }
  await pg.close();
});

test("signing keys are cached and refreshed when an unknown key id appears", async () => {
  const { pg, supabase, verifier } = await setup();
  const { token } = await supabase.issueToken({ email: "cache@example.invalid" });
  await verifier.verify(token);
  await verifier.verify(token);
  assert.equal(supabase.calls.filter((call) => call.endsWith("jwks.json")).length, 1, "JWKS fetched once");
  const [, body, signature] = token.split(".");
  const unknownKid = `${Buffer.from(JSON.stringify({ alg: "ES256", kid: "rotated-away", typ: "JWT" })).toString("base64url")}.${body}.${signature}`;
  assert.equal(await verifier.verify(unknownKid), null);
  assert.equal(supabase.calls.filter((call) => call.endsWith("jwks.json")).length, 2, "refetched once for an unknown kid");
  await pg.close();
});

test("admin invite creates new users and reports existing accounts", async () => {
  const { pg, supabase } = await setup();
  const admin = createSupabaseAdmin({ supabaseUrl: supabase.url, serviceKey: supabase.serviceKey, fetchImpl: supabase.fetch });
  const created = await admin.inviteUser("new@example.invalid", { redirectTo: "https://app.example.invalid" });
  assert.equal(created.alreadyRegistered, false);
  assert.match(created.userId, /^[0-9a-f-]{36}$/);
  assert.deepEqual(supabase.invitations.map((i) => [i.email, i.redirectTo]), [["new@example.invalid", "https://app.example.invalid"]]);
  assert.deepEqual(await admin.inviteUser("new@example.invalid"), { userId: null, alreadyRegistered: true });
  const wrongKey = createSupabaseAdmin({ supabaseUrl: supabase.url, serviceKey: "eyJhbGciOiJIUzI1NiJ9.eyJ3cm9uZyI6dHJ1ZX0.wrong", fetchImpl: supabase.fetch });
  await assert.rejects(wrongKey.inviteUser("x@example.invalid"), /invite failed \(401/);
  assert.throws(() => createSupabaseAdmin({ supabaseUrl: "http://insecure.example.invalid", serviceKey: supabase.serviceKey }), /SUPABASE_URL/);
  assert.throws(() => createSupabaseAdmin({ supabaseUrl: supabase.url, serviceKey: "sb_secret_abcdefghijklmnopqrstuvwxyz" }), /service_role key/,
    "sb_secret_ keys are refused up front (live Storage rejects them)");
  await pg.close();
});

test("auth_user_id_by_email is the Worker's only window into auth.users", async () => {
  const { pg, db, supabase } = await setup();
  const { userId } = await supabase.issueToken({ email: "Known@Example.invalid" });
  assert.equal((await db.prepare("SELECT auth_user_id_by_email(?) AS userId").bind("known@example.INVALID").first()).userId, userId);
  assert.equal((await db.prepare("SELECT auth_user_id_by_email(?) AS userId").bind("nobody@example.invalid").first()).userId, null);
  const grants = await pg.query(`SELECT grantee FROM information_schema.routine_privileges
    WHERE routine_schema = 'taxcomp' AND routine_name = 'auth_user_id_by_email' ORDER BY grantee`);
  assert.deepEqual(grants.rows.map((r) => r.grantee).filter((g) => g !== "postgres"), ["taxcomp_worker"], "not executable by PUBLIC");
  const tables = await pg.query("SELECT tablename FROM pg_tables WHERE schemaname = 'taxcomp' AND tablename IN ('phase6_sessions','phase6_password_resets')");
  assert.deepEqual(tables.rows, [], "legacy session/reset tables removed");
  const bucket = await pg.query("SELECT public, file_size_limit FROM storage.buckets WHERE id = 'phase6-documents'");
  assert.deepEqual(bucket.rows, [{ public: false, file_size_limit: 10485760 }], "private documents bucket");
  await pg.close();
});

test("Supabase Storage adapter stores, reads back, never overwrites and deletes documents", async () => {
  const { pg, supabase } = await setup();
  const bucket = createSupabaseStorageBucket({ supabaseUrl: supabase.url, serviceKey: supabase.serviceKey, fetchImpl: supabase.fetch });
  const key = "org-1/client 1/doc-1/v1";
  await bucket.put(key, new TextEncoder().encode("%PDF-1.7 bytes"), { httpMetadata: { contentType: "application/octet-stream" } });
  assert.equal(new TextDecoder().decode(supabase.objects.get(key)), "%PDF-1.7 bytes");
  const object = await bucket.get(key);
  assert.equal(await new Response(object.body).text(), "%PDF-1.7 bytes");
  await assert.rejects(bucket.put(key, new Uint8Array([1])), /upload failed/, "versioned keys are never overwritten");
  assert.equal(await bucket.get("org-1/missing"), null);
  await bucket.delete(key);
  assert.equal(await bucket.get(key), null);
  for (const bad of ["", "../escape", "a//b", "a/./b", "a\\b"]) {
    await assert.rejects(bucket.put(bad, new Uint8Array([1])), /Invalid document object key/, `rejects ${JSON.stringify(bad)}`);
  }
  const wrongKey = createSupabaseStorageBucket({ supabaseUrl: supabase.url, serviceKey: "eyJhbGciOiJIUzI1NiJ9.eyJ3cm9uZyI6dHJ1ZX0.wrong", fetchImpl: supabase.fetch });
  await assert.rejects(wrongKey.put("org/x", new Uint8Array([1])), /upload failed/);
  await pg.close();
});

test("withSupabaseStorage binds documents only when Supabase is configured", () => {
  assert.equal(withSupabaseStorage({ A: 1 }).PHASE6_DOCUMENTS, undefined);
  const jwtKey = "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.sig";
  const existing = { put() {}, get() {}, delete() {} };
  assert.equal(withSupabaseStorage({ SUPABASE_URL: "https://x.supabase.co", SUPABASE_SERVICE_ROLE_KEY: jwtKey, PHASE6_DOCUMENTS: existing }).PHASE6_DOCUMENTS, existing);
  const bound = withSupabaseStorage({ SUPABASE_URL: "https://x.supabase.co", SUPABASE_SERVICE_ROLE_KEY: jwtKey });
  assert.equal(typeof bound.PHASE6_DOCUMENTS.put, "function");
  assert.equal(withSupabaseStorage({ SUPABASE_URL: "https://x.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "sb_secret_abcdefghijklmnopqrstuvwxyz" }).PHASE6_DOCUMENTS, undefined,
    "a wrong-format key leaves documents unconfigured instead of failing requests");
});
