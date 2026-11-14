-- Phase 2c (audit findings M2, M4, N8, N17): per-person admin access,
-- security event log, evidence-based launch gates, malware-scan status on
-- Challenge an Assessment uploads.
-- See docs/remediation/LAUNCH_GATE_REGISTER.md and ACCESS_CONTROLS.md.
--
-- 1. admin_users: named administrators (replaces the single shared admin
--    token, N8). The Worker can only READ this table: people are added or
--    removed by the database owner (SQL in ACCESS_CONTROLS.md), so no
--    application bug can promote anyone.
-- 2. security_events: append-only log of admin sign-ins, refusals, shared-token
--    use and privileged actions. No passwords, tokens or IP addresses.
-- 3. launch_gates + launch_gate_events: the eight launch gates with the
--    responsible person, required evidence, status, approval date, outstanding
--    issues and review date. Every change is an event in a hash-chained,
--    append-only log. The database refuses an approval without evidence, a
--    review date, or by the person who submitted the evidence; and refuses
--    public launch until the other seven gates are approved and in date.
--    Nothing is seeded as approved.
-- 4. challenge_documents.scan_status: uploads are scanned before storage
--    (N17); downloads and AI reading need scan_status = 'clean'.
-- Access: RLS on, Worker-only policies, no anon/authenticated grants. Idempotent.

SET search_path TO taxcomp;

-- ------------------------------------------------------------ admin_users
CREATE TABLE IF NOT EXISTS admin_users (
  user_id TEXT PRIMARY KEY CHECK (user_id ~ '^[0-9a-f-]{36}$'),
  email TEXT NOT NULL CHECK (length(email) BETWEEN 3 AND 320),
  display_name TEXT NOT NULL CHECK (length(display_name) BETWEEN 2 AND 120),
  -- Unanswered questions, legal-source drafts, EFRIS workspace.
  can_operate INTEGER NOT NULL DEFAULT 1 CHECK (can_operate IN (0, 1)),
  -- Record launch-gate evidence, responsible people and outstanding issues.
  can_manage_gates INTEGER NOT NULL DEFAULT 0 CHECK (can_manage_gates IN (0, 1)),
  -- Approve, reject or revoke a launch gate (management only).
  can_approve_gates INTEGER NOT NULL DEFAULT 0 CHECK (can_approve_gates IN (0, 1)),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  added_by TEXT NOT NULL CHECK (length(added_by) BETWEEN 2 AND 200),
  added_at TEXT NOT NULL,
  deactivated_at TEXT,
  note TEXT NOT NULL DEFAULT ''
);

-- -------------------------------------------------------- security_events
CREATE TABLE IF NOT EXISTS security_events (
  id TEXT PRIMARY KEY,
  occurred_at TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type ~ '^[a-z][a-z0-9_.]{2,63}$'),
  outcome TEXT NOT NULL CHECK (outcome IN ('allowed', 'refused', 'error')),
  actor_user_id TEXT,
  actor_email TEXT,
  route TEXT NOT NULL DEFAULT '' CHECK (length(route) <= 200),
  details_json TEXT NOT NULL DEFAULT '{}' CHECK (length(details_json) <= 4000)
);
CREATE INDEX IF NOT EXISTS security_events_occurred_idx ON security_events (occurred_at DESC);
CREATE INDEX IF NOT EXISTS security_events_type_idx ON security_events (event_type, occurred_at DESC);

-- ----------------------------------------------------------- launch_gates
CREATE TABLE IF NOT EXISTS launch_gates (
  gate_key TEXT PRIMARY KEY CHECK (gate_key IN ('legal', 'tax_calculation', 'security', 'privacy', 'operations', 'billing', 'support', 'public_launch')),
  position INTEGER NOT NULL UNIQUE,
  title TEXT NOT NULL,
  responsible_role TEXT NOT NULL,
  -- Named only when management appoints someone; never invented.
  responsible_person TEXT CHECK (responsible_person IS NULL OR length(responsible_person) BETWEEN 2 AND 160),
  required_evidence_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'not_started'
    CHECK (status IN ('not_started', 'in_progress', 'evidence_submitted', 'approved', 'rejected', 'revoked')),
  evidence_json TEXT NOT NULL DEFAULT '[]',
  outstanding_issues TEXT NOT NULL DEFAULT '' CHECK (length(outstanding_issues) <= 4000),
  evidence_submitted_by TEXT,
  evidence_submitted_at TEXT,
  approved_by TEXT,
  approved_by_name TEXT,
  approved_at TEXT,
  review_by TEXT CHECK (review_by IS NULL OR review_by ~ '^\d{4}-\d{2}-\d{2}$'),
  decision_notes TEXT NOT NULL DEFAULT '' CHECK (length(decision_notes) <= 4000),
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  CONSTRAINT launch_gate_approval_evidenced CHECK (
    status <> 'approved' OR (
      approved_by IS NOT NULL AND approved_at IS NOT NULL AND review_by IS NOT NULL
      AND evidence_submitted_by IS NOT NULL AND evidence_json <> '[]'
      AND approved_by <> evidence_submitted_by
      AND review_by > substr(approved_at, 1, 10)
    )
  )
);

CREATE TABLE IF NOT EXISTS launch_gate_events (
  id TEXT PRIMARY KEY,
  seq BIGINT UNIQUE,
  gate_key TEXT NOT NULL REFERENCES launch_gates (gate_key),
  occurred_at TEXT NOT NULL,
  actor_user_id TEXT NOT NULL,
  actor_email TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL CHECK (action IN ('evidence_recorded', 'evidence_submitted', 'approved', 'rejected', 'revoked', 'reopened', 'details_updated')),
  from_status TEXT NOT NULL,
  to_status TEXT NOT NULL,
  details_json TEXT NOT NULL DEFAULT '{}',
  prev_hash TEXT NOT NULL DEFAULT '',
  hash TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS launch_gate_events_gate_idx ON launch_gate_events (gate_key, seq);

INSERT INTO launch_gates (gate_key, position, title, responsible_role, required_evidence_json, outstanding_issues, updated_at) VALUES
  ('legal', 1, 'Legal approval', 'Qualified Ugandan tax lawyer (legal approver)',
   '["Legal content verified through the verification register by two people (laws, sections, schedules, 2026 amendments)","The five recorded conflicts resolved from the gazetted 2026 Acts","Objection, decision and appeal time limits approved","Public holidays confirmed from the Gazette","Signed legal sign-off memo"]',
   'H1 open: 0 legal records verified; 5 conflicts unresolved; only one reviewer account exists.', '2026-11-14T00:00:00Z'),
  ('tax_calculation', 2, 'Tax calculation approval', 'Qualified tax reviewer',
   '["Calculation inventory and test register (Phase 4)","Expected results supplied by the tax reviewer, not by the developer","All calculator test cases passing against those expected results","Calculator rule sets verified in the register","Signed tax-calculation sign-off"]',
   'G2 open: calculators not validated against 2026 law.', '2026-11-14T00:00:00Z'),
  ('security', 3, 'Security approval', 'Independent security assessor',
   '["Independent penetration test report with all high findings closed","Cross-tenant regression tests for every customer-data route (G4)","Admin access per person with two-step sign-in; shared admin token switched off","Malware scanner deployed and EICAR test passed","Security sign-off"]',
   'G4 open; scanner not deployed; shared admin token still enabled.', '2026-11-14T00:00:00Z'),
  ('privacy', 4, 'Privacy approval', 'Qualified Ugandan data-protection adviser',
   '["Data Protection and Privacy Act 2019 assessment","Data inventory and processing register","Retention schedule and breach plan","Processor register (Supabase, Cloudflare, AI and payment providers)","PDPO registration evidence","Privacy sign-off"]',
   'G1 open: no privacy assessment yet.', '2026-11-14T00:00:00Z'),
  ('operations', 5, 'Operations approval', 'Operations owner',
   '["RTO and RPO set by management","Disaster-recovery test meeting them","Backup key held in a password manager by two custodians","Cloud monitoring and alerting live","Custom email (SMTP) with SPF, DKIM and DMARC","Operations sign-off"]',
   'G6, H3, M3 open.', '2026-11-14T00:00:00Z'),
  ('billing', 6, 'Billing approval', 'Finance owner',
   '["Flutterwave live keys configured as Worker secrets","Payment test suite passing in the Flutterwave sandbox (webhook verification, idempotency, amount and currency checks, refunds)","Reconciliation procedure tested","Billing sign-off"]',
   'M1, G7 open: Flutterwave keys not set.', '2026-11-14T00:00:00Z'),
  ('support', 7, 'Customer support approval', 'Product owner',
   '["Support channels and hours published","Response targets agreed","Escalation route for legal and tax questions","Complaint handling procedure","Support sign-off"]',
   'No support process recorded.', '2026-11-14T00:00:00Z'),
  ('public_launch', 8, 'Public launch approval', 'Management',
   '["Gates 1 to 7 approved and within their review dates","Management decision recorded"]',
   'Waits on gates 1 to 7.', '2026-11-14T00:00:00Z')
ON CONFLICT (gate_key) DO NOTHING;

-- ------------------------------------------------- challenge upload scans
ALTER TABLE challenge_documents ADD COLUMN IF NOT EXISTS scan_status TEXT NOT NULL DEFAULT 'unscanned';
ALTER TABLE challenge_documents ADD COLUMN IF NOT EXISTS scanned_at TEXT;
ALTER TABLE challenge_documents ADD COLUMN IF NOT EXISTS sha256 TEXT;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'challenge_documents_scan_status') THEN
    ALTER TABLE challenge_documents ADD CONSTRAINT challenge_documents_scan_status CHECK (scan_status IN ('unscanned', 'clean'));
  END IF;
END
$$;

-- -------------------------------------------------------------- functions
CREATE OR REPLACE FUNCTION taxcomp.launch_gate_event_chain() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE prev TEXT; last_seq BIGINT;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(7240115);
  SELECT e.hash, e.seq INTO prev, last_seq FROM taxcomp.launch_gate_events e ORDER BY e.seq DESC LIMIT 1;
  NEW.seq := coalesce(last_seq, 0) + 1;
  NEW.prev_hash := coalesce(prev, 'genesis');
  NEW.hash := encode(sha256(convert_to(concat_ws('|', NEW.prev_hash, NEW.id, NEW.gate_key, NEW.occurred_at, NEW.actor_user_id,
    NEW.action, NEW.from_status, NEW.to_status, NEW.details_json), 'UTF8')), 'hex');
  RETURN NEW;
END
$$;

-- Append-only for the Worker. The database owner may delete security events
-- older than the 12-month retention period; nobody may edit them.
CREATE OR REPLACE FUNCTION taxcomp.phase2c_append_only() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'DELETE' AND TG_TABLE_NAME = 'security_events' AND current_user <> 'taxcomp_worker'
     AND OLD.occurred_at < to_char((now() - interval '365 days') AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') THEN
    RETURN OLD;
  END IF;
  IF TG_OP = 'DELETE' AND current_user <> 'taxcomp_worker' AND pg_catalog.current_setting('taxcomp.restore', true) = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = 'insufficient_privilege';
END
$$;

-- Gate rules the application cannot skip: allowed status changes, and public
-- launch only after the other seven gates are approved and in date.
CREATE OR REPLACE FUNCTION taxcomp.launch_gate_rules() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE missing INTEGER;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'launch gates cannot be deleted' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'not_started' AND pg_catalog.current_setting('taxcomp.restore', true) IS DISTINCT FROM 'on' THEN
      RAISE EXCEPTION 'a new launch gate must start as not_started' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.gate_key <> OLD.gate_key OR NEW.position <> OLD.position OR NEW.required_evidence_json <> OLD.required_evidence_json THEN
    RAISE EXCEPTION 'gate identity and required evidence are fixed by migration' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW.status <> OLD.status AND NOT (
       (OLD.status IN ('not_started', 'rejected', 'revoked') AND NEW.status = 'in_progress')
    OR (OLD.status IN ('not_started', 'in_progress', 'rejected', 'revoked', 'approved') AND NEW.status = 'evidence_submitted')
    OR (OLD.status = 'evidence_submitted' AND NEW.status IN ('approved', 'rejected', 'in_progress'))
    OR (OLD.status = 'approved' AND NEW.status = 'revoked')
  ) THEN
    RAISE EXCEPTION 'launch gate cannot move from % to %', OLD.status, NEW.status USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.status = 'approved' AND OLD.status = 'approved' AND (
       NEW.evidence_json <> OLD.evidence_json OR NEW.approved_by IS DISTINCT FROM OLD.approved_by
    OR NEW.review_by IS DISTINCT FROM OLD.review_by OR NEW.evidence_submitted_by IS DISTINCT FROM OLD.evidence_submitted_by) THEN
    RAISE EXCEPTION 'an approved gate cannot be edited; submit new evidence instead' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.gate_key = 'public_launch' AND NEW.status = 'approved' AND OLD.status <> 'approved' THEN
    SELECT count(*) INTO missing FROM taxcomp.launch_gates g
     WHERE g.gate_key <> 'public_launch'
       AND (g.status <> 'approved' OR g.review_by IS NULL OR g.review_by < to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD'));
    IF missing > 0 THEN
      RAISE EXCEPTION 'public launch needs the other seven gates approved and in date (% outstanding)', missing USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  NEW.version := OLD.version + 1;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS launch_gate_events_chain ON launch_gate_events;
CREATE TRIGGER launch_gate_events_chain BEFORE INSERT ON launch_gate_events FOR EACH ROW EXECUTE FUNCTION taxcomp.launch_gate_event_chain();
DROP TRIGGER IF EXISTS launch_gate_events_protect ON launch_gate_events;
CREATE TRIGGER launch_gate_events_protect BEFORE UPDATE OR DELETE ON launch_gate_events FOR EACH ROW EXECUTE FUNCTION taxcomp.phase2c_append_only();
DROP TRIGGER IF EXISTS security_events_protect ON security_events;
CREATE TRIGGER security_events_protect BEFORE UPDATE OR DELETE ON security_events FOR EACH ROW EXECUTE FUNCTION taxcomp.phase2c_append_only();
DROP TRIGGER IF EXISTS launch_gates_rules ON launch_gates;
CREATE TRIGGER launch_gates_rules BEFORE INSERT OR UPDATE OR DELETE ON launch_gates FOR EACH ROW EXECUTE FUNCTION taxcomp.launch_gate_rules();

REVOKE ALL ON FUNCTION taxcomp.launch_gate_event_chain() FROM PUBLIC;
REVOKE ALL ON FUNCTION taxcomp.phase2c_append_only() FROM PUBLIC;
REVOKE ALL ON FUNCTION taxcomp.launch_gate_rules() FROM PUBLIC;

-- ----------------------------------------------------------------- access
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'taxcomp_worker') THEN
    REVOKE ALL ON taxcomp.admin_users, taxcomp.security_events, taxcomp.launch_gates, taxcomp.launch_gate_events FROM taxcomp_worker;
    GRANT SELECT ON taxcomp.admin_users TO taxcomp_worker;
    GRANT SELECT, INSERT ON taxcomp.security_events, taxcomp.launch_gate_events TO taxcomp_worker;
    GRANT SELECT, UPDATE ON taxcomp.launch_gates TO taxcomp_worker;
  END IF;
END
$$;

DO $$
DECLARE
  t TEXT;
  api_role TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['admin_users', 'security_events', 'launch_gates', 'launch_gate_events'] LOOP
    EXECUTE format('ALTER TABLE taxcomp.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS taxcomp_worker_all ON taxcomp.%I', t);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'taxcomp_worker') THEN
      EXECUTE format('CREATE POLICY taxcomp_worker_all ON taxcomp.%I TO taxcomp_worker USING (true) WITH CHECK (true)', t);
    END IF;
    FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
        EXECUTE format('REVOKE ALL ON taxcomp.%I FROM %I', t, api_role);
      END IF;
    END LOOP;
  END LOOP;
END
$$;
