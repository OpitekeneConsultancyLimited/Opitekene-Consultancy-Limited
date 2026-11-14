#!/usr/bin/env node
// Content Security Policy for the two public pages (audit finding L2).
//
// GitHub Pages cannot send response headers, so the policy is a
// <meta http-equiv="Content-Security-Policy"> placed straight after
// <meta charset>, before any script or style. Inline blocks are allowed by
// their SHA-256 hash only (no 'unsafe-inline', no 'unsafe-eval').
//
//   node scripts/site-csp.mjs          rewrite the meta tags in both pages
//   node scripts/site-csp.mjs --check  fail if either page's policy is stale (CI)
//
// Meta-delivered CSP cannot use frame-ancestors, report-uri/report-to or
// sandbox (browsers ignore them there), so they are left out; see
// docs/remediation/CONTENT_SECURITY_POLICY.md.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

/** supabase-js 2.118.0 (+esm) and the only modules it imports from jsdelivr. */
export const SUPABASE_JS_SOURCES = Object.freeze([
  "https://cdn.jsdelivr.net/npm/@supabase/",
  "https://cdn.jsdelivr.net/npm/tslib@2.8.1/",
  "https://cdn.jsdelivr.net/npm/iceberg-js@0.8.1/",
]);
const FONT_CSS = "https://fonts.googleapis.com";
const FONT_FILES = "https://fonts.gstatic.com";
const META = /<meta http-equiv="Content-Security-Policy" content="[^"]*">\r?\n?[ \t]*/;

function sha256(text) {
  // Browsers hash the text after HTML input normalisation (CRLF/CR become LF).
  return `'sha256-${createHash("sha256").update(text.replace(/\r\n?/g, "\n"), "utf8").digest("base64")}'`;
}

/** Hashes of every inline <script> (without src) and <style> block. */
export function inlineHashes(html) {
  const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => sha256(m[1]));
  const styles = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => sha256(m[1]));
  return { scripts, styles };
}

function metaContent(html, name) {
  return html.match(new RegExp(`<meta name="${name}" content="([^"]*)"`))?.[1]?.trim() || "";
}

function originOf(value) {
  try { return value ? new URL(value).origin : null; } catch { return null; }
}

/**
 * Builds the policy for a page. Origins come from the page's own endpoint
 * meta tags, so changing an endpoint without updating the CSP fails --check.
 */
export function buildPolicy(html, { localDev = false, supabaseJsSources = SUPABASE_JS_SOURCES } = {}) {
  const { scripts, styles } = inlineHashes(html);
  const connect = new Set(["'self'"]);
  for (const name of ["taxcomp-chat-endpoint", "taxcomp-phase6-api", "taxcomp-supabase-url"]) {
    const origin = originOf(metaContent(html, name));
    if (origin) connect.add(origin);
  }
  const usesSupabaseJs = Boolean(metaContent(html, "taxcomp-supabase-url"));
  const directives = [
    ["default-src", ["'self'"]],
    ["script-src", ["'self'", ...scripts, ...(usesSupabaseJs ? supabaseJsSources : [])]],
    ["style-src", ["'self'", ...styles, FONT_CSS]],
    ["font-src", ["'self'", FONT_FILES]],
    ["img-src", ["'self'", "data:", "blob:"]],
    ["connect-src", [...connect]],
    ["manifest-src", ["'self'"]],
    ["worker-src", ["'self'"]],
    ["frame-src", ["'none'"]],
    ["object-src", ["'none'"]],
    ["base-uri", ["'self'"]],
    ["form-action", ["'self'"]],
  ];
  const policy = directives.map(([name, values]) => `${name} ${values.join(" ")}`).join("; ");
  return localDev ? policy : `${policy}; upgrade-insecure-requests`;
}

/** Inserts or replaces the CSP meta tag straight after <meta charset>. */
export function applyPolicy(html, policy) {
  const tag = `<meta http-equiv="Content-Security-Policy" content="${policy}">`;
  const without = html.replace(META, "");
  const charset = without.match(/<meta charset="utf-8">(\r?\n)([ \t]*)/i);
  if (!charset) throw new Error("The page has no <meta charset=\"utf-8\"> to anchor the CSP.");
  const [whole, newline, indent] = charset;
  return without.replace(whole, `${whole}${tag}${newline}${indent}`);
}

export const PAGES = Object.freeze(["index.html", "taxcomp/index.html"]);

export function currentPolicy(html) {
  return html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]*)">/)?.[1] ?? null;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const check = process.argv.includes("--check");
  const base = process.argv.find((arg, i) => i > 1 && !arg.startsWith("--")) || root;
  let stale = 0;
  for (const page of PAGES) {
    const file = path.join(base, page);
    const html = readFileSync(file, "utf8");
    const wanted = buildPolicy(html);
    if (currentPolicy(html) === wanted && html.search(/<meta http-equiv="Content-Security-Policy"/) < html.search(/<script|<style|<link/)) {
      console.log(`ok     ${page}`);
      continue;
    }
    if (check) {
      console.error(`STALE  ${page}: run node scripts/site-csp.mjs and commit the result.`);
      stale += 1;
    } else {
      writeFileSync(file, applyPolicy(html, wanted));
      console.log(`wrote  ${page}`);
    }
  }
  process.exit(stale ? 1 : 0);
}
