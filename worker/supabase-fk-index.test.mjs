// Every foreign key in the taxcomp schema has an index on its leading columns
// (migration 20261110000200), so the Supabase advisor finds no unindexed FKs.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createMigratedDatabase, migrationFiles } from "./pglite-test-support.mjs";

const UNCOVERED = `
SELECT c.conname
  FROM pg_constraint c
  JOIN pg_class cl ON cl.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = cl.relnamespace
 WHERE c.contype = 'f' AND n.nspname = 'taxcomp'
   AND NOT EXISTS (
     SELECT 1 FROM pg_index i
      WHERE i.indrelid = c.conrelid
        AND (SELECT array_agg(x ORDER BY x) FROM unnest((i.indkey::int2[])[0:array_length(c.conkey, 1) - 1]) AS x)
          = (SELECT array_agg(x ORDER BY x) FROM unnest(c.conkey) AS x))`;

test("every taxcomp foreign key is indexed, and re-running adds nothing", async () => {
  const { pg } = await createMigratedDatabase();
  assert.deepEqual((await pg.query(UNCOVERED)).rows, []);
  const count = async () => (await pg.query("SELECT count(*)::int AS n FROM pg_indexes WHERE schemaname = 'taxcomp'")).rows[0].n;
  const before = await count();
  for (const file of await migrationFiles()) await pg.exec(await readFile(file, "utf8"));
  assert.equal(await count(), before);
  await pg.close();
});
