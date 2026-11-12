#!/usr/bin/env node
// Builds the GitHub Pages site from an allowlist: only the files the two pages
// (the corporate site and the TaxComp app), the service worker and the web
// manifest actually reference. Source code, migrations, documents, PDFs and
// spreadsheets in the repository are never published.
//
//   node scripts/build-pages.mjs _site        (copy into _site)
//   node scripts/build-pages.mjs --check      (list and verify only)
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const PAGES = ["index.html", "taxcomp/index.html"];
const ALWAYS = ["service-worker.js", "manifest.webmanifest", ".nojekyll"];
// Never published, even if something links to it by mistake.
const FORBIDDEN = /\.(?:pdf|xlsx?|docx?|py|pyc|sql|toml|env|ts|mts)$|(?:^|\/)(?:worker|supabase|scripts|docs|evidence|scanner|node_modules|__pycache__|\.github)\//i;

function localRefs(page) {
  const html = readFileSync(path.join(root, page), "utf8");
  const refs = new Set();
  for (const m of html.matchAll(/\b(?:src|href)="([^"]+)"/g)) {
    const raw = m[1];
    if (/^(?:[a-z]+:|#|\/\/)/i.test(raw)) continue;
    const clean = raw.split(/[?#]/)[0];
    if (!clean) continue;
    let resolved = path.posix.normalize(path.posix.join(path.posix.dirname(page), clean));
    if (resolved === "." || resolved.endsWith("/")) resolved = path.posix.join(resolved, "index.html").replace(/^\.\//, "");
    refs.add(resolved);
  }
  return refs;
}

export function collect() {
  const files = new Set([...PAGES, ...ALWAYS]);
  for (const page of PAGES) for (const ref of localRefs(page)) files.add(ref);
  // The service worker's offline shell.
  const sw = readFileSync(path.join(root, "service-worker.js"), "utf8");
  for (const m of sw.matchAll(/"\.\/([^"]*)"/g)) files.add(m[1] === "" ? "index.html" : m[1].endsWith("/") ? `${m[1]}index.html` : m[1]);
  // Icons named in the manifest.
  const manifest = JSON.parse(readFileSync(path.join(root, "manifest.webmanifest"), "utf8"));
  for (const icon of manifest.icons ?? []) files.add(path.posix.normalize(String(icon.src).replace(/^\.\//, "")));
  const list = [...files].filter((f) => !f.startsWith("..")).sort();
  const missing = list.filter((f) => !existsSync(path.join(root, f)) || !statSync(path.join(root, f)).isFile());
  const forbidden = list.filter((f) => FORBIDDEN.test(f));
  return { list, missing, forbidden };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const { list, missing, forbidden } = collect();
  if (missing.length || forbidden.length) {
    if (missing.length) console.error(`Missing files referenced by the site: ${missing.join(", ")}`);
    if (forbidden.length) console.error(`Files that must not be published: ${forbidden.join(", ")}`);
    process.exit(1);
  }
  const out = process.argv[2];
  if (!out || out === "--check") {
    console.log(`${list.length} files would be published:\n${list.join("\n")}`);
  } else {
    const target = path.resolve(root, out);
    rmSync(target, { recursive: true, force: true });
    for (const file of list) {
      const dest = path.join(target, file);
      mkdirSync(path.dirname(dest), { recursive: true });
      copyFileSync(path.join(root, file), dest);
    }
    console.log(`Published ${list.length} files to ${out}.`);
  }
}
