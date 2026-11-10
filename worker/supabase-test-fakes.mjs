// Test-only fake of the Supabase HTTP APIs the Worker calls, backed by the
// PGlite database from pglite-test-support.mjs:
//   GET  /auth/v1/.well-known/jwks.json   real ES256 public key
//   POST /auth/v1/invite                  creates auth.users row, records the email
//   POST/GET/DELETE /storage/v1/object/... in-memory objects (private bucket only)
// issueToken() mints access tokens signed with the matching private key, so the
// Worker's real verifier is exercised end to end. Not imported by the Worker.

const encoder = new TextEncoder();

function base64Url(bytes) {
  let binary = "";
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export const SUPABASE_TEST_URL = "https://project-ref.supabase.example.invalid";
// Shaped like the project's legacy service_role key (a JWT); the fake only
// compares it, it is not a real token.
export const SERVICE_ROLE_TEST_KEY = "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.synthetic-test-signature";

export async function createFakeSupabase(pg, { url = SUPABASE_TEST_URL, serviceKey = SERVICE_ROLE_TEST_KEY } = {}) {
  const keyId = crypto.randomUUID();
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const publicJwk = { ...(await crypto.subtle.exportKey("jwk", pair.publicKey)), kid: keyId, alg: "ES256", use: "sig" };
  const otherPair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const objects = new Map();
  const invitations = [];
  const calls = [];

  async function sign(header, claims, privateKey) {
    const head = base64Url(encoder.encode(JSON.stringify(header)));
    const body = base64Url(encoder.encode(JSON.stringify(claims)));
    const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, privateKey, encoder.encode(`${head}.${body}`));
    return `${head}.${body}.${base64Url(signature)}`;
  }

  /** Creates (or reuses) an auth.users row and returns a signed access token. */
  async function issueToken({ email, userId, expiresInSeconds = 3600, overrides = {}, forgeWithOtherKey = false } = {}) {
    const normalized = String(email).toLowerCase();
    let id = userId;
    if (!id) {
      const existing = await pg.query("SELECT id::text AS id FROM auth.users WHERE lower(email) = $1", [normalized]);
      id = existing.rows[0]?.id || crypto.randomUUID();
      if (!existing.rows.length) await pg.query("INSERT INTO auth.users (id, email) VALUES ($1, $2)", [id, normalized]);
    }
    const now = Math.floor(Date.now() / 1000);
    const claims = {
      iss: `${url}/auth/v1`, aud: "authenticated", role: "authenticated",
      sub: id, email: normalized, iat: now, exp: now + expiresInSeconds, ...overrides,
    };
    const token = await sign({ alg: "ES256", kid: keyId, typ: "JWT" }, claims, forgeWithOtherKey ? otherPair.privateKey : pair.privateKey);
    return { token, userId: id };
  }

  // Mirrors live Supabase Storage/Auth admin: the service_role JWT must be sent
  // as both apikey and Authorization: Bearer.
  function authorized(request) {
    return request.headers.get("apikey") === serviceKey && request.headers.get("Authorization") === `Bearer ${serviceKey}`;
  }

  async function fetchImpl(input, init = {}) {
    const request = new Request(input, init);
    const target = new URL(request.url);
    calls.push(`${request.method} ${target.pathname}`);
    if (target.origin !== url) return new Response("unexpected host", { status: 599 });
    if (target.pathname === "/auth/v1/.well-known/jwks.json") return Response.json({ keys: [publicJwk] });
    if (target.pathname === "/auth/v1/invite" && request.method === "POST") {
      if (!authorized(request)) return Response.json({ msg: "unauthorized" }, { status: 401 });
      const { email } = await request.json();
      const normalized = String(email).toLowerCase();
      const existing = await pg.query("SELECT 1 FROM auth.users WHERE lower(email) = $1", [normalized]);
      if (existing.rows.length) {
        return Response.json({ code: 422, error_code: "email_exists", msg: "A user with this email address has already been registered" }, { status: 422 });
      }
      const id = crypto.randomUUID();
      await pg.query("INSERT INTO auth.users (id, email) VALUES ($1, $2)", [id, normalized]);
      invitations.push({ email: normalized, userId: id, redirectTo: target.searchParams.get("redirect_to") });
      return Response.json({ id, email: normalized });
    }
    const storage = target.pathname.match(/^\/storage\/v1\/object\/(authenticated\/)?([^/]+)\/(.+)$/);
    if (storage) {
      if (!authorized(request)) return Response.json({ statusCode: "403", error: "Unauthorized" }, { status: 400 });
      const [, viaAuthenticated, bucket, encodedKey] = storage;
      // Any private bucket the migrations created (phase6-documents, assessment-documents).
      const known = await pg.query("SELECT public FROM storage.buckets WHERE id = $1", [bucket]);
      if (!known.rows.length || known.rows[0].public) return Response.json({ statusCode: "404", error: "Bucket not found" }, { status: 400 });
      const objectKey = encodedKey.split("/").map(decodeURIComponent).join("/");
      // phase6-documents keys stay unprefixed so existing tests can look them up directly.
      const key = bucket === "phase6-documents" ? objectKey : `${bucket}/${objectKey}`;
      if (request.method === "POST" && !viaAuthenticated) {
        if (objects.has(key) && request.headers.get("x-upsert") !== "true") {
          return Response.json({ statusCode: "409", error: "Duplicate" }, { status: 400 });
        }
        objects.set(key, new Uint8Array(await request.arrayBuffer()));
        return Response.json({ Key: `${bucket}/${objectKey}` });
      }
      if (request.method === "GET" && viaAuthenticated) {
        const bytes = objects.get(key);
        return bytes
          ? new Response(bytes, { headers: { "Content-Type": "application/octet-stream", "Content-Length": String(bytes.byteLength) } })
          : Response.json({ statusCode: "404", error: "not_found", message: "Object not found" }, { status: 400 });
      }
      if (request.method === "DELETE" && !viaAuthenticated) {
        objects.delete(key);
        return Response.json({ message: "Successfully deleted" });
      }
    }
    return new Response("not found", { status: 404 });
  }

  return { url, serviceKey, fetch: fetchImpl, issueToken, objects, invitations, calls, keyId };
}
