// Verifies the Supabase/Postgres path against a real Postgres engine (PGlite).
// Requires `npm ci` (devDependency @electric-sql/pglite).
import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { translateSql, toD1Error, withDatabase } from "./db.mjs";
import { createMigratedDatabase, migrationFiles } from "./pglite-test-support.mjs";

const workerDir = path.dirname(fileURLToPath(import.meta.url));

/** Every SQL literal passed to .prepare( in Worker sources. */
async function extractPreparedSql() {
  const statements = [];
  for (const name of (await readdir(workerDir)).sort()) {
    // Worker modules only: skip tests and test-only helpers (names contain "test").
    if (!name.endsWith(".mjs") || name.includes("test") || name === "db.mjs") continue;
    const source = await readFile(path.join(workerDir, name), "utf8");
    let from = 0;
    for (;;) {
      const at = source.indexOf(".prepare(", from);
      if (at === -1) break;
      from = at + 9;
      let index = from;
      while (/\s/.test(source[index])) index += 1;
      const quote = source[index];
      if (!["`", "\"", "'"].includes(quote)) {
        statements.push({ file: name, line: source.slice(0, at).split("\n").length, sql: null });
        continue;
      }
      let end = index + 1;
      let text = "";
      let dynamic = false;
      while (end < source.length && source[end] !== quote) {
        if (source[end] === "\\") { text += source[end + 1]; end += 2; continue; }
        if (quote === "`" && source[end] === "$" && source[end + 1] === "{") {
          dynamic = true;
          let depth = 1;
          end += 2;
          while (depth > 0 && end < source.length) {
            if (source[end] === "{") depth += 1;
            if (source[end] === "}") depth -= 1;
            end += 1;
          }
          text += "\u0000";
          continue;
        }
        text += source[end];
        end += 1;
      }
      statements.push({ file: name, line: source.slice(0, at).split("\n").length, sql: text, dynamic });
    }
  }
  return statements;
}

test("translateSql rewrites placeholders, camelCase aliases and SQLite functions", () => {
  assert.equal(
    translateSql("SELECT id AS userId, '?' AS q FROM t WHERE a = ? AND b = ? ORDER BY userId"),
    "SELECT id AS \"userId\", '?' AS q FROM t WHERE a = $1 AND b = $2 ORDER BY \"userId\"",
  );
  assert.equal(translateSql("SELECT 1 WHERE instr(lower(x), lower(?)) > 0"), "SELECT 1 WHERE strpos(lower(x), lower($1)) > 0");
  assert.equal(translateSql("ORDER BY c.legal_business_name COLLATE NOCASE"), "ORDER BY lower(c.legal_business_name)");
  assert.equal(
    translateSql("WHERE d >= date('now') AND d <= date('now', '+30 day')"),
    "WHERE d >= to_char(CURRENT_DATE, 'YYYY-MM-DD') AND d <= to_char(CURRENT_DATE + (30), 'YYYY-MM-DD')",
  );
  assert.equal(translateSql("SELECT 'it''s ?' AS x, \"weird?\" FROM t -- ?\nWHERE y = ?"),
    "SELECT 'it''s ?' AS x, \"weird?\" FROM t -- ?\nWHERE y = $1");
  assert.equal(translateSql("SELECT u.userId FROM (SELECT id AS userId FROM t) u"),
    "SELECT u.userId FROM (SELECT id AS \"userId\" FROM t) u",
    "qualified references are left alone (they already point at the quoted alias only via the subquery column list)");
});

test("toD1Error maps Postgres constraint errors to SQLite wording without row values", () => {
  const mapped = toD1Error({ code: "23505", constraint_name: "efris_invoices_client_id_invoice_number_key", message: "duplicate key value violates unique constraint ... Key (client_id)=(secret)" });
  assert.match(mapped.message, /^UNIQUE constraint failed: efris_invoices_client_id_invoice_number_key$/);
  assert.doesNotMatch(mapped.message, /secret/);
  const other = new Error("syntax error");
  assert.equal(toD1Error(other), other);
});

test("Supabase migration applies twice, enables RLS everywhere and keeps API roles out", async () => {
  const { pg } = await createMigratedDatabase();
  // Idempotent re-run of the whole sequence (re-running only the first file
  // would re-grant privileges that later migrations revoke).
  for (const file of await migrationFiles()) await pg.exec(await readFile(file, "utf8"));
  const tables = await pg.query("SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'taxcomp' ORDER BY 1");
  // 34 tables from D1 migrations 0001-0006, minus phase6_sessions and
  // phase6_password_resets (retired with Supabase Auth), plus 4 billing tables,
  // plus 13 Challenge an Assessment tables, public_holidays and 3 legislative-watch tables.
  // Plus the 2026 amendments register and saved impact assessments.
  // Plus the Phase 2b legal verification register (requests, register, withdrawals, audit log).
  assert.equal(tables.rows.length, 70);
  assert.deepEqual(tables.rows.filter((row) => !row.rowsecurity), []);
  const policies = await pg.query("SELECT count(*)::int AS n FROM pg_policies WHERE schemaname = 'taxcomp' AND policyname = 'taxcomp_worker_all'");
  assert.equal(policies.rows[0].n, 70);
  const challengeGrants = await pg.query(`SELECT table_name, string_agg(privilege_type, ',' ORDER BY privilege_type) AS privileges
    FROM information_schema.role_table_grants
    WHERE grantee = 'taxcomp_worker' AND table_schema = 'taxcomp'
      AND table_name IN ('challenge_audit_log', 'challenge_reviewers', 'law_statutes', 'law_provision_versions', 'procedure_rules', 'procedure_rule_sets', 'tax_case_law', 'challenge_cases', 'public_holidays')
    GROUP BY table_name ORDER BY table_name`);
  assert.deepEqual(challengeGrants.rows, [
    { table_name: "challenge_audit_log", privileges: "INSERT,SELECT" },
    { table_name: "challenge_cases", privileges: "DELETE,INSERT,SELECT,UPDATE" },
    { table_name: "challenge_reviewers", privileges: "SELECT" },
    { table_name: "law_provision_versions", privileges: "INSERT,SELECT,UPDATE" },
    { table_name: "law_statutes", privileges: "SELECT" },
    { table_name: "procedure_rule_sets", privileges: "SELECT,UPDATE" },
    { table_name: "procedure_rules", privileges: "SELECT" },
    { table_name: "public_holidays", privileges: "INSERT,SELECT,UPDATE" },
    { table_name: "tax_case_law", privileges: "INSERT,SELECT,UPDATE" },
  ], "audit log append-only; reviewers and rules are owner-managed; law is never deleted");
  const billingGrants = await pg.query(`SELECT table_name, string_agg(privilege_type, ',' ORDER BY privilege_type) AS privileges
    FROM information_schema.role_table_grants
    WHERE grantee = 'taxcomp_worker' AND table_schema = 'taxcomp' AND table_name LIKE 'billing%'
    GROUP BY table_name ORDER BY table_name`);
  assert.deepEqual(billingGrants.rows, [
    { table_name: "billing_accounts", privileges: "INSERT,SELECT,UPDATE" },
    { table_name: "billing_payments", privileges: "INSERT,SELECT,UPDATE" },
    { table_name: "billing_plans", privileges: "SELECT" },
    { table_name: "billing_subscriptions", privileges: "INSERT,SELECT,UPDATE" },
  ], "the Worker cannot change prices or delete payments");
  const role = await pg.query("SELECT rolcanlogin, rolconfig FROM pg_roles WHERE rolname = 'taxcomp_worker'");
  assert.equal(role.rows[0].rolcanlogin, false, "the migration must not create a login/password");
  assert.deepEqual(role.rows[0].rolconfig, ["search_path=taxcomp"]);
  const auditGrants = await pg.query(`SELECT table_name, string_agg(privilege_type, ',' ORDER BY privilege_type) AS privileges
    FROM information_schema.role_table_grants
    WHERE grantee = 'taxcomp_worker' AND table_schema = 'taxcomp' AND table_name LIKE '%audit%'
    GROUP BY table_name ORDER BY table_name`);
  assert.deepEqual(auditGrants.rows, [
    { table_name: "challenge_audit_log", privileges: "INSERT,SELECT" },
    { table_name: "efris_audit_log", privileges: "INSERT,SELECT" },
    { table_name: "legal_audit_log", privileges: "INSERT,SELECT" },
    { table_name: "legal_source_audit", privileges: "INSERT,SELECT" },
    { table_name: "phase6_audit_log", privileges: "INSERT,SELECT" },
  ], "audit trails are append-only for the Worker role");
  await pg.close();
});

test("schema constraints behave like the D1 schema", async () => {
  const { pg, db } = await createMigratedDatabase();
  const now = "2026-11-09T00:00:00.000Z";
  await db.batch([
    db.prepare("INSERT INTO phase6_organizations (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)").bind("org-1", "Org", now, now),
    db.prepare("INSERT INTO phase6_users (id, email, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)").bind("u-1", "a@example.com", "x", now, now),
  ]);
  await assert.rejects(
    db.prepare("INSERT INTO phase6_users (id, email, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)").bind("u-2", "A@Example.com", "x", now, now).run(),
    /^Error: UNIQUE constraint failed: phase6_users_email_nocase$/,
    "email uniqueness is case-insensitive like COLLATE NOCASE",
  );
  await assert.rejects(
    db.prepare("INSERT INTO phase6_audit_log (id, organization_id, actor_user_id, action, resource_type, resource_id, details_json, occurred_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .bind("a-1", "org-1", "u-1", "x", "y", "z", "{not json", now).run(),
    /CHECK constraint failed/,
  );
  await db.prepare("INSERT INTO phase6_audit_log (id, organization_id, actor_user_id, action, resource_type, resource_id, occurred_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind("a-1", "org-1", "u-1", "x", "y", "z", now).run();
  await assert.rejects(db.prepare("UPDATE phase6_audit_log SET action = 'changed'").run(), /immutable/);
  await assert.rejects(db.prepare("DELETE FROM phase6_audit_log").run(), /immutable/);
  for (const [metricDate, ok] of [["2026-11-09", true], ["2026-02-30", false], ["2026-1-09", false]]) {
    const attempt = db.prepare("INSERT INTO phase10_usage_daily (organization_id, metric_date, metric_name, event_count, updated_at) VALUES (?, ?, 'api_error', 1, ?)")
      .bind("org-1", metricDate, now).run();
    if (ok) await attempt; else await assert.rejects(attempt);
  }
  await assert.rejects(
    db.prepare("INSERT INTO phase11_subscriptions (id, organization_id, plan_id, status, currency, created_at, updated_at) VALUES ('s', 'org-1', 'p', 'active', 'ugx', ?, ?)").bind(now, now).run(),
    /CHECK constraint failed/,
  );
  await pg.close();
});

test("batch() is atomic and reports meta.changes per statement", async () => {
  const { pg, db } = await createMigratedDatabase();
  const insert = "INSERT INTO unanswered_questions (id, question, created_at, expires_at) VALUES (?, ?, ?, ?)";
  await assert.rejects(db.batch([
    db.prepare(insert).bind("q1", "a", "t", "t"),
    db.prepare(insert).bind("q1", "duplicate", "t", "t"),
  ]), /UNIQUE constraint failed/);
  assert.equal((await db.prepare("SELECT COUNT(*) AS count FROM unanswered_questions").first()).count, 0, "first insert rolled back");
  const results = await db.batch([db.prepare(insert).bind("q1", "a", "t", "t"), db.prepare(insert).bind("q2", "b", "t", "t")]);
  assert.deepEqual(results.map((result) => result.meta.changes), [1, 1]);
  const update = await db.prepare("UPDATE unanswered_questions SET question = ? WHERE id IN (?, ?)").bind("z", "q1", "q2").run();
  assert.equal(update.meta.changes, 2);
  const counted = await db.prepare("SELECT COUNT(*) AS totalCount, SUM(1) AS summed FROM unanswered_questions").first();
  assert.deepEqual(counted, { totalCount: 2, summed: 2 }, "camelCase alias preserved and bigint returned as number");
  await pg.close();
});

test("changes() follows SQLite semantics inside batch() and is refused outside it", async () => {
  const { pg, db } = await createMigratedDatabase();
  const insert = "INSERT INTO unanswered_questions (id, question, created_at, expires_at) VALUES (?, 'q', 't', 't')";
  const guarded = "INSERT INTO legal_source_audit (id, source_id, action, actor, created_at) SELECT ?, 's', 'submitted', 'a', 't' WHERE changes() = 1";
  await db.prepare(insert).bind("q1").run();
  // Stale optimistic update: 0 rows changed, so both guarded inserts are skipped.
  let results = await db.batch([
    db.prepare("UPDATE unanswered_questions SET question = 'x' WHERE id = ? AND question = 'stale'").bind("q1"),
    db.prepare(guarded).bind("a1"),
    db.prepare(guarded).bind("a2"),
  ]);
  assert.deepEqual(results.map((r) => r.meta.changes), [0, 0, 0]);
  // Successful update: the chain proceeds.
  results = await db.batch([
    db.prepare("UPDATE unanswered_questions SET question = 'x' WHERE id = ?").bind("q1"),
    db.prepare("SELECT 1 AS ignoredForChanges"),
    db.prepare(guarded).bind("a3"),
    db.prepare(guarded).bind("a4"),
  ]);
  assert.deepEqual(results.map((r) => r.meta.changes), [1, 0, 1, 1]);
  await assert.rejects(db.prepare(guarded).bind("a5").run(), /only supported inside batch/);
  await pg.close();
});

test("every SQL statement in the Worker compiles against the Supabase schema", async () => {
  const { pg } = await createMigratedDatabase();
  const statements = await extractPreparedSql();
  assert.ok(statements.length >= 130, `expected the Worker's ~141 prepare() calls, found ${statements.length}`);
  const failures = [];
  let checked = 0;
  for (const statement of statements) {
    if (statement.sql === null || statement.dynamic) continue;
    checked += 1;
    try {
      // changes() is substituted by batch() at run time; mirror that here.
      await pg.describeQuery(translateSql(statement.sql).replace(/(?<![\w.$])changes\(\s*\)/gi, "1"));
    } catch (error) {
      failures.push(`${statement.file}:${statement.line}: ${error.message}\n    ${statement.sql.replace(/\s+/g, " ").slice(0, 220)}`);
    }
  }
  const skipped = statements.filter((statement) => statement.sql === null || statement.dynamic);
  console.log(`compiled ${checked} statements; ${skipped.length} built dynamically: ${skipped.map((s) => `${s.file}:${s.line}`).join(", ")}`);
  assert.deepEqual(failures, []);
  await pg.close();
});

test("withDatabase leaves the D1 binding alone when Hyperdrive is not configured", async () => {
  const d1 = { prepare() {}, batch() {} };
  const seen = await withDatabase({ UNANSWERED_QUESTIONS: d1 }, {}, (env) => env.UNANSWERED_QUESTIONS);
  assert.equal(seen, d1);
});

test("withDatabase swaps in a lazily connected Postgres adapter and closes it", async () => {
  const { pg } = await createMigratedDatabase();
  let ended = 0;
  let connected = 0;
  const fakePostgres = () => {
    connected += 1;
    const sql = {
      async unsafe(text, params) {
        const result = await pg.query(text, params);
        const rows = [...result.rows];
        rows.count = result.affectedRows ?? rows.length;
        return rows;
      },
      begin(fn) { return pg.transaction((tx) => fn({ unsafe: async (text, params) => { const r = await tx.query(text, params); const rows = [...r.rows]; rows.count = r.affectedRows ?? rows.length; return rows; } })); },
      async end() { ended += 1; },
    };
    return sql;
  };
  const waits = [];
  const context = { waitUntil: (promise) => waits.push(promise) };
  const env = { HYPERDRIVE: { connectionString: "postgres://example.invalid/db" }, UNANSWERED_QUESTIONS: "d1" };

  const untouched = await withDatabase(env, context, () => "no-db", { loadPostgres: async () => ({ default: fakePostgres }) });
  assert.equal(untouched, "no-db");
  assert.equal(connected, 0, "no connection when the handler never queries");

  const count = await withDatabase(env, context, async (scoped) => {
    assert.equal(scoped.DATABASE_PROVIDER, "supabase");
    await scoped.UNANSWERED_QUESTIONS.batch([
      scoped.UNANSWERED_QUESTIONS.prepare("INSERT INTO unanswered_questions (id, question, created_at, expires_at) VALUES (?, ?, ?, ?)").bind("q", "x", "t", "t"),
    ]);
    return (await scoped.UNANSWERED_QUESTIONS.prepare("SELECT COUNT(*) AS rowCount FROM unanswered_questions").first()).rowCount;
  }, { loadPostgres: async () => ({ default: fakePostgres }) });
  await Promise.all(waits);
  assert.equal(count, 1);
  assert.equal(connected, 1);
  assert.equal(ended, 1, "client closed after the handler finished");
  await pg.close();
});
