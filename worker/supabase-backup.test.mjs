// Encrypted logical backup: round trip into an empty database verifies as MATCH;
// wrong passphrase, tampering, and restoring over existing data are refused.
import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { createBackup, decrypt, restoreBackup } from "../scripts/taxcomp-backup.mjs";
import { compareFingerprints, fingerprintDatabase } from "../scripts/verify-restore.mjs";
import { createMigratedDatabase } from "./pglite-test-support.mjs";

const passphrase = "correct horse battery staple 2026 synthetic";

async function seededSource() {
  const { pg, db } = await createMigratedDatabase();
  const now = "2026-11-09T00:00:00.000Z";
  await db.batch([
    db.prepare("INSERT INTO phase6_organizations (id, name, created_at, updated_at) VALUES ('org', 'O''Brien & Co', ?, ?)").bind(now, now),
    db.prepare("INSERT INTO phase6_users (id, email, status, created_at, updated_at) VALUES ('u1', 'a@example.invalid', 'active', ?, ?)").bind(now, now),
    db.prepare("INSERT INTO phase6_memberships (organization_id, user_id, role, created_at) VALUES ('org', 'u1', 'system-admin', ?)").bind(now),
    db.prepare("INSERT INTO phase6_audit_log (id, organization_id, actor_user_id, action, resource_type, resource_id, details_json, occurred_at) VALUES ('a1', 'org', 'u1', 'x', 'y', 'z', '{\"k\":\"v; DROP\"}', ?)").bind(now),
    db.prepare("INSERT INTO efris_clients (id, name, tin, created_at) VALUES ('c1', 'Trader', NULL, ?)").bind(now),
    db.prepare("INSERT INTO efris_products (id, client_id, name, unit, selling_price, tax_category, vat_rate, created_at) VALUES ('p1', 'c1', 'Item', 'pc', 1234.5, 'standard', 18, ?)").bind(now),
    db.prepare("INSERT INTO unanswered_questions (id, question, created_at, expires_at) VALUES ('old', 'expired but must be kept in a backup', '2020-01-01', '2020-02-01')"),
  ]);
  return { pg, query: async (sql) => (await pg.query(sql)).rows };
}

async function emptyTarget() {
  const pg = new PGlite({ parsers: { 20: Number, 1700: Number } });
  await pg.waitReady;
  // Supabase-managed schemas exist on any Supabase project.
  await pg.exec("CREATE SCHEMA auth; CREATE TABLE auth.users (id uuid PRIMARY KEY, email text); CREATE SCHEMA storage; CREATE TABLE storage.buckets (id text PRIMARY KEY, name text NOT NULL, public boolean, file_size_limit bigint, allowed_mime_types text[]);");
  return { pg, query: async (sql) => (await pg.query(sql)).rows, exec: async (sql) => { await pg.exec(sql); } };
}

test("backup restores into an empty project and verifies as MATCH", async () => {
  const source = await seededSource();
  const { file, manifest } = await createBackup(source.query, { passphrase, source: "test" });
  assert.equal(manifest.rows.unanswered_questions, 1, "backups keep every row, including expired ones");
  assert.ok(!file.includes(Buffer.from("O'Brien")) && !file.includes(Buffer.from("Trader")), "file is encrypted");

  const target = await emptyTarget();
  await restoreBackup(file, { passphrase, query: target.query, exec: target.exec });
  const verdict = compareFingerprints(await fingerprintDatabase(source.query), await fingerprintDatabase(target.query));
  assert.deepEqual(verdict, { verdict: "MATCH", differences: [] });

  await assert.rejects(restoreBackup(file, { passphrase, query: target.query, exec: target.exec }), /Refusing to restore: target already has data/);
  await source.pg.close();
  await target.pg.close();
});

test("wrong passphrase, tampering and weak passphrases are refused", async () => {
  const source = await seededSource();
  const { file } = await createBackup(source.query, { passphrase });
  assert.throws(() => decrypt(file, "a different passphrase of decent length"), /wrong passphrase or the file was modified/);
  const tampered = Buffer.from(file);
  tampered[tampered.length - 1] ^= 1;
  assert.throws(() => decrypt(tampered, passphrase), /wrong passphrase or the file was modified/);
  assert.throws(() => decrypt(Buffer.from("not a backup at all, definitely not one"), passphrase), /Not a TaxComp backup/);
  await assert.rejects(createBackup(source.query, { passphrase: "short" }), /at least 20 characters/);
  await source.pg.close();
});
