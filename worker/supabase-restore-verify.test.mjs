// The restore-drill verifier detects a faithful copy as MATCH and any data,
// row-count, RLS, grant or schema drift as MISMATCH.
import test from "node:test";
import assert from "node:assert/strict";
import { compareFingerprints, fingerprintDatabase } from "../scripts/verify-restore.mjs";
import { createMigratedDatabase } from "./pglite-test-support.mjs";

async function seeded() {
  const { pg, db } = await createMigratedDatabase();
  const now = "2026-11-09T00:00:00.000Z";
  await db.batch([
    db.prepare("INSERT INTO phase6_organizations (id, name, created_at, updated_at) VALUES ('org', 'Org', ?, ?)").bind(now, now),
    db.prepare("INSERT INTO unanswered_questions (id, question, created_at, expires_at) VALUES ('q1', 'VAT?', ?, ?), ('q2', 'PAYE?', ?, ?)").bind(now, now, now, now),
  ]);
  return { pg, query: async (sql) => (await pg.query(sql)).rows };
}

test("identical databases MATCH; every kind of drift is reported", async () => {
  const source = await seeded();
  const restored = await seeded();
  const fingerprint = (side) => fingerprintDatabase(side.query);

  // Different default search_path per role (as with taxcomp_worker vs postgres)
  // must not create false differences.
  await source.pg.exec("SET search_path TO taxcomp");
  await restored.pg.exec("SET search_path TO public");
  const same = compareFingerprints(await fingerprint(source), await fingerprint(restored));
  assert.deepEqual(same, { verdict: "MATCH", differences: [] });
  assert.equal((await fingerprint(source)).tables.unanswered_questions.rows, 2);

  await restored.pg.exec("SET search_path TO taxcomp; UPDATE unanswered_questions SET question = 'changed' WHERE id = 'q2'");
  assert.deepEqual(compareFingerprints(await fingerprint(source), await fingerprint(restored)).differences,
    ["unanswered_questions: same row count, different content"]);

  await restored.pg.exec("DELETE FROM taxcomp.unanswered_questions WHERE id = 'q2'");
  await restored.pg.exec("ALTER TABLE taxcomp.legal_sources DISABLE ROW LEVEL SECURITY");
  await restored.pg.exec("GRANT UPDATE ON taxcomp.phase6_audit_log TO taxcomp_worker");
  await restored.pg.exec("CREATE INDEX extra_index ON taxcomp.efris_clients (name)");
  const drift = compareFingerprints(await fingerprint(source), await fingerprint(restored));
  assert.equal(drift.verdict, "MISMATCH");
  assert.ok(drift.differences.includes("unanswered_questions: rows 2 vs 1"));
  assert.ok(drift.differences.includes("legal_sources: row level security true vs false"));
  assert.ok(drift.differences.includes("schema workerGrantsMd5 differs"));
  assert.ok(drift.differences.includes("schema indexesMd5 differs"));
  await source.pg.close();
  await restored.pg.close();
});
