-- Phase 2 (Supabase Storage) and Phase 3 (Supabase Auth).

-- ---------------------------------------------------------------- Phase 2
-- Private bucket for client documents. No storage.objects policies are
-- created, so only the service role (the Worker) can read or write it;
-- downloads always go through the Worker's authorization checks.
-- 10 MiB matches the largest per-type limit in document-management.js.
DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES ('phase6-documents', 'phase6-documents', false, 10485760, ARRAY['application/octet-stream'])
    ON CONFLICT (id) DO UPDATE
      SET public = false,
          file_size_limit = EXCLUDED.file_size_limit,
          allowed_mime_types = EXCLUDED.allowed_mime_types;
  END IF;
END
$$;

-- ---------------------------------------------------------------- Phase 3
-- Identity moves to Supabase Auth (auth.users). phase6_users.id now holds the
-- Supabase user id; passwords, sessions, lockout and resets are Supabase's job.
ALTER TABLE taxcomp.phase6_users ALTER COLUMN password_hash DROP NOT NULL;
UPDATE taxcomp.phase6_users SET password_hash = NULL WHERE password_hash IS NOT NULL;

DROP TABLE IF EXISTS taxcomp.phase6_sessions;
DROP TABLE IF EXISTS taxcomp.phase6_password_resets;

-- Lets the Worker link an invitee who already has a Supabase account. Returns
-- only the id (no other auth.users data) and is callable only by the Worker role.
CREATE OR REPLACE FUNCTION taxcomp.auth_user_id_by_email(p_email text)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_email IS NULL OR length(p_email) > 254 THEN
    RETURN NULL;
  END IF;
  RETURN (SELECT u.id::text FROM auth.users u WHERE lower(u.email) = lower(p_email) LIMIT 1);
END;
$$;

REVOKE ALL ON FUNCTION taxcomp.auth_user_id_by_email(text) FROM PUBLIC;
DO $$
DECLARE
  api_role TEXT;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      EXECUTE format('REVOKE ALL ON FUNCTION taxcomp.auth_user_id_by_email(text) FROM %I', api_role);
    END IF;
  END LOOP;
END
$$;
GRANT EXECUTE ON FUNCTION taxcomp.auth_user_id_by_email(text) TO taxcomp_worker;
