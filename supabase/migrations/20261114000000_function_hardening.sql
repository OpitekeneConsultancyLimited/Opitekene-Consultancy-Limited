-- Audit finding L1 (Supabase advisor 0011, function_search_path_mutable) and
-- the follow-up review of every function in the taxcomp schema (14 Nov 2026).
--
-- 1. taxcomp.legislation_log_change had no fixed search_path. Its body already
--    names its only table fully (taxcomp.legislation_history) and otherwise
--    calls only pg_catalog built-ins (to_jsonb, concat_ws, md5, coalesce),
--    which are always resolved first, so an empty search_path is safe.
-- 2. Functions are executable by PUBLIC by default. None of the taxcomp
--    functions is meant to be called by anon or authenticated users (the
--    taxcomp schema is closed to them; all access goes through the Worker as
--    taxcomp_worker). Trigger functions need no EXECUTE grant to fire, so
--    revoking it changes nothing for the triggers.
-- 3. auth_user_id_by_email is SECURITY DEFINER (reads auth.users). It keeps
--    search_path = '' and stays executable by taxcomp_worker only.
-- Idempotent: safe to re-run.

ALTER FUNCTION taxcomp.legislation_log_change() SET search_path = '';

REVOKE ALL ON FUNCTION taxcomp.legislation_log_change() FROM PUBLIC;
REVOKE ALL ON FUNCTION taxcomp.phase6_audit_log_immutable() FROM PUBLIC;
REVOKE ALL ON FUNCTION taxcomp.auth_user_id_by_email(text) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON FUNCTION taxcomp.legislation_log_change() FROM anon;
    REVOKE ALL ON FUNCTION taxcomp.phase6_audit_log_immutable() FROM anon;
    REVOKE ALL ON FUNCTION taxcomp.auth_user_id_by_email(text) FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON FUNCTION taxcomp.legislation_log_change() FROM authenticated;
    REVOKE ALL ON FUNCTION taxcomp.phase6_audit_log_immutable() FROM authenticated;
    REVOKE ALL ON FUNCTION taxcomp.auth_user_id_by_email(text) FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'taxcomp_worker') THEN
    GRANT EXECUTE ON FUNCTION taxcomp.auth_user_id_by_email(text) TO taxcomp_worker;
  END IF;
END $$;

-- Functions created in this schema later are not executable by PUBLIC unless granted.
ALTER DEFAULT PRIVILEGES IN SCHEMA taxcomp REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
