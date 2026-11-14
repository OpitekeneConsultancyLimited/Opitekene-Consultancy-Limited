// Audit finding L1: every function in the taxcomp schema has a fixed
// search_path, none is executable by anon/authenticated, and the legislation
// history trigger still records changes after the hardening migration.
import test from "node:test";
import assert from "node:assert/strict";
import { createMigratedDatabase } from "./pglite-test-support.mjs";

test("taxcomp functions: fixed search_path, closed to anon/authenticated, triggers still fire", async () => {
  const { pg } = await createMigratedDatabase();
  try {
    const { rows: functions } = await pg.query(`
      SELECT p.proname AS name, coalesce(array_to_string(p.proconfig, ';'), '') AS config,
             has_function_privilege('anon', p.oid, 'EXECUTE') AS anon,
             has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'taxcomp'`);
    assert.ok(functions.length >= 3, "expected the taxcomp functions to exist");
    for (const fn of functions) {
      assert.match(fn.config, /search_path=("")?$|search_path=""/, `${fn.name} must set search_path`);
      assert.equal(fn.anon, false, `${fn.name} must not be executable by anon`);
      assert.equal(fn.authenticated, false, `${fn.name} must not be executable by authenticated`);
    }

    const { rows: [section] } = await pg.query(
      "SELECT id, verification_status AS status FROM taxcomp.legislation_sections ORDER BY id LIMIT 1");
    assert.ok(section, "the legislation import seeds sections");
    const next = section.status === "under_review" ? "unverified" : "under_review";
    const before = (await pg.query("SELECT count(*)::int AS n FROM taxcomp.legislation_history WHERE entity_id = $1", [section.id])).rows[0].n;
    await pg.query(
      "UPDATE taxcomp.legislation_sections SET verification_status = $1, updated_at = '2026-11-14T00:00:00Z', updated_by = 'test' WHERE id = $2",
      [next, section.id]);
    const { rows: history } = await pg.query(
      "SELECT action, from_status, to_status FROM taxcomp.legislation_history WHERE entity_id = $1 ORDER BY occurred_at", [section.id]);
    assert.equal(history.length, before + 1, "the trigger records the status change");
    assert.deepEqual(history.at(-1), { action: "status_changed", from_status: section.status, to_status: next });
  } finally {
    await pg.close();
  }
});
