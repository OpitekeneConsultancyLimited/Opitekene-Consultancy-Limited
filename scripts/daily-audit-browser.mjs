// Part of the daily audit: opens the live site in the installed Microsoft Edge
// (headless) and reports page errors. Read-only; signs in to nothing.
//   node scripts/daily-audit-browser.mjs <site-url>
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const site = process.argv[2];
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const { chromium } = await import(pathToFileURL(path.join(root, "node_modules", "playwright-core", "index.mjs")).href);
const browser = await chromium.launch({ channel: "msedge", headless: true });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1366, height: 860 } });
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(site, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(1500);
  const signIn = await page.locator("#auth-gate-root input[type=email]").count();
  const hidden = !(await page.locator("main").isVisible());
  if (!signIn) errors.push("sign-in form did not appear");
  if (!hidden) errors.push("site content visible before sign-in");
} finally {
  await browser.close();
}
if (errors.length) {
  console.log(`BROWSER FAIL: ${errors.slice(0, 3).join(" | ")}`);
  process.exitCode = 1;
} else {
  console.log("BROWSER OK: page loads in Edge, sign-in form shows, site hidden until sign-in, no errors.");
}
