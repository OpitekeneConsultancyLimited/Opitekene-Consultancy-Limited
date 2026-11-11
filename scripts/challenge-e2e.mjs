#!/usr/bin/env node
// End-to-end test of Challenge an Assessment in Microsoft Edge (playwright-core).
// The real site files are served to the browser; the real Worker code runs in
// this process on PGlite (Postgres) with the fake Supabase Auth/Storage, so no
// production service is touched and nothing costs money.
//
//   node scripts/challenge-e2e.mjs [screenshot-dir]
//
// Covers: sign-in gate, consent, paste/upload, confirmation, DL-1 banner,
// reconciliation + CLS-1/CLS-2, LAW-1 note, research, both views, free
// downloads, plan + review gates on the pack, pack download (DOCX), deletion,
// error states, accessibility basics, a 360 px phone layout and every
// existing route.
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { handleRequest } from "../worker/index.mjs";
import { clearSupabaseKeyCache } from "../worker/supabase-auth.mjs";
import { createMigratedDatabase } from "../worker/pglite-test-support.mjs";
import { createFakeSupabase } from "../worker/supabase-test-fakes.mjs";
import docx from "../challenge-docx.js";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const shots = process.argv[2] || path.join(root, ".e2e-screens");
mkdirSync(shots, { recursive: true });
const SITE = "https://taxcomp.test";
const WORKER = "https://taxcomp-uganda-chat.omaratomdenis1.workers.dev";
const today = new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);
const daysAgo = (n) => { const d = new Date(`${today}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); };

const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok: Boolean(ok) }); console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && detail ? ` (${detail})` : ""}`); };

// axe-core (WCAG 2.0/2.1 A and AA rules) on each screen of #challenge-root.
// Serious and critical problems fail the run; minor and moderate ones are
// written to axe-report.json for the screen-reader pass.
const AXE_SOURCE = readFileSync(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8");
const axeFindings = [];
async function axeScan(page, label, scope = "#challenge-root") {
  if (!(await page.evaluate(() => Boolean(window.axe)))) await page.addScriptTag({ content: AXE_SOURCE });
  const violations = await page.evaluate(async (selector) => (await window.axe.run(selector, {
    runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] },
  })).violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.slice(0, 3).map((n) => n.target.join(" ")) })), scope);
  axeFindings.push({ screen: label, violations });
  const blocking = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  check(`axe (WCAG 2.1 AA): no serious problems on ${label}`, blocking.length === 0, blocking.map((v) => `${v.id}: ${v.nodes.join(", ")}`).join("; "));
}

clearSupabaseKeyCache();
const { pg, db } = await createMigratedDatabase();
const supabase = await createFakeSupabase(pg);
const env = { UNANSWERED_QUESTIONS: db, DATABASE_PROVIDER: "supabase", ALLOWED_ORIGIN: SITE, SUPABASE_URL: supabase.url, SUPABASE_FETCH: supabase.fetch,
  SUPABASE_SERVICE_ROLE_KEY: supabase.serviceKey, CHAT_LIMITER: { limit: async () => ({ success: true }) } };
const { token, userId } = await supabase.issueToken({ email: "e2e-owner@example.com" });

const FAKE_SUPABASE_JS = `const session = { access_token: ${JSON.stringify(token)}, user: { id: ${JSON.stringify(userId)}, email: "e2e-owner@example.com" } };
export function createClient() { return { auth: {
  getSession: async () => ({ data: { session } }),
  onAuthStateChange: (cb) => { setTimeout(() => cb("INITIAL_SESSION", session), 0); return { data: { subscription: { unsubscribe() {} } } }; },
  signOut: async () => ({ error: null }), signInWithPassword: async () => ({ data: { session }, error: null }), signUp: async () => ({ data: { session }, error: null }),
  resetPasswordForEmail: async () => ({}), updateUser: async () => ({ error: null }) } }; }`;

const NOTICE = `UGANDA REVENUE AUTHORITY
NOTICE OF ADDITIONAL ASSESSMENT - INCOME TAX
TIN: 1000123456
Tax period: 01/07/2026 to 31/07/2026
Date of assessment: ${daysAgo(45).split("-").reverse().join("/")}
Principal tax: UGX 18,400,000
Penal tax at 20%: UGX 3,680,000
Interest at 2% per month for 6 months: UGX 2,208,000
Total amount due: UGX 24,288,000
Reasons: Expenses claimed were not supported by invoices.`;

// Edge locally; CI sets E2E_BROWSER_CHANNEL=chrome (GitHub's Linux runners have Chrome).
const browser = await chromium.launch({ channel: process.env.E2E_BROWSER_CHANNEL || "msedge", headless: true });
const context = await browser.newContext({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, serviceWorkers: "block", acceptDownloads: true });
let failNextApi = false;
await context.route("https://cdn.jsdelivr.net/npm/@supabase/**", (route) => route.fulfill({ status: 200, contentType: "application/javascript", body: FAKE_SUPABASE_JS }));
await context.route("https://fonts.googleapis.com/**", (route) => route.fulfill({ status: 200, contentType: "text/css", body: "" }));
await context.route(`${SITE}/**`, (route) => {
  const p = decodeURIComponent(new URL(route.request().url()).pathname).replace(/^\/+/, "") || "index.html";
  try {
    const body = readFileSync(path.join(root, p));
    const type = p.endsWith(".html") ? "text/html" : p.endsWith(".js") ? "application/javascript" : p.endsWith(".css") ? "text/css" : p.endsWith(".png") ? "image/png" : p.endsWith(".webmanifest") ? "application/manifest+json" : "application/octet-stream";
    return route.fulfill({ status: 200, contentType: type, body });
  } catch { return route.fulfill({ status: 404, body: "not found" }); }
});
await context.route(`${WORKER}/**`, async (route) => {
  const req = route.request();
  if (failNextApi && req.method() !== "OPTIONS") { failNextApi = false; return route.abort("internetdisconnected"); }
  const headers = { ...req.headers(), origin: SITE };
  const body = ["GET", "HEAD"].includes(req.method()) ? undefined : req.postDataBuffer();
  const response = await handleRequest(new Request(req.url(), { method: req.method(), headers, body }), env);
  const buf = Buffer.from(await response.arrayBuffer());
  return route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: buf });
});

const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|net::ERR_INTERNET_DISCONNECTED/.test(m.text())) errors.push(m.text()); });
const root$ = "#challenge-root";
const text = async () => (await page.textContent(root$)) || "";
const clickButton = async (name) => { await page.getByRole("button", { name, exact: false }).first().click(); await page.waitForFunction(() => !document.querySelector("#challenge-root")?.textContent?.includes("Working…")); };

await page.goto(`${SITE}/index.html#challenge`);
await page.waitForFunction(() => document.documentElement.dataset.auth === "in", null, { timeout: 15_000 });
check("sign-in gate opens through account.js", true);
await page.waitForSelector(`${root$} >> text=Before you upload anything`, { timeout: 15_000 });
check("consent screen before the first upload", (await text()).includes("Who can see it"));
await page.screenshot({ path: path.join(shots, "1-consent-360.png"), fullPage: true });
await axeScan(page, "consent");
await clickButton("I agree, continue");
await clickButton("Start a new case");
check("new case opens on the notice step", (await text()).includes("Add your assessment notice"));
check("deadline unknown before the date is given (DL-3)", (await text()).includes("Deadline unknown: tell us when you received this"));

// Error state: too little text.
await page.fill("#ch-text", "short");
await clickButton("Read the text");
check("error state: too little text is explained", (await text()).includes("not enough text"));
// Error state: network failure.
failNextApi = true;
await page.fill("#ch-text", NOTICE);
await clickButton("Read the text");
check("error state: network failure is explained", (await text()).includes("could not reach TaxComp"));
await clickButton("Read the text");
check("notice read into figures to confirm", (await text()).includes("Check every figure against your notice"), (await text()).slice(0, 400));
check("figures are not used before confirmation", (await page.inputValue("#ch-f-principal")) === "18400000");
await page.screenshot({ path: path.join(shots, "2-confirm-360.png"), fullPage: true });
await axeScan(page, "check the figures");
await clickButton("Save and continue");
check("figures confirmed, dates step shown", (await text()).includes("When did you receive the notice?"));
await page.fill("#ch-served", daysAgo(40));
await page.selectOption("#ch-method", "email");
await clickButton("Save and continue");
check("DL-1: 5 days left, urgent banner", (await text()).includes("Urgent: 5 days left to object"));
check("provisional label shown", (await text()).includes("Provisional: rules pending legal review"));
const [icsDownload] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Add to my calendar" }).first().click()]);
const ics = readFileSync(await icsDownload.path(), "utf8");
check("calendar reminder: .ics with the last day and three alerts", ics.includes(`DTSTART;VALUE=DATE:${daysAgo(-5).replace(/-/g, "")}`) && (ics.match(/BEGIN:VALARM/g) || []).length === 3 && icsDownload.suggestedFilename().endsWith(".ics"));

// Records: CLS-1 and CLS-2.
await clickButton("Add an item");
await page.fill("#ch-i0-desc", "Expenses URA disallowed");
await page.fill("#ch-i0-ura", "0");
await page.fill("#ch-i0-mine", "25000000");
await page.selectOption("#ch-i0-has", "no");
await page.fill("#ch-i0-missing", "supplier invoices");
await clickButton("Add an item");
await page.selectOption("#ch-i1-cat", "interest");
await page.fill("#ch-i1-desc", "Interest on the notice");
await page.fill("#ch-i1-ura", "2208000");
await page.fill("#ch-i1-rate", "2");
await page.fill("#ch-i1-months", "4");
await clickButton("Save and see where you stand");
const owner = await text();
check("CLS-1 owner wording lists the invoices", owner.includes("This item may be allowable, but you need supplier invoices to support it."));
check("CLS-2 owner wording shows the difference", owner.includes("We found a difference of UGX 736,000"));
check("LAW-1 note about the 20 August assent", owner.includes("assented on 20 August 2026"));
check("research links a TAT decision", owner.includes("[2023] UGTAT 2"));
await page.screenshot({ path: path.join(shots, "3-results-owner-360.png"), fullPage: true });
await axeScan(page, "where you stand (owner view)");
await page.getByRole("button", { name: "Professional" }).click();
const pro = await text();
check("professional view shows the classification table", pro.includes("Computational error (arithmetic, rate, period or credit mismatch)") && pro.includes("1,472,000"));
check("professional view shows counting assumptions", pro.includes("TODO_VERIFY"));
await page.screenshot({ path: path.join(shots, "4-results-pro-360.png"), fullPage: true });
await axeScan(page, "where you stand (professional view)");
const wide = await page.evaluate(() => [`scrollWidth=${document.documentElement.scrollWidth}`, ...[...document.body.querySelectorAll("*")].filter((el) => el.getBoundingClientRect().right > 362 && !el.parentElement?.closest(".ch-table-wrap") && getComputedStyle(el).display !== "none").slice(0, 8).map((el) => `${el.tagName}.${el.className} ${Math.round(el.getBoundingClientRect().right)}: ${(el.textContent || "").slice(0, 50)}`)]);
check("no sideways scroll at 360 px", await page.evaluate(() => document.documentElement.scrollWidth <= 361), wide.join(" | "));

// Pack.
await page.getByRole("button", { name: "6. Your pack" }).click();
check("full pack needs a paid plan (free outputs still offered)", (await text()).includes("needs a paid plan") && (await text()).includes("Summary and checklist (Word)"));
check("offers: reviewed pack at UGX 250,000 (WhatsApp while online payment is off) and a managed-dispute quote",
  (await text()).includes("Reviewed pack: UGX 250,000 for this case") && await page.getByRole("link", { name: "Pay by mobile money through WhatsApp" }).isVisible() && await page.getByRole("link", { name: "Ask for a quote on WhatsApp" }).isVisible());
const [freeDownload] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Summary and checklist (Word)" }).click()]);
const freeText = await docx.readDocxText(readFileSync(await freeDownload.path()).buffer);
check("free summary downloads as Word", freeText.includes("Your assessment explained") && freeText.includes("Evidence checklist"));
await pg.query("INSERT INTO taxcomp.billing_accounts (user_id, email, created_at, updated_at) VALUES ($1, 'e2e-owner@example.com', now()::text, now()::text)", [userId]);
await pg.query(`INSERT INTO taxcomp.billing_subscriptions (id, user_id, plan_id, status, current_period_start, current_period_end, created_at, updated_at)
  VALUES ('e2e-sub', $1, 'individual-monthly', 'active', '2020-01-01T00:00:00.000Z', '2099-01-01T00:00:00.000Z', now()::text, now()::text)`, [userId]);
await page.getByRole("button", { name: "5. Where you stand" }).click();
await page.getByRole("button", { name: "6. Your pack" }).click();
await page.selectOption(`${root$} .ch-checklist select >> nth=0`, "received");
await clickButton("Save checklist");
check("evidence checklist saved on the server", (await pg.query("SELECT checklist_json FROM taxcomp.challenge_cases")).rows[0].checklist_json.includes("received"));
const [packDownload] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download the pack (Word)" }).click()]);
const packText = await docx.readDocxText(readFileSync(await packDownload.path()).buffer);
writeFileSync(path.join(shots, "pack.txt"), packText);
check("pack downloads: objection letter first, then checklist, schedules, briefing", /^Provisional[\s\S]*Notice of objection[\s\S]*Evidence checklist[\s\S]*Supporting schedules[\s\S]*Management briefing/.test(packText));
check("pack lists every arguable ground", packText.includes("Ground 1: Expenses URA disallowed") && packText.includes("Ground 2: Interest on the notice"));
check("pack contains no banned phrase", !/assessment is invalid|you will win|URA is wrong|guarantee/i.test(packText));
await axeScan(page, "your pack");

// Accessibility basics on every step.
const a11y = await page.evaluate(() => {
  const problems = [];
  for (const el of document.querySelectorAll("#challenge-root input, #challenge-root select, #challenge-root textarea")) {
    const labelled = el.getAttribute("aria-label") || (el.id && document.querySelector(`label[for="${el.id}"]`)) || el.closest("label");
    if (!labelled) problems.push(`unlabelled ${el.tagName} ${el.id}`);
  }
  for (const el of document.querySelectorAll("#challenge-root button")) if (!el.textContent.trim() && !el.getAttribute("aria-label")) problems.push("button without a name");
  const lum = (c) => { const [r, g, b] = c.match(/\d+/g).slice(0, 3).map(Number).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  for (const el of document.querySelectorAll(".ch-banner, .ch-message, .ch-steps button, .btn-primary")) {
    const s = getComputedStyle(el); const bg = s.backgroundColor;
    if (!bg || bg.includes("0, 0, 0, 0")) continue;
    const [l1, l2] = [lum(s.color), lum(bg)].sort((a, b) => b - a);
    const ratio = (l1 + 0.05) / (l2 + 0.05);
    if (ratio < 4.5) problems.push(`contrast ${ratio.toFixed(2)} on ${el.className}`);
  }
  return problems;
});
check("accessibility: labels, button names, contrast ≥ 4.5:1", a11y.length === 0, a11y.join("; "));
await page.keyboard.press("Tab");
check("keyboard: focus moves to a control", await page.evaluate(() => document.activeElement && document.activeElement !== document.body));

// Review gate (REV-1) from the browser: raise the principal above the threshold.
await page.getByRole("button", { name: "2. Check the figures" }).click();
await page.fill("#ch-f-principal", "75000000");
await clickButton("Save and continue");
await page.getByRole("button", { name: "6. Your pack" }).click();
check("REV-1: pack locked until a reviewer signs off", (await text()).includes("A reviewer must sign off this case"));

// Delete.
await page.getByRole("button", { name: "Delete this case" }).click();
await clickButton("Yes, delete it");
check("one-click deletion removes the case", (await text()).includes("No cases yet") && (await pg.query("SELECT count(*)::int AS n FROM taxcomp.challenge_cases")).rows[0].n === 0);

// PAYE: the reader recognises the notice, and the records step offers PAYE items.
await clickButton("Start a new case");
await page.fill("#ch-text", NOTICE.replace("NOTICE OF ADDITIONAL ASSESSMENT - INCOME TAX", "NOTICE OF ADDITIONAL ASSESSMENT - PAY AS YOU EARN (PAYE)")
  .replace("Reasons: Expenses claimed were not supported by invoices.", "Reasons: Allowances paid to employees were left out of PAYE."));
await clickButton("Read the text");
check("PAYE notice: tax read as PAYE", (await page.inputValue("#ch-f-tax_head")) === "paye");
await clickButton("Save and continue");
await page.fill("#ch-served", daysAgo(20));
await clickButton("Save and continue");
await clickButton("Add an item");
const payeOptions = await page.$$eval("#ch-i0-cat option", (options) => options.map((o) => o.value));
check("PAYE records step offers PAYE items first, and no VAT items", payeOptions[0] === "employment_income" && !payeOptions.includes("input_vat"), payeOptions.join(","));
await axeScan(page, "PAYE records step");
await page.getByRole("button", { name: "6. Your pack" }).click();
await page.getByRole("button", { name: "Delete this case" }).click();
await clickButton("Yes, delete it");

// Reviewer screens: make this user a legal approver, reload, open Law and cases admin.
await pg.query("INSERT INTO taxcomp.challenge_reviewers (user_id, email, can_approve_law, created_at) VALUES ($1, 'e2e-owner@example.com', 1, now()::text)", [userId]);
await page.reload();
await page.waitForFunction(() => document.documentElement.dataset.auth === "in", null, { timeout: 15_000 });
await page.getByRole("tab", { name: "Law and cases admin" }).or(page.getByRole("button", { name: "Law and cases admin" })).first().click();
await page.waitForSelector(`${root$} >> text=Public holidays`, { timeout: 10_000 });
check("A3: holiday list starts folded", !(await page.isVisible(`${root$} .ch-holidays .ch-law-list`)));
await page.click(`${root$} .ch-holidays > summary`);
const admin = await text();
const listedDates = [...admin.matchAll(/(\d{4}-\d{2}-\d{2}) · /g)].map((m) => m[1]);
check("A3: law admin lists upcoming holidays only, as not yet confirmed",
  admin.includes("Christmas Day") && admin.includes("not yet confirmed") && listedDates.length > 0 && listedDates.every((d) => d >= today), listedDates.slice(0, 3).join(", "));
await page.screenshot({ path: path.join(shots, "6-law-admin-360.png"), fullPage: true });
await axeScan(page, "law and cases admin");
check("no sideways scroll on law admin at 360 px", await page.evaluate(() => document.documentElement.scrollWidth <= 361));
check("legislative watch panel explains that Bills are not law", admin.includes("Legislative watch") && admin.includes("A Bill is proposed law only"));

// Existing routes still work.
for (const [hash, selector] of [["home", "#paye-preview"], ["tools", "#tools"], ["calc-paye", "#estimator"], ["knowledge", "#knowledge"], ["kb-laws", "#kb-law-register"], ["kb-cases", "#kb-case-register"], ["assistant", "#tax-chat"], ["workspace", "#workspace"], ["ws-assessments", "#ws-assessments-root"], ["about", "#about"], ["privacy", "#privacy"]]) {
  await page.evaluate((h) => { location.hash = h; }, hash);
  await page.waitForTimeout(250);
  check(`route #${hash} shows its content`, await page.isVisible(selector));
}
await page.evaluate(() => { location.hash = "workspace"; });
await page.waitForTimeout(400);
check("no sideways scroll on #workspace at 360 px", await page.evaluate(() => document.documentElement.scrollWidth <= 361), await page.evaluate(() => [...document.body.querySelectorAll("*")].filter((el) => { const w = el.getBoundingClientRect().width; return w > 365 && getComputedStyle(el).position !== "fixed" && [...el.children].every((c) => c.getBoundingClientRect().width <= 365); }).slice(0, 4).map((el) => { let s = el; while (s && !s.id) s = s.parentElement; return `${el.tagName}.${el.className} in #${s?.id} w=${Math.round(el.getBoundingClientRect().width)}`; }).join(" | ")));
await page.waitForFunction(() => document.querySelector("#kb-case-register")?.dataset.loaded === "1", null, { timeout: 5000 }).catch(() => {});
check("knowledge centre reads the case register", ((await page.textContent("#kb-case-register")) || "").includes("UGTAT"));
await page.evaluate(() => { location.hash = "kb-laws"; });
await page.waitForFunction(() => document.querySelector("#kb-law-register")?.dataset.loaded === "1", null, { timeout: 5000 }).catch(() => {});
check("knowledge centre reads the law register", ((await page.textContent("#kb-law-register")) || "").includes("Income Tax (Amendment) Act, 2026"));
const register = (await page.textContent("#kb-law-register")) || "";
check("Law Register lists the five added Acts", ["Stamp Duty Act (Cap. 339)", "Lotteries and Gaming Act (Cap. 334)", "Convention on Mutual Administrative Assistance in Tax Matters (Implementation) Act (Cap. 335)", "East African Crude Oil Pipeline (Special Provisions) Act (Cap. 156)", "National Social Security Fund Act (Cap. 230)"].every((t) => register.includes(t)));
check("Law Register shows the Tax Appeals Tribunals Act as Cap. 341", register.includes("Tax Appeals Tribunals Act (Cap. 341)") && !register.includes("Cap. 345"));
await page.screenshot({ path: path.join(shots, "5-kb-laws-360.png"), fullPage: false });
const paye = await page.evaluate(() => { location.hash = "home"; return true; }) && await page.textContent("#paye-preview-tax");
check("PAYE preview still calculates", /UGX|[0-9]/.test(paye || ""));
// Knowledge Centre search across the whole library.
await page.evaluate(() => { location.hash = "knowledge"; });
await page.waitForTimeout(250);
await page.fill("#kb-search", "rental income");
await page.waitForSelector("#kb-search-results .kb-search-hit", { timeout: 5000 }).catch(() => {});
const kbHits = await page.$$eval("#kb-search-results .kb-search-hit", (nodes) => nodes.length);
check("knowledge search finds guides across the library", kbHits > 0, `hits=${kbHits}`);
if (kbHits) {
  await page.click("#kb-search-results .kb-search-hit >> nth=0");
  // styles.css uses smooth scrolling: wait for the scroll to finish.
  await page.waitForFunction(() => { const el = document.querySelector(".kb-hit"); if (!el) return false; const r = el.getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0; }, null, { timeout: 5000 }).catch(() => {});
  const shown = await page.evaluate(() => { const el = document.querySelector(".kb-hit"); if (!el) return { ok: false, why: "no .kb-hit element" }; const r = el.getBoundingClientRect(); return { ok: r.height > 0 && r.top < innerHeight && r.bottom > 0, why: `${el.tagName} top=${Math.round(r.top)} h=${Math.round(r.height)} view=${document.documentElement.dataset.view}` }; });
  check("choosing a result shows it on screen", shown.ok, shown.why);
}
await page.fill("#kb-search", "zzqqxx");
await page.waitForTimeout(300);
check("knowledge search says when nothing matches", ((await page.textContent("#kb-search-results")) || "").includes("Nothing found"));
await axeScan(page, "knowledge search", "#knowledge");

// Structure of the tax Acts, from the legislative database through /api/legislation.
await page.waitForSelector("#kb-law-index details.law-index-act", { timeout: 8000 }).catch(() => {});
check("Knowledge Centre lists the 18 tax Acts and regulations from the database", (await page.$$eval("#kb-law-index details.law-index-act", (n) => n.length)) === 18);
check("each Act shows its verification status: the six Acts amended in 2026 need amendment review, the rest are unverified",
  (await page.$$eval("#kb-law-index details.law-index-act summary .law-status.is-unverified", (n) => n.length)) === 12
  && (await page.$$eval("#kb-law-index details.law-index-act summary .law-status.is-requires_amendment_review", (n) => n.length)) === 6);
// The 2026 amendments register: grouped by Act, both figures where the Bill and the reported Act differ.
await page.click("#kb-law-index details.law-amendments > summary").catch(() => {});
const amendmentsText = (await page.textContent("#kb-law-index details.law-amendments").catch(() => "")) || "";
check("Knowledge Centre lists the 53 changes made in 2026 by Act", amendmentsText.includes("Changes made in 2026 (53)") && (await page.$$eval("#kb-law-index .law-amendments-act", (n) => n.length)) === 8);
check("the VAT threshold change shows the Bill figure and the reported enacted figure, flagged", amendmentsText.includes("UGX 250,000,000") && amendmentsText.includes("UGX 300,000,000")
  && (await page.$$eval("#kb-law-index .law-amendments-list li.is-conflict", (n) => n.length)) === 5);
check("Bill-only changes are labelled as not confirmed as enacted", amendmentsText.includes("In the published Bill only; not confirmed as enacted"));
check("the 2026 amendment is flagged as not reflected", ((await page.textContent("details[data-law='ita']")) || "").includes("Not reflected here: Income Tax (Amendment) Act, 2026"));
await page.click("details[data-law='vata'] > summary");
await page.waitForSelector("#law-vata-s16", { timeout: 5000 }).catch(() => {});
check("expanding the VAT Act shows its Parts, sections and schedules", ((await page.textContent("details[data-law='vata']")) || "").includes("Part IV – Supplies of Goods and Services") && (await page.textContent("#law-vata-s16"))?.includes("Place of supply of services") && ((await page.textContent("details[data-law='vata']")) || "").includes("Schedule 3 – Exempt supplies"));
for (const [query, expected] of [["foreign tax credit", "Section 80 – Foreign tax credit"], ["international payments", "Section 82 – Tax on international payments"], ["place of supply of services", "Section 16 – Place of supply of services"]]) {
  await page.fill("#law-search", query);
  await page.waitForFunction((want) => document.querySelector("#law-search-results .kb-search-hit")?.textContent?.includes(want), expected, { timeout: 5000 }).catch(() => {});
  const first = (await page.textContent("#law-search-results .kb-search-hit") || "");
  check(`Act search "${query}" returns ${expected} first`, first.includes(expected), first);
}
await page.fill("#kb-search", "foreign tax credit");
await page.waitForFunction(() => [...document.querySelectorAll("#kb-search-results .kb-search-hit")].some((b) => b.textContent.includes("Section 80 – Foreign tax credit")), null, { timeout: 5000 }).catch(() => {});
const lawHit = page.locator("#kb-search-results .kb-search-hit", { hasText: "Section 80 – Foreign tax credit" }).first();
check("the Knowledge Centre search box also finds Income Tax Act s.80 from the database", (await lawHit.count()) === 1);
if (await lawHit.count()) {
  await lawHit.click();
  await page.waitForSelector("#law-ita-s80", { timeout: 5000 }).catch(() => {});
  check("choosing it opens the Act at that section", await page.$eval("details[data-law='ita']", (d) => d.open) && Boolean(await page.$("#law-ita-s80")));
}
await page.fill("#kb-search", "");await axeScan(page, "structure of the tax Acts", "#tax-laws");

// Guided international tax question: asks for missing facts, answers in the
// standard order, cites a reviewed record, and hands over to the calculator.
await pg.query("UPDATE taxcomp.knowledge_records SET status = 'verified', reviewed_by = 'e2e-approver', reviewed_at = $1, review_note = 'e2e' WHERE id = 'intl.foreign-tax-credit'", [new Date().toISOString()]);
await page.evaluate(() => { location.hash = "international-tax"; });
await page.fill("#intl-guide-question", "I received consulting fees from a client in Kenya and tax was withheld there");
await page.click("#intl-guide-form button[type=submit]");
const asked = await page.$$eval("#intl-guide-questions label", (nodes) => nodes.map((n) => n.textContent));
check("guided question asks only for the missing facts", asked.length >= 2 && asked.some((q) => q.includes("live for tax purposes")) && !asked.some((q) => q.includes("Which other country")), asked.join(" | "));
for (const select of await page.$$("#intl-guide-questions select")) {
  const values = await select.$$eval("option", (options) => options.map((o) => o.value).filter(Boolean));
  await select.selectOption(values.includes("UG") ? "UG" : values.includes("2026/27") ? "2026/27" : values[0]);
}
await page.click("#intl-guide-form button[type=submit]");
await page.waitForSelector("#intl-guide-answer:not([hidden])", { timeout: 5000 }).catch(() => {});
const answerText = (await page.textContent("#intl-guide-answer")) || "";
check("guided answer follows the standard order", ["What we understood", "Short answer", "The rules", "In plain terms", "What to do", "Sources", "Assumptions"].every((h, i, all) => answerText.indexOf(h) >= 0 && (i === 0 || answerText.indexOf(all[i - 1]) < answerText.indexOf(h))), answerText.slice(0, 300));
check("guided answer cites the reviewed record and the Primer by chapter only", answerText.includes("Reviewed") && /Chapter 4: Double Taxation Relief/.test(answerText) && !/\bp\.\s*\d/.test(answerText));
check("guided answer states no tax rate", !/\d\s?%/.test(answerText));
check("guided answer cites the Income Tax Act by section", answerText.includes("s.80 Foreign tax credit") && answerText.includes("s.88 International agreements"));
await axeScan(page, "guided international question", "#intl-guide");
await page.locator("#intl-guide").screenshot({ path: path.join(shots, "intl-guide.png") });
await page.getByRole("button", { name: "Work out my figures" }).click();
check("calculator opens on the foreign tax credit", (await page.inputValue("#international-tax-method")) === "foreignTaxCredit");
await page.fill("#international-foreignIncomeUGX", "10000000");
await page.fill("#international-foreignTaxPaidUGX", "1500000");
await page.fill("#international-ratePercent", "30");
await page.click("#international-tax-form button[type=submit]");
check("a rate without its source is refused", ((await page.textContent("#international-tax-error")) || "").length > 0 || await page.$eval("#international-rateSource", (el) => !el.validity.valid));
await page.fill("#international-rateSource", "Rate typed in for the e2e test");
await page.click("#international-tax-form button[type=submit]");
const working = (await page.textContent("#international-tax-result")) || "";
check("calculation shows figures, rule, formula, steps and assumptions", ["Figures used", "Rule", "Formula", "Steps", "Assumptions", "UGX 3,000,000", "UGX 1,500,000"].every((s) => working.includes(s)), working.slice(0, 300));
await axeScan(page, "calculation with working", "#international-tax");

// Chat history: kept on this device for this user, and Clear removes it.
await page.evaluate((id) => localStorage.setItem(`taxcomp-chat-history:${id}`, JSON.stringify([
  { role: "user", text: "What is the VAT registration threshold?", sources: [], calculators: [], meta: {} },
  { role: "assistant", text: "Saved answer from an earlier visit.", sources: [], calculators: ["vat"], meta: { answerSource: "local" } },
])), userId);
await page.reload();
await page.waitForFunction(() => document.documentElement.dataset.auth === "in", null, { timeout: 15_000 });
await page.evaluate(() => { location.hash = "assistant"; });
await page.waitForFunction(() => document.querySelector("#tax-chat-messages")?.textContent?.includes("Saved answer from an earlier visit."), null, { timeout: 5000 }).catch(() => {});
const chatText = (await page.textContent("#tax-chat-messages")) || "";
check("chat history comes back after a reload, marked as kept on this device", chatText.includes("Saved answer from an earlier visit.") && chatText.includes("kept on this device only"));
// The AI assistant retrieves provisions from the legislative database.
await page.fill("#tax-chat-input", "What is a foreign tax credit in Uganda?");
await page.click("#tax-chat-form button[type=submit]");
await page.waitForSelector(".tax-chat-legislation", { timeout: 8000 }).catch(() => {});
const legBlock = (await page.textContent(".tax-chat-legislation")) || "";
check("chat answer lists the provision retrieved from the database", legBlock.includes("Income Tax Act (Cap. 338), s.80 – Foreign tax credit") && legBlock.includes("Unverified structure only"));
const chatAnswer = (await page.textContent("#tax-chat-messages")) || "";
check("chat answer says only headings are held and no wording is invented", chatAnswer.includes("cannot state the conditions, rates or legal effect") && chatAnswer.includes("may not reflect the law in force"));
await page.click("#tax-chat-clear");
check("Clear removes the saved history from the device", await page.evaluate((id) => localStorage.getItem(`taxcomp-chat-history:${id}`) === null, userId) && !((await page.textContent("#tax-chat-messages")) || "").includes("Saved answer"));

// Phase 12: personalised dashboard.
// Opening the site with no section in the address while signed in lands on the dashboard; #home still shows Home.
{
  const landing = await context.newPage();
  await landing.goto(`${SITE}/index.html`);
  await landing.waitForFunction(() => document.documentElement.dataset.view === "workspace", null, { timeout: 8000 }).catch(() => {});
  check("signed in with no section in the address: the site opens on My dashboard",
    await landing.evaluate(() => document.documentElement.dataset.view === "workspace" && location.hash === "#workspace" && !document.querySelector("[data-pane='dashboard']").hidden));
  await landing.goto(`${SITE}/index.html#home`);
  await landing.waitForTimeout(500);
  check("the Home link still shows Home", await landing.evaluate(() => document.documentElement.dataset.view === "home"));
  await landing.close();
}
await page.evaluate(() => { location.hash = "workspace"; });
await page.waitForSelector("#dashboard-root form.dash-onboarding", { timeout: 8000 }).catch(() => {});
check("first visit to the workspace shows onboarding", Boolean(await page.$("#dashboard-root form.dash-onboarding")));
await page.selectOption("#dash-q-userCategory", "small_business");
await page.selectOption("#dash-q-purpose", "business");
await page.selectOption("#dash-q-businessType", "company");
await page.selectOption("#dash-q-knowledgeLevel", "none");
await page.check("#dashboard-root input[name=interests][value=vat]");
await page.click("#dashboard-root form.dash-onboarding button[type=submit]");
await page.waitForSelector("#dashboard-root .dash-head", { timeout: 8000 }).catch(() => {});
const dashText = (await page.textContent("#dashboard-root")) || "";
check("dashboard is set up for a small business owner, in Simple mode", dashText.includes("SMALL BUSINESS OWNER") && (await page.getAttribute("#dashboard-root .dash-mode button:has-text('Simple')", "aria-pressed")) === "true");
check("a beginner sees the Tax Companion first and the learning module", Boolean(await page.$("#dashboard-root .dash-companion.is-prominent")) && Boolean(await page.$("[data-module='learning']")) && Boolean(await page.$("[data-module='corporation-tax']")));
check("recommendations say why", dashText.includes("Find out which taxes may apply to your business.") && dashText.includes("Why:"));
await axeScan(page, "personalised dashboard", "#dashboard-root");
await page.selectOption("#dash-fact-employsStaff", "yes");
await page.selectOption("#dash-fact-vatRegistered", "no");
await page.click(".dash-discover-form button[type=submit]");
await page.waitForSelector("[data-obligation='corporation-tax']", { timeout: 8000 }).catch(() => {});
const cit = (await page.textContent("[data-obligation='corporation-tax']").catch(() => "")) || "";
check("obligation check: corporation tax applies on the facts, citing the database", cit.includes("Applies on the facts you gave") && cit.includes("Income Tax Act (Cap. 338), s.7"));
check("obligation check: VAT registration needs checking, not assumed", ((await page.textContent("[data-obligation='vat-registration']").catch(() => "")) || "").includes("May apply") && !(await page.$("[data-obligation='vat']")));
check("recommendations follow the obligation check", ((await page.textContent("#dashboard-root .dash-recs")) || "").includes("You may need to review your corporation income tax obligations for the current year."));
await page.locator("#dashboard-root .dash-mode button", { hasText: "Professional" }).click();
await page.waitForFunction(() => document.querySelector("#dashboard-root .dash-mode button[aria-pressed='true']")?.textContent === "Professional", null, { timeout: 5000 }).catch(() => {});
check("Professional mode shows technical detail", ((await page.textContent("[data-module='corporation-tax']")) || "").includes("Income Tax Act s.7"));
await page.fill("#dash-companion-input", "How do I calculate VAT?");
await page.click(".dash-companion-form button[type=submit]");
check("Tax Companion sends a VAT question to the VAT calculator", (await page.getAttribute("#dash-companion-answer a.dash-link", "href").catch(() => null)) === "#calc-vat");
await page.screenshot({ path: path.join(shots, "6-dashboard-360.png"), fullPage: false });
await page.click("#dashboard-root .dash-head-actions button:has-text('Edit my profile')");
check("the profile can be changed later", Boolean(await page.$("#dashboard-root form.dash-onboarding")) && (await page.inputValue("#dash-q-businessType")) === "company");

check("no script errors", errors.length === 0, errors.join(" | "));

writeFileSync(path.join(shots, "axe-report.json"), JSON.stringify(axeFindings, null, 2));
await browser.close();
await pg.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed. Screenshots: ${shots}`);
process.exitCode = failed.length ? 1 : 0;
