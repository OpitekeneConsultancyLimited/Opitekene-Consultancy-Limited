-- Audit trails are append-only for the Worker role. The Worker never updates or
-- deletes audit rows; phase6_audit_log is also protected by row triggers, but
-- those do not fire for statements that match zero rows, so the grants are
-- tightened too (defence in depth).
REVOKE UPDATE, DELETE, TRUNCATE ON taxcomp.phase6_audit_log FROM taxcomp_worker;
REVOKE UPDATE, DELETE, TRUNCATE ON taxcomp.efris_audit_log FROM taxcomp_worker;
REVOKE UPDATE, DELETE, TRUNCATE ON taxcomp.legal_source_audit FROM taxcomp_worker;
