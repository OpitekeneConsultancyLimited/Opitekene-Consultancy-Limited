// L2: the Content Security Policy on the two public pages is current, strict,
// and covers every endpoint the page talks to. The browser test
// (scripts/challenge-e2e.mjs) separately records any CSP violation at run time.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applyPolicy, buildPolicy, currentPolicy, inlineHashes, PAGES } from "../scripts/site-csp.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (page) => readFileSync(path.join(root, page), "utf8");
const directive = (policy, name) => policy.split("; ").find((part) => part.startsWith(`${name} `))?.split(" ").slice(1) ?? [];

for (const page of PAGES) {
  test(`${page}: CSP meta is current and comes before any script, style or stylesheet`, () => {
    const html = read(page);
    const policy = currentPolicy(html);
    assert.ok(policy, "has a CSP meta tag");
    assert.equal(policy, buildPolicy(html), "stale: run node scripts/site-csp.mjs");
    const at = html.indexOf('<meta http-equiv="Content-Security-Policy"');
    assert.ok(at > html.indexOf("<meta charset") && at < html.search(/<script|<style|<link/), "placed straight after <meta charset>");
  });

  test(`${page}: no unsafe-inline or unsafe-eval; plugins, framing and base tags shut off`, () => {
    const policy = currentPolicy(read(page));
    assert.doesNotMatch(policy, /unsafe-inline|unsafe-eval|unsafe-hashes|\*/);
    assert.deepEqual(directive(policy, "object-src"), ["'none'"]);
    assert.deepEqual(directive(policy, "frame-src"), ["'none'"]);
    assert.deepEqual(directive(policy, "base-uri"), ["'self'"]);
    assert.deepEqual(directive(policy, "default-src"), ["'self'"]);
    assert.ok(policy.endsWith("upgrade-insecure-requests"));
    const { scripts, styles } = inlineHashes(read(page));
    for (const hash of scripts) assert.ok(directive(policy, "script-src").includes(hash), "every inline script is hashed");
    for (const hash of styles) assert.ok(directive(policy, "style-src").includes(hash), "every inline style is hashed");
  });
}

test("taxcomp/index.html: connect-src covers the Worker and Supabase; scripts only from this site and the pinned supabase-js modules", () => {
  const html = read("taxcomp/index.html");
  const policy = currentPolicy(html);
  const connect = directive(policy, "connect-src");
  for (const name of ["taxcomp-chat-endpoint", "taxcomp-supabase-url"]) {
    const origin = new URL(html.match(new RegExp(`<meta name="${name}" content="([^"]+)"`))[1]).origin;
    assert.ok(connect.includes(origin), `${name} origin ${origin} is allowed`);
  }
  assert.deepEqual(directive(policy, "script-src"), ["'self'", "https://cdn.jsdelivr.net/npm/@supabase/", "https://cdn.jsdelivr.net/npm/tslib@2.8.1/", "https://cdn.jsdelivr.net/npm/iceberg-js@0.8.1/"]);
  // account.js and phase6-app.js load exactly the pinned supabase-js version the policy was written for.
  for (const file of ["account.js", "phase6-app.js"]) assert.match(read(file), /cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@2\.118\.0\/\+esm/, file);
});

test("index.html (corporate site): talks to nothing but itself", () => {
  const policy = currentPolicy(read("index.html"));
  assert.deepEqual(directive(policy, "connect-src"), ["'self'"]);
  assert.ok(!directive(policy, "script-src").some((source) => source.startsWith("https:")), "no third-party scripts");
});

test("local development rebuilds the same policy for the local Worker and Supabase", () => {
  const html = read("taxcomp/index.html")
    .replace(/(<meta name="taxcomp-chat-endpoint" content=")[^"]*(")/, "$1http://localhost:8788/chat$2")
    .replace(/(<meta name="taxcomp-supabase-url" content=")[^"]*(")/, "$1http://127.0.0.1:54321$2");
  const local = currentPolicy(applyPolicy(html, buildPolicy(html, { localDev: true, supabaseJsSources: [] })));
  assert.deepEqual(directive(local, "connect-src"), ["'self'", "http://localhost:8788", "http://127.0.0.1:54321"]);
  assert.doesNotMatch(local, /upgrade-insecure-requests|jsdelivr/);
  assert.equal((applyPolicy(html, local).match(/http-equiv="Content-Security-Policy"/g) || []).length, 1, "replaced, not duplicated");
});
