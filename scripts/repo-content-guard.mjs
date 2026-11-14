// Repository content guard (audit finding H2, prevention). Fails when the
// repository contains third-party documents or large binaries that are not on
// the allowlist below, so a copyrighted book, a client file or a database dump
// cannot be committed again unnoticed. Runs in CI on every pull request.
//   node scripts/repo-content-guard.mjs
// Uses `git ls-files` when git is available, otherwise walks the folder
// (skipping ignored build/dependency folders).
import { execFileSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const MAX_BYTES = 2 * 1024 * 1024;
const DOCUMENT = /\.(pdf|docx?|xlsx?|pptx?|odt|ods|epub|zip|tar|gz|7z|rar|tcbak|sql\.gz|dump|bak)$/i;
// Reviewed and allowed: TaxComp's own synthetic test samples and its own register.
const ALLOWED = [
  /^docs\/challenge-assessment\/samples\/sample-\d{2}\.pdf$/,
  /^TAX_RULE_VERIFICATION_REGISTER\.xlsx$/,
];
// Never allowed as documents, in any folder (known third-party works).
const BLOCKED_NAMES = [/compendium/i, /laws of uganda/i, /icpau/i];
const SKIP_DIRS = new Set(["node_modules", ".git", ".wrangler", ".local-data", ".e2e-screens", "__pycache__", "_site"]);

function listFiles() {
  try {
    return execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" }).split("\0").filter(Boolean);
  } catch {
    const out = [];
    const walk = (dir) => {
      for (const entry of readdirSync(path.join(root, dir), { withFileTypes: true })) {
        const rel = dir ? `${dir}/${entry.name}` : entry.name;
        if (entry.isDirectory()) { if (!SKIP_DIRS.has(entry.name) && rel !== "local/supabase") walk(rel); }
        else out.push(rel);
      }
    };
    walk("");
    return out;
  }
}

export function checkFiles(files, sizeOf) {
  const problems = [];
  for (const file of files) {
    const name = file.replace(/\\/g, "/");
    if (DOCUMENT.test(name) && BLOCKED_NAMES.some((re) => re.test(path.posix.basename(name)))) { problems.push(`${name}: matches a blocked third-party document name`); continue; }
    if (DOCUMENT.test(name) && !ALLOWED.some((re) => re.test(name))) problems.push(`${name}: document/archive not on the allowlist`);
    const size = sizeOf(name);
    if (size > MAX_BYTES && !ALLOWED.some((re) => re.test(name))) problems.push(`${name}: ${(size / 1048576).toFixed(1)} MB is over the ${MAX_BYTES / 1048576} MB limit`);
  }
  return problems;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const files = listFiles();
  const problems = checkFiles(files, (f) => { try { return statSync(path.join(root, f)).size; } catch { return 0; } });
  if (problems.length) {
    console.error(`Repository content guard FAILED (${problems.length}):\n  ${problems.join("\n  ")}\n` +
      "Third-party documents must not be committed. If a file is TaxComp's own and needed, add it to ALLOWED in scripts/repo-content-guard.mjs in a reviewed PR.");
    process.exit(1);
  }
  console.log(`Repository content guard passed: ${files.length} files checked.`);
}
