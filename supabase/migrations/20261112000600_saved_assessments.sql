-- Tax Impact Assessment: assessments a signed-in user chooses to keep, and the
-- completion status of their compliance actions.
--
-- saved_assessments       one row per saved assessment. The user's own inputs
--                         and TaxComp's deterministic result, as shown to them.
--                         Users may delete their own; nothing else does.
-- user_profiles.obligation_status_json
--                         {obligation id: "not_started" | "in_progress" | "done"}
--                         for "Discover my tax obligations" (the Compliance
--                         Action Centre). The user's own record, not a finding.
-- Access as for the other TaxComp tables: RLS on, Worker-only policy, no
-- anon/authenticated grants; the Worker reads and writes only the signed-in
-- user's rows. Idempotent.

SET search_path TO taxcomp;

CREATE TABLE IF NOT EXISTS saved_assessments (
  id TEXT PRIMARY KEY NOT NULL CHECK (id ~ '^[0-9a-f-]{36}$'),
  user_id TEXT NOT NULL CHECK (length(user_id) BETWEEN 1 AND 120),
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 160),
  scenario TEXT NOT NULL CHECK (scenario IN ('vat_registration', 'paye_change', 'withholding_2026')),
  input_json TEXT NOT NULL CHECK (input_json IS JSON OBJECT),
  result_json TEXT NOT NULL CHECK (result_json IS JSON OBJECT),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS saved_assessments_user ON saved_assessments (user_id, created_at DESC);

ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS obligation_status_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS user_profiles_obligation_status_json_check;
ALTER TABLE user_profiles ADD CONSTRAINT user_profiles_obligation_status_json_check CHECK (obligation_status_json IS JSON OBJECT);

REVOKE TRUNCATE, UPDATE ON taxcomp.saved_assessments FROM taxcomp_worker;
GRANT SELECT, INSERT, DELETE ON taxcomp.saved_assessments TO taxcomp_worker;

DO $$
DECLARE
  api_role TEXT;
BEGIN
  EXECUTE 'ALTER TABLE taxcomp.saved_assessments ENABLE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS taxcomp_worker_all ON taxcomp.saved_assessments';
  EXECUTE 'CREATE POLICY taxcomp_worker_all ON taxcomp.saved_assessments TO taxcomp_worker USING (true) WITH CHECK (true)';
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      EXECUTE format('REVOKE ALL ON taxcomp.saved_assessments FROM %I', api_role);
    END IF;
  END LOOP;
END
$$;
