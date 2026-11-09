// Supabase Auth for the Worker.
//
// * createSupabaseTokenVerifier: verifies Supabase access tokens (JWT) locally
//   with the project's published signing keys (JWKS, ES256/RS256). No secret is
//   needed, and no network call is made per request once the keys are cached.
// * createSupabaseAdmin: the few Auth admin calls the Worker needs (inviting a
//   user by email). Uses the service-role key, which must only ever live in a
//   Worker secret.

const JWKS_TTL_MS = 10 * 60 * 1000;
const CLOCK_SKEW_SECONDS = 30;
const jwksCache = new Map(); // supabaseUrl -> { keys: Map<kid, CryptoKey>, fetchedAt }

const ALGORITHMS = Object.freeze({
  ES256: { import: { name: "ECDSA", namedCurve: "P-256" }, verify: { name: "ECDSA", hash: "SHA-256" } },
  RS256: { import: { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, verify: { name: "RSASSA-PKCS1-v1_5" } },
});

function base64UrlToBytes(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]*$/.test(value)) throw new TypeError("Invalid base64url.");
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function decodeJson(segment) {
  return JSON.parse(new TextDecoder().decode(base64UrlToBytes(segment)));
}

export function normalizeSupabaseUrl(value) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function createSupabaseTokenVerifier({
  supabaseUrl,
  fetchImpl = globalThis.fetch,
  cryptoImpl = globalThis.crypto,
  clock = () => Date.now(),
} = {}) {
  const origin = normalizeSupabaseUrl(supabaseUrl);
  if (!origin) throw new TypeError("A valid https SUPABASE_URL is required.");
  if (typeof fetchImpl !== "function" || !cryptoImpl?.subtle) throw new TypeError("fetch and Web Crypto are required.");
  const issuer = `${origin}/auth/v1`;
  const jwksUrl = `${issuer}/.well-known/jwks.json`;

  async function loadKeys(force = false) {
    const cached = jwksCache.get(origin);
    if (!force && cached && clock() - cached.fetchedAt < JWKS_TTL_MS) return cached.keys;
    const result = await fetchImpl(jwksUrl, { headers: { Accept: "application/json" } });
    if (!result.ok) throw new Error(`Could not load Supabase signing keys (${result.status}).`);
    const { keys = [] } = await result.json();
    const imported = new Map();
    for (const jwk of keys) {
      const algorithm = ALGORITHMS[jwk.alg];
      if (!algorithm || !jwk.kid || (jwk.use && jwk.use !== "sig")) continue;
      const { kid, alg, use, key_ops: _ops, ext: _ext, ...material } = jwk;
      imported.set(kid, { alg, key: await cryptoImpl.subtle.importKey("jwk", material, algorithm.import, false, ["verify"]) });
    }
    jwksCache.set(origin, { keys: imported, fetchedAt: clock() });
    return imported;
  }

  /** Returns the verified claims, or null for any invalid/expired/foreign token. */
  async function verify(token) {
    if (typeof token !== "string" || token.length > 8192) return null;
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    let header;
    let claims;
    try {
      header = decodeJson(parts[0]);
      claims = decodeJson(parts[1]);
    } catch {
      return null;
    }
    const algorithm = ALGORITHMS[header?.alg];
    if (!algorithm || typeof header.kid !== "string" || header.typ && header.typ !== "JWT") return null;
    let keys = await loadKeys();
    if (!keys.has(header.kid)) keys = await loadKeys(true); // key rotation
    const entry = keys.get(header.kid);
    if (!entry || entry.alg !== header.alg) return null;
    let valid = false;
    try {
      valid = await cryptoImpl.subtle.verify(
        algorithm.verify,
        entry.key,
        base64UrlToBytes(parts[2]),
        new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
      );
    } catch {
      return null;
    }
    if (!valid) return null;
    const now = Math.floor(clock() / 1000);
    const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (typeof claims.exp !== "number" || claims.exp + CLOCK_SKEW_SECONDS <= now) return null;
    if (typeof claims.nbf === "number" && claims.nbf - CLOCK_SKEW_SECONDS > now) return null;
    if (claims.iss !== issuer || !audience.includes("authenticated") || claims.role !== "authenticated") return null;
    if (typeof claims.sub !== "string" || !/^[0-9a-f-]{36}$/i.test(claims.sub)) return null;
    return claims;
  }

  return Object.freeze({ verify, issuer });
}

export function createSupabaseAdmin({ supabaseUrl, serviceKey, fetchImpl = globalThis.fetch } = {}) {
  const origin = normalizeSupabaseUrl(supabaseUrl);
  if (!origin) throw new TypeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for Supabase admin calls.");
  const headers = { ...serviceKeyHeaders(serviceKey), "Content-Type": "application/json" };

  /**
   * Sends Supabase's invitation email. Returns { userId, alreadyRegistered }.
   * alreadyRegistered=true means the email already has a Supabase account (no
   * email is sent); the caller resolves the id another way.
   */
  async function inviteUser(email, { redirectTo } = {}) {
    const url = new URL(`${origin}/auth/v1/invite`);
    if (redirectTo) url.searchParams.set("redirect_to", redirectTo);
    const result = await fetchImpl(url.toString(), { method: "POST", headers, body: JSON.stringify({ email }) });
    if (result.ok) {
      const user = await result.json();
      if (typeof user?.id !== "string") throw new Error("Supabase invite returned no user id.");
      return { userId: user.id, alreadyRegistered: false };
    }
    let detail = {};
    try { detail = await result.json(); } catch { /* ignore */ }
    const code = String(detail.error_code || detail.code || "");
    if (result.status === 422 && /exists|registered/i.test(`${code} ${detail.msg || detail.message || ""}`)) {
      return { userId: null, alreadyRegistered: true };
    }
    throw new Error(`Supabase invite failed (${result.status}${code ? ` ${code}` : ""}).`);
  }

  return Object.freeze({ inviteUser });
}

/**
 * Server-side Supabase calls use the project's service_role key, a JWT sent as
 * both apikey and Bearer. Verified against the live project on 2026-11-09:
 * Storage rejects the newer sb_secret_ keys ("headers must have required
 * property 'authorization'" without a Bearer, "Invalid Compact JWS" with one),
 * so only the JWT-format service_role key is accepted here.
 */
export function assertServiceRoleKey(serviceKey) {
  if (typeof serviceKey !== "string" || !/^eyJ[\w-]+\.[\w-]+\.[\w-]+$/.test(serviceKey)) {
    throw new TypeError("SUPABASE_SERVICE_ROLE_KEY must be the project's service_role key (a JWT starting with eyJ), not an sb_secret_ key.");
  }
  return serviceKey;
}

export function isServiceRoleKey(serviceKey) {
  try {
    assertServiceRoleKey(serviceKey);
    return true;
  } catch {
    return false;
  }
}

export function serviceKeyHeaders(serviceKey) {
  assertServiceRoleKey(serviceKey);
  return { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };
}

export function readBearerToken(request) {
  const header = request.headers.get("Authorization") || "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() : null;
}

/** Test helper hook: clear cached signing keys. */
export function clearSupabaseKeyCache() {
  jwksCache.clear();
}
