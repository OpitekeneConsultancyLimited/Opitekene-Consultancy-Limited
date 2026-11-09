// Test-only helpers: a real Postgres engine (PGlite, in-process) with the
// Supabase migration applied, exposed through the same D1-compatible adapter
// the Worker uses in production. Not imported by the Worker bundle.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { createPostgresDatabase } from "./db.mjs";

const projectDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const migrationPath = path.join(projectDir, "supabase", "migrations", "20261109000000_taxcomp_schema.sql");

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

export async function createMigratedDatabase() {
  const pg = new PGlite({ parsers: numberParsers });
  await pg.waitReady;
  await pg.exec(await readFile(migrationPath, "utf8"));
  await pg.exec("SET search_path TO taxcomp");
  return { pg, db: createPostgresDatabase(createPgliteDriver(pg)) };
}
