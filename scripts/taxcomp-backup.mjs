#!/usr/bin/env node
// Encrypted logical backups of the TaxComp Supabase schema (blocker BCP-1 on
// the Supabase Free plan, which has no restorable backups).
//
//   export:  every row of every taxcomp table, in foreign-key order, plus the
//            list (and SHA-256) of the schema migrations it was taken against.
//            gzip, then AES-256-GCM with a key derived from BACKUP_PASSPHRASE
//            (scrypt). The file is useless without the passphrase, and any
//            tampering is detected on restore.
//   restore: decrypts, refuses to run if the target already holds TaxComp data
//            (so production can never be overwritten by accident), applies the
//            schema migrations if the target has no taxcomp schema, then loads
//            the data in one transaction.
//
// Secrets come from environment variables only (never arguments or files):
//   $env:DATABASE_URL       source (export) / target (restore) connection string
//   $env:BACKUP_PASSPHRASE  long random passphrase kept in a password manager
//   node scripts/taxcomp-backup.mjs export  --out taxcomp-2026-11-09.tcbak
//   node scripts/taxcomp-backup.mjs restore --in  taxcomp-2026-11-09.tcbak
import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { TABLE_ORDER, buildImportSql } from "./d1-to-supabase.mjs";

const MAGIC = Buffer.from("TCBK1");
const SCRYPT = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const projectDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const migrationsDir = path.join(projectDir, "supabase", "migrations");

export function localMigrations(dir = migrationsDir) {
  return readdirSync(dir).filter((name) => name.endsWith(".sql")).sort().map((name) => {
    const sql = readFileSync(path.join(dir, name), "utf8");
    return { name, sha256: createHash("sha256").update(sql).digest("hex"), sql };
  });
}

function assertPassphrase(passphrase) {
  if (typeof passphrase !== "string" || passphrase.length < 20) {
    throw new Error("BACKUP_PASSPHRASE must be at least 20 characters (use a long random value from a password manager).");
  }
}

export function encrypt(plaintext, passphrase) {
  assertPassphrase(passphrase);
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = scryptSync(passphrase, salt, 32, SCRYPT);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(MAGIC);
  const body = Buffer.concat([cipher.update(gzipSync(plaintext)), cipher.final()]);
  return Buffer.concat([MAGIC, salt, iv, cipher.getAuthTag(), body]);
}

export function decrypt(file, passphrase) {
  assertPassphrase(passphrase);
  if (file.length < 49 || !file.subarray(0, 5).equals(MAGIC)) throw new Error("Not a TaxComp backup file.");
  const salt = file.subarray(5, 21);
  const iv = file.subarray(21, 33);
  const tag = file.subarray(33, 49);
  const key = scryptSync(passphrase, salt, 32, SCRYPT);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAAD(MAGIC);
  decipher.setAuthTag(tag);
  try {
    return gunzipSync(Buffer.concat([decipher.update(file.subarray(49)), decipher.final()]));
  } catch {
    throw new Error("Backup could not be decrypted: wrong passphrase or the file was modified.");
  }
}

/** @param {(sql: string) => Promise<object[]>} query */
export async function createBackup(query, { passphrase, now = new Date(), source = "unknown" } = {}) {
  const present = new Set((await query("SELECT tablename FROM pg_tables WHERE schemaname = 'taxcomp'")).map((row) => row.tablename));
  const unknown = [...present].filter((name) => !TABLE_ORDER.includes(name));
  if (unknown.length) throw new Error(`Tables not covered by the backup order: ${unknown.join(", ")}`);
  const rowsByTable = {};
  for (const table of TABLE_ORDER) {
    if (!present.has(table)) continue;
    rowsByTable[table] = await query(`SELECT * FROM taxcomp.${table}`);
  }
  const { sql, summary } = buildImportSql(rowsByTable, { now, dropExpiredQuestions: false });
  const migrations = localMigrations().map(({ name, sha256 }) => ({ name, sha256 }));
  const manifest = { format: "taxcomp-backup-v1", createdAt: now.toISOString(), source, migrations, rows: summary };
  const file = encrypt(Buffer.from(JSON.stringify({ manifest, sql })), passphrase);
  return { file, manifest };
}

/**
 * @param {(sql: string) => Promise<object[]>} query  read queries on the target
 * @param {(sql: string) => Promise<void>} exec       multi-statement execution on the target
 */
export async function restoreBackup(file, { passphrase, query, exec }) {
  const { manifest, sql } = JSON.parse(decrypt(file, passphrase).toString("utf8"));
  if (manifest?.format !== "taxcomp-backup-v1") throw new Error("Unsupported backup format.");
  const hasSchema = (await query("SELECT 1 FROM pg_namespace WHERE nspname = 'taxcomp'")).length > 0;
  if (hasSchema) {
    for (const table of TABLE_ORDER) {
      const exists = (await query(`SELECT 1 FROM pg_tables WHERE schemaname = 'taxcomp' AND tablename = '${table}'`)).length > 0;
      if (exists && (await query(`SELECT 1 FROM taxcomp.${table} LIMIT 1`)).length) {
        throw new Error(`Refusing to restore: target already has data in taxcomp.${table}. Restore into an empty project.`);
      }
    }
  }
  const local = localMigrations();
  const localByName = new Map(local.map((m) => [m.name, m]));
  for (const migration of manifest.migrations) {
    if (localByName.get(migration.name)?.sha256 !== migration.sha256) {
      throw new Error(`Backup was taken against migration ${migration.name}, which differs from or is missing in this checkout.`);
    }
  }
  if (!hasSchema) {
    for (const migration of manifest.migrations) await exec(localByName.get(migration.name).sql);
  }
  await exec(sql); // BEGIN ... COMMIT inside
  return manifest;
}

function describe(url) {
  const parsed = new URL(url);
  return `${parsed.hostname}${parsed.pathname}`;
}

async function main() {
  const [command] = process.argv.slice(2);
  const arg = (flag) => { const i = process.argv.indexOf(flag); return i > 0 ? process.argv[i + 1] : null; };
  const url = process.env.DATABASE_URL;
  const passphrase = process.env.BACKUP_PASSPHRASE;
  if (!["export", "restore"].includes(command) || !url || !passphrase) {
    console.error("Usage: set DATABASE_URL and BACKUP_PASSPHRASE, then: export --out FILE | restore --in FILE");
    process.exit(2);
  }
  const { default: postgres } = await import("postgres");
  const { postgresNumberTypes } = await import("../worker/db.mjs");
  const sql = postgres(url, { max: 1, prepare: false, ssl: "require", types: postgresNumberTypes, onnotice: () => {} });
  try {
    if (command === "export") {
      const out = arg("--out") || `taxcomp-${new Date().toISOString().slice(0, 10)}.tcbak`;
      const { file, manifest } = await createBackup((text) => sql.unsafe(text), { passphrase, source: describe(url) });
      writeFileSync(out, file, { mode: 0o600 });
      console.log(`Encrypted backup written to ${path.resolve(out)} (${file.length} bytes). Rows: ${JSON.stringify(manifest.rows)}`);
    } else {
      const input = arg("--in");
      if (!input) throw new Error("restore needs --in FILE");
      const manifest = await restoreBackup(readFileSync(input), {
        passphrase,
        query: (text) => sql.unsafe(text),
        exec: (text) => sql.unsafe(text),
      });
      console.log(`Restored backup from ${manifest.createdAt} (source ${manifest.source}) into ${describe(url)}. Rows: ${JSON.stringify(manifest.rows)}`);
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
