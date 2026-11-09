// Shared test harness for the Phase 6 API on Supabase (test-only; not part of
// the Worker bundle): real Postgres via PGlite with the Supabase migrations,
// real ES256 Supabase access tokens and a fake Supabase Storage/Auth API.
import assert from "node:assert/strict";
import { handlePhase6Request } from "./phase6-api.mjs";
import { clearSupabaseKeyCache } from "./supabase-auth.mjs";
import { withSupabaseStorage } from "./supabase-storage.mjs";
import { createMigratedDatabase } from "./pglite-test-support.mjs";
import { createFakeSupabase } from "./supabase-test-fakes.mjs";
export const origin = "https://taxcomp.example.invalid";
export const bootstrapSecret = "synthetic-bootstrap-secret-at-least-32-bytes";

export async function harness({ storage = true, serviceKey = true } = {}) {
  clearSupabaseKeyCache();
  const { pg, db } = await createMigratedDatabase();
  const supabase = await createFakeSupabase(pg);
  let scannedBytes = 0;
  const bindings = {
    UNANSWERED_QUESTIONS: db,
    DATABASE_PROVIDER: "supabase", // set by worker/db.mjs withDatabase() in production
    ALLOWED_ORIGIN: origin,
    PHASE6_APP_ORIGIN: origin,
    PHASE6_BOOTSTRAP_SECRET: bootstrapSecret,
    PHASE6_OPERATIONS_ENABLED: "true",
    PHASE6_SECURITY_REVIEWED: "true",
    PHASE6_DATA_AT_REST_REVIEWED: "true",
    PHASE6_BACKUP_RESTORE_VERIFIED: "true",
    CHAT_LIMITER: { limit: async () => ({ success: true }) },
    SUPABASE_URL: supabase.url,
    SUPABASE_FETCH: supabase.fetch,
    ...(serviceKey ? { SUPABASE_SERVICE_ROLE_KEY: supabase.serviceKey } : {}),
    ...(storage ? {
      PHASE6_MALWARE_SCANNER: {
        async fetch(_url, init) {
          scannedBytes = init.body.byteLength;
          return new Response(JSON.stringify({ clean: true }), { status: 200 });
        },
      },
    } : {}),
  };

  const raw = (path, { method = "GET", body, token, org, bootstrap, json = true, originValue = origin } = {}) => {
    const headers = { Origin: originValue };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (org) headers["X-Organization-Id"] = org;
    if (bootstrap) headers["X-Phase6-Bootstrap"] = bootstrap;
    if (body !== undefined && json) headers["Content-Type"] = "application/json";
    const init = { method, headers };
    if (body !== undefined) init.body = json ? JSON.stringify(body) : body;
    // Same composition as the Worker entry point: Supabase Storage when configured.
    return handlePhase6Request(new Request(`https://worker.example${path}`, init), withSupabaseStorage(bindings));
  };
  const call = async (path, options = {}, expected) => {
    const result = await raw(path, options);
    const text = await result.text();
    if (expected !== undefined) assert.equal(result.status, expected, `${options.method || "GET"} ${path}: ${text}`);
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = null; }
    return { status: result.status, headers: result.headers, json, text };
  };
  const signIn = async (email) => (await supabase.issueToken({ email })).token;
  const bootstrapAdmin = async (email, organizationName) => {
    const token = await signIn(email);
    const created = await call("/api/phase6/auth/bootstrap", { method: "POST", token, bootstrap: bootstrapSecret, body: { organizationName } }, 201);
    const me = await call("/api/phase6/auth/me", { token }, 200);
    return { token, organizationId: created.json.organization.organizationId, userId: me.json.user.userId };
  };
  /** Adds a member directly (as an earlier invitation would have) and signs them in. */
  const addMember = async (organizationId, email, role, clientIds = []) => {
    const { token, userId } = await supabase.issueToken({ email });
    const now = new Date().toISOString();
    await db.batch([
      db.prepare("INSERT INTO phase6_users (id, email, status, created_at, updated_at) VALUES (?, ?, 'active', ?, ?) ON CONFLICT (id) DO NOTHING").bind(userId, email, now, now),
      db.prepare("INSERT INTO phase6_memberships (organization_id, user_id, role, created_at) VALUES (?, ?, ?, ?)").bind(organizationId, userId, role, now),
      ...clientIds.map((clientId) => db.prepare("INSERT INTO phase6_client_access (organization_id, user_id, client_id, assigned_by, created_at) VALUES (?, ?, ?, ?, ?)")
        .bind(organizationId, userId, clientId, userId, now)),
    ]);
    return { token, userId };
  };
  const count = async (sql, ...values) => (await db.prepare(sql).bind(...values).first()).n;
  return { pg, db, supabase, bindings, raw, call, signIn, bootstrapAdmin, addMember, count, scanned: () => scannedBytes, close: () => pg.close() };
}
