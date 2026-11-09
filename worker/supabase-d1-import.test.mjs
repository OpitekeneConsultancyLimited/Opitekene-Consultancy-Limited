// The D1 -> Supabase import file loads into the real schema, is idempotent,
// escapes text safely and drops expired chat questions.
import test from "node:test";
import assert from "node:assert/strict";
import { buildImportSql, sqlLiteral, TABLE_ORDER } from "../scripts/d1-to-supabase.mjs";
import { createMigratedDatabase } from "./pglite-test-support.mjs";

test("sqlLiteral escapes quotes and rejects values Postgres cannot store", () => {
  assert.equal(sqlLiteral("O'Brien'); DROP TABLE x; --"), "'O''Brien''); DROP TABLE x; --'");
  assert.equal(sqlLiteral(null), "NULL");
  assert.equal(sqlLiteral(18.5), "18.5");
  assert.throws(() => sqlLiteral("a\u0000b"), /NUL/);
  assert.throws(() => sqlLiteral(Number.NaN), /non-finite/);
});

test("every Supabase table is covered by the export order", async () => {
  const { pg } = await createMigratedDatabase();
  const { rows } = await pg.query("SELECT tablename FROM pg_tables WHERE schemaname = 'taxcomp' ORDER BY 1");
  assert.deepEqual(rows.map((row) => row.tablename), [...TABLE_ORDER].sort());
  await pg.close();
});

test("generated import loads into the Supabase schema and is safe to re-run", async () => {
  const { pg, db } = await createMigratedDatabase();
  const now = new Date("2026-11-09T12:00:00.000Z");
  const rowsByTable = {
    // Deliberately listed child-first: the generator must reorder.
    efris_products: [{ id: "p1", client_id: "c1", name: "Item 'quoted'", description: "", item_code: "X1", unit: "pc",
      selling_price: 1000.5, tax_category: "standard", vat_rate: 18, classification_code: "", active: 1, created_at: "2026-11-01T00:00:00Z" }],
    efris_clients: [{ id: "c1", name: "Client; DROP TABLE efris_clients; --", tin: null, created_at: "2026-11-01T00:00:00Z" }],
    unanswered_questions: [
      { id: "q-live", question: "VAT on exports?", created_at: "2026-11-01T00:00:00Z", expires_at: "2026-12-01T00:00:00Z", consented_at: "2026-11-01T00:00:00Z" },
      { id: "q-expired", question: "old", created_at: "2026-09-01T00:00:00Z", expires_at: "2026-10-01T00:00:00Z", consented_at: null },
    ],
    legacy_unknown_table: [{ id: 1 }],
  };
  const { sql, summary, skipped, unknownTables } = buildImportSql(rowsByTable, { now });
  assert.deepEqual(unknownTables, ["legacy_unknown_table"]);
  assert.deepEqual(skipped, { unanswered_questions: 1 });
  assert.deepEqual(summary, { unanswered_questions: 1, efris_clients: 1, efris_products: 1 });
  await pg.exec("RESET search_path");
  await pg.exec(sql);
  await pg.exec(sql); // idempotent
  await pg.exec("SET search_path TO taxcomp");
  assert.equal((await db.prepare("SELECT name FROM efris_clients WHERE id = 'c1'").first()).name, "Client; DROP TABLE efris_clients; --");
  assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM efris_products").first()).n, 1);
  assert.equal((await db.prepare("SELECT selling_price AS price FROM efris_products").first()).price, 1000.5);
  assert.deepEqual((await db.prepare("SELECT id FROM unanswered_questions").all()).results, [{ id: "q-live" }]);
  await pg.close();
});
