// The corporate website (index.html) and its separation from the TaxComp app
// (taxcomp/index.html): navigation, content, no app or sign-in wall on the
// corporate page, old links forwarded to the app, and the publish allowlist.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const corporate = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
const app = fs.readFileSync(path.join(__dirname, "taxcomp", "index.html"), "utf8");
const frontPage = fs.readFileSync(path.join(__dirname, "front-page.js"), "utf8");

test("corporate navigation: Home, About Us, Services, Training, Insights, TaxComp, Contact Us", () => {
  const nav = corporate.slice(corporate.indexOf('<nav class="pc-nav"'), corporate.indexOf("</nav>", corporate.indexOf('<nav class="pc-nav"')));
  const labels = [...nav.matchAll(/<a href="[^"]+">([^<]+)<\/a>/g)].map((m) => m[1]);
  assert.deepEqual(labels, ["Home", "About Us", "Services", "Training", "Insights", "TaxComp", "Contact Us"]);
  for (const id of ["top", "about", "services", "training", "insights", "taxcomp", "contact", "privacy", "terms"]) assert.match(corporate, new RegExp(`id="${id}"`), id);
});

test("corporate content: the brief's eight services and five training programmes; real contact details", () => {
  for (const service of ["Accounting and bookkeeping", "Tax compliance and advisory", "Financial reporting", "Audit preparation and support",
    "Accounting software implementation", "Accounting software training", "Business advisory", "Financial management consultancy"]) {
    assert.ok(corporate.includes(`<h3>${service}</h3>`), service);
  }
  for (const programme of ["QuickBooks Online", "QuickBooks Desktop", "Zoho Books", "Xero", "Odoo"]) assert.ok(corporate.includes(`<li>${programme}</li>`), programme);
  for (const detail of ["0782 092 825", "0753 267 505", "opitekenecons@gmail.com", "Kireka, Kamuli Road"]) assert.ok(corporate.includes(detail), detail);
  // Every "request this service" option exists in the contact form.
  const options = new Set([...corporate.matchAll(/<option value="([^"]+)">/g)].map((m) => m[1]));
  for (const m of corporate.matchAll(/data-pc-service="([^"]+)"/g)) assert.ok(options.has(m[1]), `form option for ${m[1]}`);
});

test("the corporate page is not a tax dashboard and has no sign-in wall; it links to TaxComp", () => {
  assert.ok(!/data-auth=/.test(corporate) && !/id="auth-gate"/.test(corporate), "no sign-in wall");
  for (const appScript of ["account.js", "dashboard.js", "tax-chat.js", "site-router.js", "app.js"]) assert.ok(!corporate.includes(`src="${appScript}`), `${appScript} is not loaded`);
  assert.ok((corporate.match(/href="taxcomp\//g) || []).length >= 3, "links to the app");
  assert.ok(!/(?:testimonial|clients served|years of experience|\d+\+ clients)/i.test(corporate), "no invented claims");
});

test("old app links, sign-in emails and payment returns are forwarded to taxcomp/", () => {
  const script = corporate.slice(corporate.indexOf("forwardAppLinks"), corporate.indexOf("</script>"));
  const forward = new Function("location", `${script.slice(script.indexOf("{") + 1, script.lastIndexOf("}"))}`);
  const run = (hash, search = "") => { let target = null; forward({ hash, search, replace: (url) => { target = url; } }); return target; };
  assert.equal(run("#workspace"), "taxcomp/#workspace");
  assert.equal(run("#calc-paye"), "taxcomp/#calc-paye");
  assert.equal(run("#access_token=abc&type=signup"), "taxcomp/#access_token=abc&type=signup");
  assert.equal(run("#account", "?status=successful&tx_ref=TX1"), "taxcomp/?status=successful&tx_ref=TX1#account");
  for (const own of ["", "#about", "#services", "#contact", "#privacy", "#training", "#taxcomp"]) assert.equal(run(own), null, `${own || "(none)"} stays on the corporate site`);
});

test("the quick calculator's elements are all on the corporate page", () => {
  const ids = new Set([...frontPage.matchAll(/\$\("([a-z0-9-]+)"\)/g)].map((m) => m[1]));
  for (const m of frontPage.matchAll(/\[([^\]]*"pc-[^\]]*)\]\s*\.forEach/g)) for (const id of m[1].match(/pc-[a-z0-9-]+/g)) ids.add(id);
  ids.delete("pc-print"); // optional
  const missing = [...ids].filter((id) => !corporate.includes(`id="${id}"`));
  assert.deepEqual(missing, []);
});

test("TaxComp is a separate app: its own sign-in screen and navigation, no corporate sections", () => {
  assert.match(app, /<html lang="en" data-auth="pending">/);
  assert.ok(!/id="pc-services"|id="pc-contact"|id="pc-calculator"/.test(app), "corporate sections are not in the app");
  assert.match(app, /aria-label="TaxComp navigation"/);
  assert.match(app, /href="\.\.\/"[^>]*>Opitekene Consultancy website</);
  // Every local asset resolves from taxcomp/.
  for (const m of app.matchAll(/\b(?:src|href)="(?!https?:|#|mailto:|tel:|\.\.\/|\.\/)([^"]+)"/g)) assert.fail(`unprefixed local path ${m[1]}`);
});

test("only the website's own files are published", () => {
  const out = execFileSync(process.execPath, [path.join(__dirname, "scripts", "build-pages.mjs"), "--check"], { encoding: "utf8" });
  const files = out.split("\n").slice(1).filter(Boolean);
  assert.ok(files.includes("index.html") && files.includes("taxcomp/index.html") && files.includes("tax-calculator.js"));
  assert.ok(!files.some((f) => /\.(?:pdf|xlsx|py|sql|toml)$|^(?:worker|supabase|docs|scripts)\//.test(f)), "no documents, source or configuration");
});
