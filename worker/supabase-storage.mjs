// Supabase Storage behind the same small interface the Worker already uses for
// client documents (an R2-style binding): put(key, bytes, options), get(key)
// -> { body } | null, delete(key).
//
// The bucket is private and has no Storage RLS policies, so only the service
// role (this Worker) can read or write it. Documents are never served from
// Supabase directly; downloads go through the Worker's authorization checks.

import { isServiceRoleKey, normalizeSupabaseUrl, serviceKeyHeaders } from "./supabase-auth.mjs";

export const DOCUMENTS_BUCKET = "phase6-documents";

function encodeObjectKey(key) {
  if (typeof key !== "string" || !key || key.length > 512) throw new TypeError("Invalid document object key.");
  const segments = key.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === ".." || /[\u0000-\u001f\\]/.test(segment))) {
    throw new TypeError("Invalid document object key.");
  }
  return segments.map(encodeURIComponent).join("/");
}

/**
 * Returns env with PHASE6_DOCUMENTS backed by Supabase Storage when
 * SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are configured and no other
 * document binding exists. Otherwise env is returned unchanged.
 */
export function withSupabaseStorage(env) {
  // A missing or wrong-format key leaves documents unconfigured (uploads answer
  // 503 and the readiness gate reports it) instead of failing every request.
  if (!env || env.PHASE6_DOCUMENTS || !normalizeSupabaseUrl(env.SUPABASE_URL) || !isServiceRoleKey(env.SUPABASE_SERVICE_ROLE_KEY)) {
    return env;
  }
  return {
    ...env,
    PHASE6_DOCUMENTS: createSupabaseStorageBucket({
      supabaseUrl: env.SUPABASE_URL,
      serviceKey: env.SUPABASE_SERVICE_ROLE_KEY,
      fetchImpl: typeof env.SUPABASE_FETCH === "function" ? env.SUPABASE_FETCH : globalThis.fetch,
    }),
  };
}

export function createSupabaseStorageBucket({
  supabaseUrl,
  serviceKey,
  bucket = DOCUMENTS_BUCKET,
  fetchImpl = globalThis.fetch,
} = {}) {
  const origin = normalizeSupabaseUrl(supabaseUrl);
  if (!origin) throw new TypeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for Supabase Storage.");
  if (!/^[a-z0-9][a-z0-9_-]{1,62}$/.test(bucket)) throw new TypeError("Invalid bucket name.");
  const base = `${origin}/storage/v1/object`;
  const auth = serviceKeyHeaders(serviceKey);

  return Object.freeze({
    async put(key, bytes, options = {}) {
      const body = bytes instanceof ArrayBuffer || ArrayBuffer.isView(bytes) ? bytes : new Uint8Array(bytes);
      const result = await fetchImpl(`${base}/${bucket}/${encodeObjectKey(key)}`, {
        method: "POST",
        headers: {
          ...auth,
          "Content-Type": options.httpMetadata?.contentType || "application/octet-stream",
          "Cache-Control": "no-store",
          "x-upsert": "false", // object keys are versioned; never overwrite
        },
        body,
      });
      if (!result.ok) throw new Error(`Document storage upload failed (${result.status}).`);
      return { key };
    },

    async get(key) {
      const result = await fetchImpl(`${base}/authenticated/${bucket}/${encodeObjectKey(key)}`, { headers: auth });
      if (result.status === 404 || result.status === 400) {
        // Supabase reports a missing object as 400 {"statusCode":"404"} or 404.
        if (result.status === 404) return null;
        let detail = {};
        try { detail = await result.clone().json(); } catch { /* ignore */ }
        if (String(detail.statusCode) === "404" || /not.?found/i.test(String(detail.error || detail.message || ""))) return null;
      }
      if (!result.ok) throw new Error(`Document storage download failed (${result.status}).`);
      return {
        body: result.body,
        size: Number(result.headers.get("Content-Length")) || undefined,
        httpMetadata: { contentType: result.headers.get("Content-Type") || "application/octet-stream" },
      };
    },

    async delete(key) {
      const result = await fetchImpl(`${base}/${bucket}/${encodeObjectKey(key)}`, { method: "DELETE", headers: auth });
      if (!result.ok && result.status !== 404 && result.status !== 400) {
        throw new Error(`Document storage delete failed (${result.status}).`);
      }
    },
  });
}
