// Guards the "sign in before anything else" wall in index.html / account.js.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
const accountJs = fs.readFileSync(path.join(__dirname, "account.js"), "utf8");

test("the site starts hidden and the sign-in screen is the first thing in the page", () => {
  assert.match(html, /<html lang="en" data-auth="pending">/, "page starts in the not-signed-in state");
  const styleAt = html.indexOf('id="auth-gate-style"');
  const firstStylesheet = html.indexOf('rel="stylesheet"');
  const firstScript = html.indexOf("<script");
  assert.ok(styleAt > 0 && styleAt < firstStylesheet && styleAt < firstScript, "hiding rule is inline before any other file loads");
  assert.match(html, /html:not\(\[data-auth="in"\]\) body > :not\(#auth-gate\) \{ display: none !important; \}/);
  assert.match(html, /html\[data-auth="in"\] #auth-gate \{ display: none !important; \}/);

  const body = html.slice(html.indexOf("<body>") + "<body>".length).trimStart();
  assert.ok(body.startsWith('<div id="auth-gate"'), "sign-in screen is the first element in <body>");
  assert.match(html, /id="auth-gate-root"/);
  assert.match(html, /<script src="account\.js\?v=[^"]+" defer><\/script>/);
});

test("account.js only reveals the site for a signed-in session", () => {
  assert.match(accountJs, /const signedIn = Boolean\(supabase && session && !passwordSetup\);/);
  assert.match(accountJs, /document\.documentElement\.dataset\.auth = signedIn \? "in" : "out";/);
  assert.ok(!/dataset\.auth = "in"/.test(accountJs), "no other code path opens the site");
  assert.match(accountJs, /Sign-in is temporarily unavailable/, "fails closed when sign-in cannot load");
});
