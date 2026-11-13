-- LOCAL DEVELOPMENT ONLY. Runs on `supabase db reset` against the local Docker
-- database; never pushed to the live project (`db push` does not run seeds).
-- The migrations create taxcomp_worker without a login; locally it gets a
-- fixed, non-secret password so the Worker connects exactly as in production
-- (same role, same row-level security).
ALTER ROLE taxcomp_worker WITH LOGIN PASSWORD 'taxcomp-local-dev';
