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
await page.click("#tax-chat-clear");
check("Clear removes the saved history from the device", await page.evaluate((id) => localStorage.getItem(`taxcomp-chat-history:${id}`) === null, userId) && !((await page.textContent("#tax-chat-messages")) || "").includes("Saved answer"));

check("no script errors", errors.length === 0, errors.join(" | "));

writeFileSync(path.join(shots, "axe-report.json"), JSON.stringify(axeFindings, null, 2));
await browser.close();
await pg.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed. Screenshots: ${shots}`);
process.exitCode = failed.length ? 1 : 0;
