-- Phase 7: legislative update monitoring (worker/challenge/lawwatch.mts).
-- The Worker follows Parliament's Bill Tracker daily and records tax Bills and
-- every stage change. It never writes to the law register: proposed law
-- (Bills) and enacted law (law_statutes) stay apart, and a legal reviewer
-- updates the register by hand after checking the Gazette.
-- Access as for the other Challenge tables: RLS on, Worker-only policy, no
-- anon/authenticated grants. Events and runs are append-only.
-- Idempotent.

SET search_path TO taxcomp;

CREATE TABLE IF NOT EXISTS law_watch_bills (
  bill_id INTEGER PRIMARY KEY NOT NULL CHECK (bill_id > 0),
  title TEXT NOT NULL,
  object TEXT NOT NULL DEFAULT '',
  cap_references_json TEXT NOT NULL DEFAULT '[]' CHECK (cap_references_json IS JSON ARRAY),
  stage TEXT NOT NULL CHECK (stage IN ('first_reading', 'second_reading', 'passed', 'assented', 'withdrawn', 'unknown')),
  first_reading TEXT CHECK (first_reading IS NULL OR first_reading ~ '^\d{4}-\d{2}-\d{2}$'),
  second_reading TEXT CHECK (second_reading IS NULL OR second_reading ~ '^\d{4}-\d{2}-\d{2}$'),
  third_reading TEXT CHECK (third_reading IS NULL OR third_reading ~ '^\d{4}-\d{2}-\d{2}$'),
  assent_date TEXT CHECK (assent_date IS NULL OR assent_date ~ '^\d{4}-\d{2}-\d{2}$'),
  withdrawn_date TEXT CHECK (withdrawn_date IS NULL OR withdrawn_date ~ '^\d{4}-\d{2}-\d{2}$'),
  source_url TEXT NOT NULL CHECK (source_url ~ '^https://bills\.parliament\.ug/'),
  first_seen_at TEXT NOT NULL,
  last_checked_at TEXT NOT NULL,
  last_changed_at TEXT NOT NULL,
  -- 'new' until a reviewer has looked at the latest change.
  review_status TEXT NOT NULL DEFAULT 'new' CHECK (review_status IN ('new', 'reviewed', 'not_relevant')),
  reviewed_by TEXT,
  reviewed_at TEXT,
  review_note TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS law_watch_bills_changed ON law_watch_bills (last_changed_at DESC);

CREATE TABLE IF NOT EXISTS law_watch_events (
  id TEXT PRIMARY KEY NOT NULL,
  bill_id INTEGER NOT NULL REFERENCES law_watch_bills(bill_id) ON DELETE RESTRICT,
  detected_at TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('new_bill', 'stage_change', 'dates_change')),
  from_stage TEXT,
  to_stage TEXT NOT NULL,
  summary TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS law_watch_events_bill ON law_watch_events (bill_id, detected_at DESC);

CREATE TABLE IF NOT EXISTS law_watch_runs (
  id TEXT PRIMARY KEY NOT NULL,
  ran_at TEXT NOT NULL,
  checked INTEGER NOT NULL DEFAULT 0,
  tax_bills INTEGER NOT NULL DEFAULT 0,
  changes INTEGER NOT NULL DEFAULT 0,
  errors_json TEXT NOT NULL DEFAULT '[]' CHECK (errors_json IS JSON ARRAY)
);
CREATE INDEX IF NOT EXISTS law_watch_runs_ran ON law_watch_runs (ran_at DESC);

REVOKE DELETE, TRUNCATE ON taxcomp.law_watch_bills FROM taxcomp_worker;
REVOKE UPDATE, DELETE, TRUNCATE ON taxcomp.law_watch_events, taxcomp.law_watch_runs FROM taxcomp_worker;
GRANT SELECT, INSERT, UPDATE ON taxcomp.law_watch_bills TO taxcomp_worker;
GRANT SELECT, INSERT ON taxcomp.law_watch_events, taxcomp.law_watch_runs TO taxcomp_worker;

DO $$
DECLARE
  t TEXT;
  api_role TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['law_watch_bills', 'law_watch_events', 'law_watch_runs'] LOOP
    EXECUTE format('ALTER TABLE taxcomp.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS taxcomp_worker_all ON taxcomp.%I', t);
    EXECUTE format('CREATE POLICY taxcomp_worker_all ON taxcomp.%I TO taxcomp_worker USING (true) WITH CHECK (true)', t);
    FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
        EXECUTE format('REVOKE ALL ON taxcomp.%I FROM %I', t, api_role);
      END IF;
    END LOOP;
  END LOOP;
END
$$;
