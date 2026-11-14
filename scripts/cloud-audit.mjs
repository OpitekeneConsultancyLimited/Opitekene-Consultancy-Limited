// Cloud audit (audit finding L3): the production checks from scripts/daily-audit.ps1
// that need no secrets, run on GitHub's servers by .github/workflows/scheduled-audit.yml,
// so monitoring does not depend on a PC being switched on. Read-only.
//   node scripts/cloud-audit.mjs [report.json]
// Optional env: GITHUB_TOKEN + GITHUB_REPOSITORY (code-scanning alerts, last
// Pages deploy, previous audit run). Exit code 1 when any check FAILs.
import { writeFileSync, appendFileSync } from "node:fs";

const SITE = process.env.AUDIT_SITE_URL || "https://opitekeneconsultancylimited.github.io/Opitekene-Consultancy-Limited/";
const APP = `${SITE}taxcomp/`;
const WORKER = process.env.AUDIT_WORKER_URL || "https://taxcomp-uganda-chat.omaratomdenis1.workers.dev";
const ORIGIN = new URL(SITE).origin;
const SLOW_MS = 3000;

const results = [];
const add = (area, status, detail, ms) => results.push({ area, status, detail, ...(ms === undefined ? {} : { ms }) });

async function get(url, init = {}) {
  const started = Date.now();
  try {
    const response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(30_000), ...init });
    return { status: response.status, text: await response.text(), ms: Date.now() - started };
  } catch (error) {
    return { status: 0, text: String(error?.message || error), ms: Date.now() - started };
  }
}

async function check(area, fn) {
  try { await fn(); } catch (error) { add(area, "FAIL", `Check crashed: ${error?.message || error}`); }
}

await check("Corporate site", async () => {
  const r = await get(SITE);
  if (r.status !== 200) return add("Corporate site", "FAIL", `Home page returned ${r.status}.`, r.ms);
  add("Corporate site", /class="[^"]*\bcorp\b/.test(r.text) ? "OK" : "WARN", /class="[^"]*\bcorp\b/.test(r.text) ? "Up." : "Up, but the page is not the corporate site.", r.ms);
});

await check("TaxComp app", async () => {
  const r = await get(APP);
  if (r.status !== 200) return add("TaxComp app", "FAIL", `${APP} returned ${r.status}.`, r.ms);
  if (!r.text.includes("auth-gate-root")) return add("TaxComp app", "FAIL", "App page has no sign-in gate.", r.ms);
  add("TaxComp app", "OK", "Up with its sign-in gate.", r.ms);
});

await check("Site files", async () => {
  const files = ["styles.css", "design.css", "account.js", "tax-calculator.js", "site-router.js", "service-worker.js", "manifest.webmanifest"];
  const broken = [];
  for (const f of files) if ((await get(SITE + f)).status !== 200) broken.push(f);
  add("Site files", broken.length ? "FAIL" : "OK", broken.length ? `Failing: ${broken.join(", ")}` : `${files.length} key files load.`);
});

await check("Worker", async () => {
  const r = await get(`${WORKER}/chat`, { headers: { Origin: ORIGIN } });
  add("Worker", r.status === 405 ? "OK" : "FAIL", r.status === 405 ? "Responding." : `GET /chat returned ${r.status} (expected 405).`, r.ms);
});

await check("Worker origin lock", async () => {
  const r = await get(`${WORKER}/chat`, { method: "POST", headers: { Origin: "https://example.invalid", "Content-Type": "application/json" }, body: "{}" });
  add("Worker origin lock", r.status === 403 ? "OK" : "FAIL", r.status === 403 ? "Other websites are refused." : `Foreign origin got ${r.status} (expected 403).`, r.ms);
});

await check("Signed-out access", async () => {
  const r = await get(`${WORKER}/api/challenge/cases`, { headers: { Origin: ORIGIN } });
  add("Signed-out access", r.status === 401 ? "OK" : "FAIL", r.status === 401 ? "Case API refuses requests without sign-in." : `Signed-out request got ${r.status} (expected 401).`, r.ms);
});

await check("Database via API", async () => {
  const r = await get(`${WORKER}/api/legislation/amendments`, { headers: { Origin: ORIGIN } });
  let count = null;
  try { count = (JSON.parse(r.text).amendments || []).length; } catch { /* not JSON */ }
  if (r.status !== 200 || count === null) return add("Database via API", "FAIL", `Amendments API returned ${r.status}; the database may be unreachable.`, r.ms);
  add("Database via API", r.ms > SLOW_MS ? "WARN" : "OK", `Reachable; ${count} amendment records; ${r.ms} ms${r.ms > SLOW_MS ? " (slow)" : ""}.`, r.ms);
});

const token = process.env.GITHUB_TOKEN;
const repo = process.env.GITHUB_REPOSITORY;
async function gh(pathname) {
  const response = await fetch(`https://api.github.com/repos/${repo}/${pathname}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`GitHub API ${pathname.split("?")[0]} returned ${response.status}`);
  return response.json();
}

if (token && repo) {
  await check("Code scanning", async () => {
    const alerts = await gh("code-scanning/alerts?state=open&per_page=100");
    add("Code scanning", alerts.length ? "FAIL" : "OK", alerts.length ? `${alerts.length} open alert(s): ${alerts.slice(0, 5).map((a) => `#${a.number} ${a.rule?.id}`).join(", ")}` : "No open CodeQL alerts.");
  });
  await check("Pages deploy", async () => {
    const { workflow_runs: runs = [] } = await gh("actions/workflows/deploy-pages.yml/runs?branch=main&per_page=1");
    const run = runs[0];
    if (!run) return add("Pages deploy", "WARN", "No Pages deploy found.");
    add("Pages deploy", run.conclusion === "success" ? "OK" : run.status !== "completed" ? "INFO" : "FAIL", `Last run ${run.conclusion || run.status} at ${run.created_at}.`);
  });
  await check("Audit schedule", async () => {
    const { workflow_runs: runs = [] } = await gh("actions/workflows/scheduled-audit.yml/runs?status=success&per_page=1");
    const last = runs[0];
    if (!last) return add("Audit schedule", "INFO", "First successful run not yet recorded.");
    const hours = (Date.now() - Date.parse(last.created_at)) / 3_600_000;
    add("Audit schedule", hours > 26 ? "WARN" : "OK", hours > 26 ? `Previous successful audit was ${hours.toFixed(0)} h ago (missed runs).` : `Previous successful audit ${hours.toFixed(1)} h ago.`);
  });
} else {
  add("GitHub checks", "INFO", "Skipped (no GITHUB_TOKEN).");
}

const fails = results.filter((r) => r.status === "FAIL").length;
const warns = results.filter((r) => r.status === "WARN").length;
const summary = fails ? `${fails} problem(s), ${warns} warning(s)` : warns ? `All up; ${warns} warning(s)` : "All checks passed";
const report = { audit: "taxcomp-cloud-audit-v1", ranAt: new Date().toISOString(), summary, results };

const table = ["| Area | Status | Detail |", "|---|---|---|", ...results.map((r) => `| ${r.area} | ${r.status} | ${r.detail.replace(/\|/g, "/")} |`)].join("\n");
console.log(`TaxComp cloud audit: ${summary}\n\n${table}`);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## TaxComp cloud audit: ${summary}\n\n${table}\n`);
if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify(report, null, 2) + "\n");
process.exitCode = fails ? 1 : 0;
