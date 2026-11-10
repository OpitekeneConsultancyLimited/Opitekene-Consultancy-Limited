// Guards the 2026-11 redesign: page views must not break any script's elements.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");

test("every element a front-end script looks up exists exactly once", () => {
  // Exits non-zero (and execFileSync throws) on a missing or duplicated id.
  const out = execFileSync(process.execPath, [path.join(__dirname, "scripts", "check-dom-contract.mjs")], { encoding: "utf8" });
  assert.match(out, /missing: none/);
  assert.match(out, /duplicated ids: none/);
});

test("every top-level section belongs to a page view", () => {
  const main = html.slice(html.indexOf("<main>"), html.indexOf("</main>"));
  const views = new Set(["home", "tools", "knowledge", "assistant", "workspace", "about"]);
  // Top-level sections are indented exactly 6 spaces inside <main>.
  const tops = [...main.matchAll(/\n {6}<section ([^>]*)>/g)].map((m) => m[1]);
  assert.ok(tops.length > 10);
  for (const attrs of tops) {
    const view = /data-view="([^"]+)"/.exec(attrs);
    assert.ok(view && views.has(view[1]), `section without a valid data-view: ${attrs.slice(0, 80)}`);
  }
});

test("navigation covers the six sections of the brief", () => {
  for (const hash of ["#home", "#tools", "#calc-paye", "#calc-vat", "#calc-withholding", "#calc-rental", "#calc-individual",
    "#kb-guides", "#kb-laws", "#kb-cases", "#kb-updates", "#kb-compliance", "#assistant", "#workspace", "#about"]) {
    assert.ok(html.includes(`href="${hash}"`), `nav link ${hash}`);
  }
  assert.match(html, /<script src="site-router\.js\?v=[^"]+" defer><\/script>/);
});

test("the public quick calculator takes every rate from the tax engine", () => {
  const front = fs.readFileSync(path.join(__dirname, "front-page.js"), "utf8");
  for (const fn of ["calculatePaye", "calculateVat", "calculateWithholdingTax", "calculateCompanyIncomeTax"]) {
    assert.match(front, new RegExp(`engine\\.${fn}\\(`), `uses ugandaTax.${fn}`);
  }
  // No hard-coded tax rates or bands (e.g. 0.18, 0.3, 235000) in the front page.
  assert.ok(!/\b0\.\d+/.test(front), "no decimal tax rates in front-page.js");
  assert.ok(!/\b\d{3},?000\b/.test(front.replace(/2026/g, "")), "no hard-coded money thresholds in front-page.js");
  assert.match(html, /<script src="front-page\.js\?v=[^"]+" defer><\/script>/);
});

test("the router never opens the sign-in wall and leaves auth fragments alone", () => {
  const router = fs.readFileSync(path.join(__dirname, "site-router.js"), "utf8");
  assert.ok(!/dataset\.auth\s*=|setAttribute\(\s*["']data-auth["']/.test(router), "only account.js may change data-auth");
  assert.match(router, /hash\.includes\("="\) \|\| hash\.includes\("\?"\)/);
});
