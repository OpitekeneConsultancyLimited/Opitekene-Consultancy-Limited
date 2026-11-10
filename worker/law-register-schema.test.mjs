// Database rules for the law register, case repository and assessment
// challenges (migration 20261110000000), on a real Postgres engine (PGlite).
import test from "node:test";
import assert from "node:assert/strict";
import { createMigratedDatabase } from "./pglite-test-support.mjs";

const now = "2026-11-10T00:00:00.000Z";

test("seed: principal Acts commenced, 2026 amendment Acts unconfirmed, nothing verified", async () => {
  const { pg } = await createMigratedDatabase();
  const rows = (await pg.query("SELECT id, legislative_status, verification_status FROM law_instruments ORDER BY id")).rows;
  assert.equal(rows.length, 10);
  assert.deepEqual(rows.filter((row) => row.id.endsWith("-2026")).map((row) => row.legislative_status), ["unconfirmed", "unconfirmed", "unconfirmed", "unconfirmed"]);
  assert.deepEqual(rows.filter((row) => row.verification_status !== "pending-review"), []);
  const limit = (await pg.query("SELECT period_amount, verification_status FROM law_time_limits WHERE id = 'objection-to-assessment'")).rows[0];
  assert.deepEqual(limit, { period_amount: 45, verification_status: "pending-review" });
  assert.equal((await pg.query("SELECT count(*)::int AS n FROM tax_heads")).rows[0].n, 17);
  await pg.close();
});

test("verification needs evidence; bills cannot be commenced", async () => {
  const { pg } = await createMigratedDatabase();
  await assert.rejects(pg.query("UPDATE law_time_limits SET verification_status = 'verified' WHERE id = 'objection-to-assessment'"), /check constraint/);
  await pg.query(`UPDATE law_time_limits SET verification_status = 'verified', verified_by = 'Reviewer', verified_at = $1,
    official_url = 'https://ulii.org/' WHERE id = 'objection-to-assessment'`, [now]);
  await assert.rejects(pg.query(`INSERT INTO law_instruments (id, short_title, instrument_kind, legislative_status, created_at, updated_at)
    VALUES ('x-bill', 'X Bill', 'bill', 'commenced', $1, $1)`, [now]), /check constraint/);
  await assert.rejects(pg.query(`INSERT INTO law_provisions (id, instrument_id, provision_key, version_no, section_label, created_at, updated_at)
    VALUES ('p', 'tpca', 'not a key', 1, 's 1', $1, $1)`, [now]), /check constraint/);
  await pg.query(`INSERT INTO law_provisions (id, instrument_id, provision_key, version_no, section_label, created_at, updated_at)
    VALUES ('p1', 'tpca', 'tpca:s24(1)', 1, 's 24(1)', $1, $1)`, [now]);
  await assert.rejects(pg.query(`INSERT INTO law_provisions (id, instrument_id, provision_key, version_no, section_label, created_at, updated_at)
    VALUES ('p2', 'tpca', 'tpca:s24(1)', 1, 's 24(1)', $1, $1)`, [now]), /duplicate key/);
  await pg.close();
});

test("assessment challenges belong to a client of the same organisation; approved drafts need a reviewer", async () => {
  const { pg } = await createMigratedDatabase();
  await pg.query("INSERT INTO phase6_organizations (id, name, created_at, updated_at) VALUES ('org-1', 'Org', $1, $1), ('org-2', 'Other', $1, $1)", [now]);
  const clientColumns = (await pg.query(`SELECT column_name FROM information_schema.columns WHERE table_schema = 'taxcomp' AND table_name = 'phase6_clients'
    AND is_nullable = 'NO' AND column_default IS NULL ORDER BY ordinal_position`)).rows.map((row) => row.column_name);
  const values = { id: "c-1", organization_id: "org-1", legal_business_name: "Example Traders Ltd", entity_type: "company", taxpayer_category: "company", created_at: now, updated_at: now, created_by: "u-1", updated_by: "u-1" };
  await pg.query("INSERT INTO phase6_users (id, email, password_hash, created_at, updated_at) VALUES ('u-1', 'a@example.com', 'x', $1, $1)", [now]);
  const missing = clientColumns.filter((column) => !(column in values));
  assert.deepEqual(missing, [], "test fixture covers every required client column");
  await pg.query(`INSERT INTO phase6_clients (${clientColumns.join(", ")}) VALUES (${clientColumns.map((_, i) => `$${i + 1}`).join(", ")})`, clientColumns.map((column) => values[column]));

  const insertChallenge = (id, org) => pg.query(`INSERT INTO assessment_challenges (id, organization_id, client_id, tax_head_id, notice_date, service_date, created_by, updated_by, created_at, updated_at)
    VALUES ($1, $2, 'c-1', 'value-added-tax', '2026-09-15', '2026-10-01', 'u-1', 'u-1', $3, $3)`, [id, org, now]);
  await insertChallenge("ch-1", "org-1");
  await assert.rejects(insertChallenge("ch-2", "org-2"), /foreign key/);
  await assert.rejects(pg.query(`INSERT INTO assessment_challenges (id, organization_id, client_id, notice_date, service_date, created_by, updated_by, created_at, updated_at)
    VALUES ('ch-3', 'org-1', 'c-1', '2026-10-02', '2026-10-01', 'u-1', 'u-1', $1, $1)`, [now]), /check constraint/);

  await pg.query(`INSERT INTO assessment_challenge_deadlines (id, challenge_id, time_limit_id, trigger_date, due_date, rule_verification_status, provisional, created_at)
    VALUES ('d-1', 'ch-1', 'objection-to-assessment', '2026-10-01', '2026-11-15', 'pending-review', 1, $1)`, [now]);
  await assert.rejects(pg.query(`INSERT INTO assessment_challenge_drafts (id, challenge_id, version_no, draft_kind, body_markdown, review_status, created_by, created_at)
    VALUES ('dr-1', 'ch-1', 1, 'objection-letter', 'DRAFT', 'approved', 'u-1', $1)`, [now]), /check constraint/);
  await assert.rejects(pg.query(`INSERT INTO assessment_challenge_events (id, challenge_id, actor_user_id, event_kind, details_json, occurred_at)
    VALUES ('e-1', 'ch-1', 'u-1', 'created', '[]', $1)`, [now]), /check constraint/);
  await pg.close();
});
