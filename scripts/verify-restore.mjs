#!/usr/bin/env node
// Backup/restore drill evidence (blockers BCP-2 / DB-2).
//
// Compares the TaxComp schema in two Postgres databases, normally production
// Supabase and a project restored from its backup, and writes an evidence
// report: per-table row counts and content hashes, schema/constraint/RLS/grant
// fingerprints, and a single MATCH / MISMATCH verdict. No row contents or
// credentials are written to the report.
//
// Connection strings come from environment variables, so they never appear in
// the command line or the report:
//   $env:SOURCE_DATABASE_URL   = "<production connection string>"
//   $env:RESTORED_DATABASE_URL = "<restored project connection string>"
//   node scripts/verify-restore.mjs [--out restore-evidence.json]
// Use a role that can read the taxcomp schema (for example postgres) on both.
import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import path from "node:path";

const SCHEMA = "taxcomp";

/**
 * @param {(sql: string) => Promise<object[]>} query  runs SQL, returns rows
 */
export async function fingerprintDatabase(query, schema = SCHEMA) {
  const tables = (await query(`SELECT tablename AS name, rowsecurity AS rls FROM pg_tables WHERE schemaname = '${schema}' ORDER BY tablename`));
  const result = { tables: {}, schema: {} };
  for (const table of tables) {
    if (!/^[a-z0-9_]+$/.test(table.name)) throw new Error(`Unexpected table name ${table.name}`);
    const [row] = await query(
      `SELECT count(*)::bigint AS rows,
              coalesce(md5(string_agg(t.j, '|' ORDER BY t.j)), md5('')) AS content_md5
         FROM (SELECT row_to_json(x)::text AS j FROM ${schema}.${table.name} x) t`,
    );
    result.tables[table.name] = { rows: Number(row.rows), contentMd5: row.content_md5, rls: Boolean(table.rls) };
  }
  const [shape] = await query(`
    SELECT md5(coalesce(string_agg(table_name || '.' || column_name || ':' || data_type || ':' || is_nullable || ':' || coalesce(column_default, ''), ',' ORDER BY table_name, ordinal_position), '')) AS columns_md5
      FROM information_schema.columns WHERE table_schema = '${schema}'`);
  const [constraints] = await query(`
    SELECT md5(coalesce(string_agg(c.conrelid::regclass::text || ':' || c.conname || ':' || pg_get_constraintdef(c.oid), ',' ORDER BY 1), '')) AS constraints_md5
      FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace WHERE n.nspname = '${schema}'`);
  const [indexes] = await query(`
    SELECT md5(coalesce(string_agg(indexname || ':' || indexdef, ',' ORDER BY indexname), '')) AS indexes_md5
      FROM pg_indexes WHERE schemaname = '${schema}'`);
  const [policies] = await query(`
    SELECT count(*)::int AS policies FROM pg_policies WHERE schemaname = '${schema}'`);
  const [grants] = await query(`
    SELECT coalesce(string_agg(table_name || ':' || privilege_type, ',' ORDER BY table_name, privilege_type), '') AS worker_grants
      FROM information_schema.role_table_grants WHERE grantee = 'taxcomp_worker' AND table_schema = '${schema}'`);
  const [triggers] = await query(`
    SELECT coalesce(string_agg(tgname, ',' ORDER BY tgname), '') AS triggers
      FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = '${schema}' AND NOT t.tgisinternal`);
  result.schema = {
    columnsMd5: shape.columns_md5,
    constraintsMd5: constraints.constraints_md5,
    indexesMd5: indexes.indexes_md5,
    policies: Number(policies.policies),
    workerGrantsMd5: (await query(`SELECT md5('${String(grants.worker_grants).replaceAll("'", "''")}') AS m`))[0].m,
    triggers: triggers.triggers,
  };
  return result;
}

export function compareFingerprints(source, restored) {
  const differences = [];
  const names = new Set([...Object.keys(source.tables), ...Object.keys(restored.tables)]);
  for (const name of [...names].sort()) {
    const a = source.tables[name];
    const b = restored.tables[name];
    if (!a || !b) { differences.push(`${name}: ${a ? "missing in restored" : "missing in source"}`); continue; }
    if (a.rows !== b.rows) differences.push(`${name}: rows ${a.rows} vs ${b.rows}`);
    else if (a.contentMd5 !== b.contentMd5) differences.push(`${name}: same row count, different content`);
    if (a.rls !== b.rls) differences.push(`${name}: row level security ${a.rls} vs ${b.rls}`);
  }
  for (const key of Object.keys(source.schema)) {
    if (source.schema[key] !== restored.schema[key]) differences.push(`schema ${key} differs`);
  }
  return { verdict: differences.length ? "MISMATCH" : "MATCH", differences };
}

function describe(url) {
  const parsed = new URL(url);
  return `${parsed.hostname}${parsed.pathname} as ${decodeURIComponent(parsed.username)}`;
}

async function main() {
  const sourceUrl = process.env.SOURCE_DATABASE_URL;
  const restoredUrl = process.env.RESTORED_DATABASE_URL;
  if (!sourceUrl || !restoredUrl) {
    console.error("Set SOURCE_DATABASE_URL and RESTORED_DATABASE_URL (see the header of this file).");
    process.exit(2);
  }
  const outIndex = process.argv.indexOf("--out");
  const outFile = outIndex > 0 ? process.argv[outIndex + 1] : "restore-evidence.json";
  const { default: postgres } = await import("postgres");
  const open = (url) => postgres(url, { max: 1, prepare: false, ssl: "require", onnotice: () => {} });
  const started = Date.now();
  const source = open(sourceUrl);
  const restored = open(restoredUrl);
  try {
    const [a, b] = await Promise.all([
      fingerprintDatabase((sql) => source.unsafe(sql)),
      fingerprintDatabase((sql) => restored.unsafe(sql)),
    ]);
    const comparison = compareFingerprints(a, b);
    const report = {
      generatedAt: new Date().toISOString(),
      purpose: "TaxComp backup/restore drill evidence (BCP-2 / DB-2)",
      source: describe(sourceUrl),
      restored: describe(restoredUrl),
      durationMs: Date.now() - started,
      ...comparison,
      tables: Object.fromEntries(Object.entries(a.tables).map(([name, value]) => [name, { rows: value.rows, sourceMd5: value.contentMd5, restoredMd5: b.tables[name]?.contentMd5 ?? null }])),
      schema: { source: a.schema, restored: b.schema },
    };
    writeFileSync(outFile, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`${comparison.verdict}: ${comparison.differences.length} difference(s). Evidence written to ${path.resolve(outFile)}`);
    for (const difference of comparison.differences) console.log(`  - ${difference}`);
    process.exitCode = comparison.verdict === "MATCH" ? 0 : 1;
  } finally {
    await Promise.all([source.end({ timeout: 5 }), restored.end({ timeout: 5 })]);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
