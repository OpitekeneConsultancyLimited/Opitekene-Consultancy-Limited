#!/usr/bin/env node
// Local development server for the whole system. Two modes:
//
//   npm run dev                  Local Supabase (Docker): real Postgres, Auth, Storage
//                                and email capture on this PC, the same services as
//                                production. Works offline once the Docker images and
//                                supabase-js have been downloaded (first run, online).
//   npm run dev -- --lite        No Docker: in-memory Postgres (PGlite) and a local
//                                sign-in stand-in (any email). Data is lost on stop.
//
// Options: --port 8788 · --reset (re-create the local database from the migrations)
//          --reviewer you@example.com (make that signed-up user a legal reviewer and
//          approver, to try the verification workflows; in --lite every user is one)
//
// In both modes the real Worker code runs in this process, the site files are served
// from this folder, and nothing calls production. AI providers and Flutterwave are
// never called (no keys), so answers come from TaxComp's own guided answers, impact
// engine and legislation database. Stop with Ctrl+C; `npm run dev:stop` stops Docker.
import { execFileSync, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applyPolicy, buildPolicy } from "./site-csp.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : fallback; };
const PORT = Number(option("port", process.env.PORT || 8788));
const ORIGIN = `http://localhost:${PORT}`;
const LITE = flag("lite");
const SUPABASE_CLI = ["--yes", "supabase@2.121.0"];
const LOCAL_WORKDIR = path.join(root, "local");
const VENDOR_DIR = path.join(root, ".local-data", "vendor");
const SUPABASE_JS = "/npm/@supabase/supabase-js@2.118.0/+esm";
const LOCAL_WORKER_PASSWORD = "taxcomp-local-dev"; // set by local/supabase/seed.sql; local only

const npx = (cliArgs, { capture = false } = {}) => {
  // Relative workdir (cwd is the project root): on Windows the shell would split a path containing spaces ("TAX COMP").
  const result = spawnSync(process.platform === "win32" ? "npx.cmd" : "npx", [...SUPABASE_CLI, ...cliArgs, "--workdir", "local"],
    { cwd: root, encoding: "utf8", stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit", shell: process.platform === "win32" });
  if (result.status !== 0) throw new Error(`supabase ${cliArgs.join(" ")} failed${capture ? `: ${(result.stderr || result.stdout || "").trim().split("\n").slice(-3).join(" ")}` : ""}`);
  return result.stdout ?? "";
};

// ------------------------------------------------------------------ supabase-js, kept locally
/** Downloads supabase-js and the modules it imports (jsDelivr ESM builds) once. */
async function ensureSupabaseJs() {
  const entry = path.join(VENDOR_DIR, SUPABASE_JS);
  if (existsSync(entry)) return;
  console.log("Downloading supabase-js for offline use (one time)...");
  const seen = new Set();
  const queue = [SUPABASE_JS];
  while (queue.length) {
    const spec = queue.shift();
    if (seen.has(spec)) continue;
    seen.add(spec);
    let response;
    try { response = await fetch(`https://cdn.jsdelivr.net${spec}`); } catch {
      throw new Error("supabase-js is not downloaded yet and this computer is offline. Run `npm run dev` once while online.");
    }
    if (!response.ok) throw new Error(`Could not download ${spec} (${response.status}).`);
    const code = await response.text();
    const file = path.join(VENDOR_DIR, spec);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, code);
    for (const m of code.matchAll(/(?:from\s*|import\s*\(?\s*)["'](\/npm\/[^"']+)["']/g)) queue.push(m[1]);
  }
  console.log(`  saved ${seen.size} module${seen.size === 1 ? "" : "s"} to .local-data/vendor`);
}

// ------------------------------------------------------------------ backends
async function startSupabaseMode() {
  await ensureSupabaseJs(); // first, so it is saved while online even if Docker is not ready yet
  try { execFileSync("docker", ["info"], { stdio: "ignore" }); } catch {
    console.error("Docker is not running (or not installed). Local Supabase needs Docker Desktop:");
    console.error("  1. Install Docker Desktop for Windows (https://www.docker.com/products/docker-desktop/) and start it.");
    console.error("  2. Run `npm run dev` again (the first start downloads the Supabase images, online).");
    console.error("Without Docker you can use `npm run dev -- --lite` meanwhile.");
    process.exit(1);
  }
  // The local project always runs the repository's migrations.
  const target = path.join(LOCAL_WORKDIR, "supabase", "migrations");
  rmSync(target, { recursive: true, force: true });
  mkdirSync(target, { recursive: true });
  for (const name of readdirSync(path.join(root, "supabase", "migrations")).filter((n) => n.endsWith(".sql"))) {
    copyFileSync(path.join(root, "supabase", "migrations", name), path.join(target, name));
  }
  console.log("Starting local Supabase (Docker)...");
  npx(["start"]);
  if (flag("reset")) npx(["db", "reset"]);
  else npx(["migration", "up"]); // applies migrations added since the database was created
  const status = JSON.parse(npx(["status", "-o", "json"], { capture: true }).replace(/^[^{]*/, ""));
  const apiUrl = status.API_URL;
  const anonKey = status.ANON_KEY || status.PUBLISHABLE_KEY;
  const serviceKey = status.SERVICE_ROLE_KEY;
  const dbUrl = status.DB_URL;
  if (!apiUrl || !anonKey || !serviceKey || !dbUrl) throw new Error("Could not read the local Supabase status.");
  const workerDb = new URL(dbUrl);
  workerDb.username = "taxcomp_worker";
  workerDb.password = LOCAL_WORKER_PASSWORD;
  await ensureSupabaseJs();
  const reviewer = option("reviewer", null);
  if (reviewer) {
    const { default: postgres } = await import("postgres");
    const sql = postgres(dbUrl, { max: 1 });
    const rows = await sql`SELECT id::text FROM auth.users WHERE lower(email) = ${reviewer.toLowerCase()}`;
    if (rows.length) {
      await sql`INSERT INTO taxcomp.challenge_reviewers (user_id, email, can_approve_law, created_at) VALUES (${rows[0].id}, ${reviewer.toLowerCase()}, 1, now()::text)
        ON CONFLICT (user_id) DO UPDATE SET can_approve_law = 1, active = 1`;
      console.log(`${reviewer} is a legal reviewer and approver locally.`);
    } else console.log(`No local user ${reviewer} yet: sign up first, then restart with --reviewer.`);
    await sql.end();
  }
  const { default: worker } = await import("../worker/index.mjs");
  const env = {
    HYPERDRIVE: { connectionString: workerDb.toString() }, ALLOWED_ORIGIN: ORIGIN, PUBLIC_SITE_URL: `${ORIGIN}/taxcomp/`,
    SUPABASE_URL: apiUrl, SUPABASE_SERVICE_ROLE_KEY: serviceKey, BILLING_ENABLED: "false",
    CHAT_LIMITER: { limit: async () => ({ success: true }) },
  };
  const context = { waitUntil: (promise) => Promise.resolve(promise).catch(() => {}), passThroughOnException() {} };
  return {
    describe: [`Supabase Studio  ${status.STUDIO_URL || "http://127.0.0.1:54323"}`, `Emails (sign-up confirmations, resets)  ${status.INBUCKET_URL || status.MAILPIT_URL || "http://127.0.0.1:54324"}`],
    signIn: "Create an account in TaxComp; confirm it from the emails page above.",
    supabaseUrl: apiUrl, anonKey, supabaseJsUrl: `${ORIGIN}${SUPABASE_JS}`,
    worker: (request) => worker.fetch(request, env, context),
    stop: async () => {},
  };
}

async function startLiteMode() {
  const { handleRequest } = await import("../worker/index.mjs");
  const { clearSupabaseKeyCache } = await import("../worker/supabase-auth.mjs");
  const { createMigratedDatabase } = await import("../worker/pglite-test-support.mjs");
  const { createFakeSupabase } = await import("../worker/supabase-test-fakes.mjs");
  console.log("Starting the in-memory database (applying migrations)...");
  clearSupabaseKeyCache();
  const { pg, db } = await createMigratedDatabase();
  const supabase = await createFakeSupabase(pg);
  const env = {
    UNANSWERED_QUESTIONS: db, DATABASE_PROVIDER: "supabase", ALLOWED_ORIGIN: ORIGIN, PUBLIC_SITE_URL: `${ORIGIN}/taxcomp/`,
    SUPABASE_URL: supabase.url, SUPABASE_FETCH: supabase.fetch, SUPABASE_SERVICE_ROLE_KEY: supabase.serviceKey, BILLING_ENABLED: "false",
    CHAT_LIMITER: { limit: async () => ({ success: true }) }, PREMIUM_ACCESS_CHECK: async () => false,
  };
  return {
    describe: ["Database  in memory (cleared when the server stops)"],
    signIn: "Sign in with any email and password (no check, no emails). Every user is a legal reviewer and approver.",
    supabaseUrl: `${ORIGIN}/__local`, anonKey: "local-development-anon-key", supabaseJsUrl: `${ORIGIN}/__local/supabase.js`,
    worker: (request) => handleRequest(request, env),
    localSession: async (email) => {
      const { token, userId } = await supabase.issueToken({ email });
      await pg.query(`INSERT INTO taxcomp.challenge_reviewers (user_id, email, can_approve_law, created_at) VALUES ($1, $2, 1, now()::text) ON CONFLICT (user_id) DO NOTHING`, [userId, email]);
      return { token, userId };
    },
    stop: () => pg.close(),
  };
}

// Lite mode's stand-in for supabase-js: signs in any email through /__local/session.
const LITE_SUPABASE_JS = `const KEY = "taxcomp-local-email";
let current = null, issuedAt = 0, listeners = [];
const read = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
async function load() {
  const email = read();
  if (!email) { current = null; return null; }
  if (current && Date.now() - issuedAt < 45 * 60 * 1000) return current;
  const response = await fetch("/__local/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
  if (!response.ok) throw new Error("Local sign-in failed.");
  const { token, userId } = await response.json();
  issuedAt = Date.now();
  return (current = { access_token: token, token_type: "bearer", user: { id: userId, email } });
}
const emit = (event, session) => listeners.forEach((listener) => listener(event, session));
export function createClient() {
  const auth = {
    async getSession() { return { data: { session: await load() }, error: null }; },
    onAuthStateChange(callback) { listeners.push(callback); load().then((s) => callback("INITIAL_SESSION", s)); return { data: { subscription: { unsubscribe() { listeners = listeners.filter((l) => l !== callback); } } } }; },
    async signInWithPassword({ email }) { try { localStorage.setItem(KEY, String(email).trim().toLowerCase()); } catch {} current = null; const s = await load(); emit("SIGNED_IN", s); return { data: { session: s, user: s.user }, error: null }; },
    async signUp(credentials) { return auth.signInWithPassword(credentials); },
    async signOut() { try { localStorage.removeItem(KEY); } catch {} current = null; emit("SIGNED_OUT", null); return { error: null }; },
    async resetPasswordForEmail() { return { data: {}, error: null }; },
    async updateUser() { return { data: { user: current?.user ?? null }, error: null }; },
  };
  return { auth };
}`;

// A service worker that removes itself, so a cached copy never hides your edits.
const SELF_REMOVING_SW = `self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil((async () => {
  for (const key of await caches.keys()) await caches.delete(key);
  await self.registration.unregister();
  for (const client of await self.clients.matchAll()) client.navigate(client.url);
})()));`;

// ------------------------------------------------------------------ the server
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "application/javascript; charset=utf-8", ".mjs": "application/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json", ".webmanifest": "application/manifest+json", ".png": "image/png", ".svg": "image/svg+xml", ".md": "text/markdown; charset=utf-8" };
const WORKER_ROUTE = /^\/(?:api\/|chat$|advisor$|search$|admin(?:\/|$))/;

function staticFile(urlPath, backend) {
  let rel = decodeURIComponent(urlPath).replace(/^\/+/, "");
  if (!rel || rel.endsWith("/")) rel += "index.html";
  if (/(?:^|\/)(?:\.local-data|node_modules|local|\.git|worker|supabase)(?:\/|$)/.test(rel)) return null;
  const file = path.resolve(root, rel);
  if (!file.startsWith(root + path.sep) || !existsSync(file) || !statSync(file).isFile()) return null;
  const ext = path.extname(file).toLowerCase();
  if (rel === "service-worker.js") return { body: SELF_REMOVING_SW, type: TYPES[".js"] };
  if (ext === ".html") {
    const html = readFileSync(file, "utf8")
      .replace(/(<meta name="taxcomp-chat-endpoint" content=")[^"]*(")/, `$1${ORIGIN}/chat$2`)
      .replace(/(<meta name="taxcomp-supabase-url" content=")[^"]*(")/, `$1${backend.supabaseUrl}$2`)
      .replace(/(<meta name="taxcomp-supabase-anon-key" content=")[^"]*(")/, `$1${backend.anonKey}$2`)
      .replace(/<title>/, "<title>[LOCAL] ");
    // Same policy as production, rebuilt for the local Worker and Supabase
    // (supabase-js is served from this origin, so no CDN source is needed).
    const csp = /<meta http-equiv="Content-Security-Policy"/.test(html) ? applyPolicy(html, buildPolicy(html, { localDev: true, supabaseJsSources: [] })) : html;
    return { type: TYPES[ext], body: csp };
  }
  if (ext === ".js") return { type: TYPES[ext], body: readFileSync(file, "utf8").replace(/https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@[^"'`]+/g, backend.supabaseJsUrl) };
  return { body: readFileSync(file), type: TYPES[ext] || "application/octet-stream" };
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

const backend = LITE ? await startLiteMode() : await startSupabaseMode();

const server = createServer(async (req, res) => {
  const url = new URL(req.url, ORIGIN);
  const send = (status, type, body) => { res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store" }); res.end(body); };
  try {
    if (LITE && url.pathname === "/__local/supabase.js") return send(200, TYPES[".js"], LITE_SUPABASE_JS);
    if (LITE && url.pathname === "/__local/session" && req.method === "POST") {
      const { email } = JSON.parse((await readBody(req)).toString() || "{}");
      if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+$/.test(email)) return send(400, TYPES[".json"], "{}");
      return send(200, TYPES[".json"], JSON.stringify(await backend.localSession(email.toLowerCase())));
    }
    if (url.pathname.startsWith("/npm/")) {
      const file = path.resolve(VENDOR_DIR, `.${url.pathname}`);
      if (!file.startsWith(VENDOR_DIR) || !existsSync(file)) return send(404, "text/plain", "Not downloaded");
      return send(200, TYPES[".js"], readFileSync(file));
    }
    if (WORKER_ROUTE.test(url.pathname)) {
      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers)) if (typeof value === "string") headers.set(key, value);
      headers.set("Origin", ORIGIN);
      headers.set("CF-Connecting-IP", "127.0.0.1");
      const body = ["GET", "HEAD"].includes(req.method) ? undefined : await readBody(req);
      const response = await backend.worker(new Request(`https://worker.local${url.pathname}${url.search}`, { method: req.method, headers, body }));
      const out = Buffer.from(await response.arrayBuffer());
      res.writeHead(response.status, Object.fromEntries(response.headers));
      return res.end(out);
    }
    const file = staticFile(url.pathname, backend);
    if (!file) return send(404, "text/plain", "Not found");
    return send(200, file.type, file.body);
  } catch (error) {
    console.error(`${req.method} ${url.pathname} failed:`, error instanceof Error ? error.message : error);
    if (!res.headersSent) send(500, "text/plain", "Local server error (see the terminal).");
    else res.end();
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`\nTaxComp is running locally${LITE ? " (lite mode, no Docker)" : " on local Supabase"}:`);
  console.log(`  Corporate site  ${ORIGIN}/`);
  console.log(`  TaxComp app     ${ORIGIN}/taxcomp/`);
  for (const line of backend.describe) console.log(`  ${line}`);
  console.log(`\n${backend.signIn}`);
  console.log("Nothing here touches production. Press Ctrl+C to stop.");
});

const stop = async () => { server.close(); await backend.stop(); process.exit(0); };
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
