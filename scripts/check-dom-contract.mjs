#!/usr/bin/env node
// DOM contract check for the site's pages: every element a front-end script
// looks up by id (getElementById / querySelector("#id")) must exist exactly
// once in each page that loads that script. Pages: the corporate site
// (index.html) and the TaxComp app (taxcomp/index.html). Run before and after
// any layout change:
//   node scripts/check-dom-contract.mjs            (summary)
//   node scripts/check-dom-contract.mjs --list     (every id with its users)
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PAGES = ["index.html", "taxcomp/index.html"];
const PATTERNS = [/getElementById\(\s*["'`]([A-Za-z][\w-]*)["'`]\s*\)/g, /querySelector(?:All)?\(\s*["'`]#([A-Za-z][\w-]*)["'`]\s*\)/g];

let totalMissing = [];
let totalDuplicated = [];
const required = new Map();
for (const page of PAGES) {
  const html = readFileSync(path.join(root, page), "utf8");
  const scripts = [...html.matchAll(/<script src="([^"?]+)(?:\?[^"]*)?"/g)].map((m) => path.posix.normalize(path.posix.join(path.posix.dirname(page), m[1])));
  const idsInHtml = new Map();
  for (const m of html.matchAll(/\sid="([^"]+)"/g)) idsInHtml.set(m[1], (idsInHtml.get(m[1]) || 0) + 1);
  const needed = new Map();
  for (const file of scripts) {
    let source;
    try { source = readFileSync(path.join(root, file), "utf8"); } catch { continue; }
    for (const pattern of PATTERNS) {
      for (const m of source.matchAll(pattern)) {
        if (!needed.has(m[1])) needed.set(m[1], new Set());
        needed.get(m[1]).add(file);
      }
    }
  }
  const missing = [...needed.keys()].filter((id) => !idsInHtml.has(id)).sort();
  const duplicated = [...idsInHtml.entries()].filter(([, n]) => n > 1).map(([id]) => id).sort();
  if (process.argv.includes("--list")) {
    for (const [id, files] of [...needed.entries()].sort()) console.log(`${page}: ${idsInHtml.has(id) ? "ok " : "MISSING"} #${id}  <- ${[...files].join(", ")}`);
  }
  console.log(`${page}: scripts: ${scripts.length}; ids required by scripts: ${needed.size}; ids in page: ${idsInHtml.size}`);
  totalMissing = totalMissing.concat(missing.map((id) => `${page}#${id}`));
  totalDuplicated = totalDuplicated.concat(duplicated.map((id) => `${page}#${id}`));
  for (const [id, files] of needed) required.set(`${page}#${id}`, files);
}
console.log(`missing: ${totalMissing.length ? totalMissing.join(", ") : "none"}`);
console.log(`duplicated ids: ${totalDuplicated.length ? totalDuplicated.join(", ") : "none"}`);
export { totalMissing as missing, totalDuplicated as duplicated, required };
process.exitCode = totalMissing.length || totalDuplicated.length ? 1 : 0;
