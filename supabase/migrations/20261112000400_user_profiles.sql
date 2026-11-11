-- Phase 12: personalised dashboard. One profile per signed-in user (Supabase
-- Auth user id), set during onboarding and editable later. Answers are the
-- user's own description of themselves; they configure the dashboard and are
-- never treated as a determination of tax liability.
-- Access as for the other TaxComp tables: RLS on, Worker-only policy, no
-- anon/authenticated grants; the Worker only ever reads or writes the
-- signed-in user's own row. Idempotent.

SET search_path TO taxcomp;

CREATE TABLE IF NOT EXISTS user_profiles (
  user_id TEXT PRIMARY KEY NOT NULL CHECK (length(user_id) BETWEEN 1 AND 120),
  user_category TEXT CHECK (user_category IN ('individual', 'employee', 'self_employed', 'small_business', 'company', 'accountant', 'consultant', 'finance_manager', 'tax_administrator')),
  purpose TEXT CHECK (purpose IN ('personal', 'business', 'both')),
  business_type TEXT CHECK (business_type IN ('sole_trader', 'partnership', 'company', 'ngo', 'other')),
  business_sector TEXT CHECK (business_sector IN ('retail', 'services', 'manufacturing', 'agriculture', 'construction', 'hospitality', 'transport', 'professional', 'property', 'import_export', 'gaming', 'other')),
  knowledge_level TEXT CHECK (knowledge_level IN ('none', 'some', 'professional')),
  experience_mode TEXT NOT NULL DEFAULT 'simple' CHECK (experience_mode IN ('simple', 'professional')),
  interests_json TEXT NOT NULL DEFAULT '[]' CHECK (interests_json IS JSON ARRAY),
  -- Facts used by "Discover my tax obligations"; null means not answered.
  facts_json TEXT NOT NULL DEFAULT '{}' CHECK (facts_json IS JSON OBJECT),
  discovery_json TEXT CHECK (discovery_json IS NULL OR discovery_json IS JSON OBJECT),
  discovered_at TEXT,
  onboarding_completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

REVOKE DELETE, TRUNCATE ON taxcomp.user_profiles FROM taxcomp_worker;
GRANT SELECT, INSERT, UPDATE ON taxcomp.user_profiles TO taxcomp_worker;

DO $$
DECLARE
  api_role TEXT;
BEGIN
  EXECUTE 'ALTER TABLE taxcomp.user_profiles ENABLE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS taxcomp_worker_all ON taxcomp.user_profiles';
  EXECUTE 'CREATE POLICY taxcomp_worker_all ON taxcomp.user_profiles TO taxcomp_worker USING (true) WITH CHECK (true)';
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      EXECUTE format('REVOKE ALL ON taxcomp.user_profiles FROM %I', api_role);
    END IF;
  END LOOP;
END
$$;
