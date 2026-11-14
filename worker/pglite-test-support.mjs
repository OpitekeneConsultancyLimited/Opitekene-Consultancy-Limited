// Test-only helpers: a real Postgres engine (PGlite, in-process) with the
// Supabase migration applied, exposed through the same D1-compatible adapter
// the Worker uses in production. Not imported by the Worker bundle.
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { createPostgresDatabase } from "./db.mjs";

const projectDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const migrationsDir = path.join(projectDir, "supabase", "migrations");
export const migrationPath = path.join(migrationsDir, "20261109000000_taxcomp_schema.sql");

/** All Supabase migrations in apply order (file names are timestamp-prefixed). */
export async function migrationFiles() {
  return (await readdir(migrationsDir)).filter((name) => name.endsWith(".sql")).sort()
    .map((name) => path.join(migrationsDir, name));
}

export function createPgliteDriver(pg) {
  return {
    async query(text, params) {
      const result = await pg.query(text, params);
      return { rows: result.rows, rowCount: result.affectedRows ?? 0 };
    },
    transaction(fn) {
      return pg.transaction((transaction) => fn(createPgliteDriver(transaction)));
    },
    async exec(text) {
      await pg.exec(text);
    },
  };
}

// Same int8/numeric -> number behaviour as postgresNumberTypes in db.mjs.
const numberParsers = { 20: (value) => Number(value), 1700: (value) => Number(value) };

// Minimal stand-ins for the Supabase-managed schemas the migrations touch.
export const SUPABASE_STUBS = `
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
END $$;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.users (id uuid PRIMARY KEY, email text);
CREATE SCHEMA IF NOT EXISTS storage;
CREATE TABLE IF NOT EXISTS storage.buckets (
  id text PRIMARY KEY, name text NOT NULL, public boolean DEFAULT false,
  file_size_limit bigint, allowed_mime_types text[]
);`;

/**
 * A migrated database. In memory by default (tests); pass `dataDir` for one
 * kept on disk between runs (local offline development). Migrations are
 * idempotent, so they are re-applied on every start.
 */
export async function createMigratedDatabase({ dataDir } = {}) {
  const pg = new PGlite({ parsers: numberParsers, ...(dataDir ? { dataDir } : {}) });
  await pg.waitReady;
  await pg.exec(SUPABASE_STUBS);
  for (const file of await migrationFiles()) await pg.exec(await readFile(file, "utf8"));
  await pg.exec("SET search_path TO taxcomp");
  return { pg, db: createPostgresDatabase(createPgliteDriver(pg)) };
}
