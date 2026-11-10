#!/usr/bin/env node
// DOM contract check for the single-page site: every element a front-end
// script looks up by id (getElementById / querySelector("#id")) must exist in
// index.html exactly once. Run before and after any layout change:
//   node scripts/check-dom-contract.mjs            (summary)
//   node scripts/check-dom-contract.mjs --list     (every id with its users)
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const html = readFileSync(path.join(root, "index.html"), "utf8");

const scripts = [...html.matchAll(/<script src="([^"?]+)(?:\?[^"]*)?"/g)].map((m) => m[1]);
const idsInHtml = new Map();
for (const m of html.matchAll(/\sid="([^"]+)"/g)) idsInHtml.set(m[1], (idsInHtml.get(m[1]) || 0) + 1);

const required = new Map(); // id -> Set(files)
for (const file of scripts) {
  let source;
  try { source = readFileSync(path.join(root, file), "utf8"); } catch { continue; }
  const patterns = [
    /getElementById\(\s*["'`]([A-Za-z][\w-]*)["'`]\s*\)/g,
    /querySelector(?:All)?\(\s*["'`]#([A-Za-z][\w-]*)["'`]\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const m of source.matchAll(pattern)) {
      if (!required.has(m[1])) required.set(m[1], new Set());
      required.get(m[1]).add(file);
    }
  }
}

const missing = [...required.keys()].filter((id) => !idsInHtml.has(id)).sort();
const duplicated = [...idsInHtml.entries()].filter(([, n]) => n > 1).map(([id]) => id).sort();
if (process.argv.includes("--list")) {
  for (const [id, files] of [...required.entries()].sort()) console.log(`${idsInHtml.has(id) ? "ok " : "MISSING"} #${id}  <- ${[...files].join(", ")}`);
}
console.log(`scripts: ${scripts.length}; ids required by scripts: ${required.size}; ids in page: ${idsInHtml.size}`);
console.log(`missing: ${missing.length ? missing.join(", ") : "none"}`);
console.log(`duplicated ids: ${duplicated.length ? duplicated.join(", ") : "none"}`);
export { missing, duplicated, required };
process.exitCode = missing.length || duplicated.length ? 1 : 0;
