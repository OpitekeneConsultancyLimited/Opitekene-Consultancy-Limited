// Restore drill: decrypts a TaxComp backup and restores it into a brand-new,
// empty, in-memory Postgres (PGlite), then checks every table's row count
// against the backup manifest. Touches no cloud resource and changes nothing.
//   $env:BACKUP_PASSPHRASE = ...   (scripts\backup-restore-drill.ps1 sets it from the DPAPI copy)
//   node scripts/backup-restore-drill.mjs <file.tcbak> [evidence.json]
// Prints and writes only counts, names and timestamps, never the passphrase or data.
import { readFileSync, writeFileSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { restoreBackup } from "./taxcomp-backup.mjs";
import { SUPABASE_STUBS } from "../worker/pglite-test-support.mjs";

const [file, evidencePath] = process.argv.slice(2);
const passphrase = process.env.BACKUP_PASSPHRASE;
if (!file || !passphrase) {
  console.error("Usage: set BACKUP_PASSPHRASE, then: node scripts/backup-restore-drill.mjs <file.tcbak> [evidence.json]");
  process.exit(2);
}

const started = Date.now();
const bytes = readFileSync(file);
const pg = new PGlite();
await pg.waitReady;
await pg.exec(SUPABASE_STUBS);
const manifest = await restoreBackup(bytes, {
  passphrase,
  query: async (sql) => (await pg.query(sql)).rows,
  exec: async (sql) => { await pg.exec(sql); },
});

const checks = [];
for (const [table, expected] of Object.entries(manifest.rows ?? {})) {
  const { rows } = await pg.query(`SELECT count(*)::int AS n FROM taxcomp.${table.replace(/[^a-z0-9_]/g, "")}`);
  checks.push({ table, expected, restored: rows[0].n, ok: rows[0].n === expected });
}
const tables = (await pg.query("SELECT count(*)::int AS n FROM pg_tables WHERE schemaname = 'taxcomp'")).rows[0].n;
await pg.close();

const failed = checks.filter((c) => !c.ok);
const evidence = {
  drill: "taxcomp-restore-drill-v1",
  ranAt: new Date().toISOString(),
  backupFile: path.basename(file),
  backupBytes: statSync(file).size,
  backupSha256: createHash("sha256").update(bytes).digest("hex"),
  backupCreatedAt: manifest.createdAt,
  migrationsInBackup: manifest.migrations.length,
  target: "empty in-memory PGlite (Postgres 17 engine) with Supabase role/schema stubs",
  tablesAfterRestore: tables,
  tablesWithRows: checks.length,
  rowsExpected: checks.reduce((s, c) => s + c.expected, 0),
  rowsRestored: checks.reduce((s, c) => s + c.restored, 0),
  mismatches: failed,
  durationMs: Date.now() - started,
  result: failed.length ? "FAIL" : "PASS",
};
if (evidencePath) writeFileSync(evidencePath, JSON.stringify(evidence, null, 2) + "\n");
console.log(`RESTORE DRILL ${evidence.result}: ${evidence.rowsRestored}/${evidence.rowsExpected} rows across ${checks.length} tables; ${tables} tables; ${evidence.durationMs} ms.`);
process.exitCode = failed.length ? 1 : 0;
