-- Phase 2b (audit finding H1): legal verification register, independent
-- two-person review, emergency withdrawal and a protected audit trail.
-- See docs/remediation/LEGAL_VERIFICATION_REGISTER.md.
--
-- Governed records (entity types):
--   law_version  legislation_law_versions.id        section    legislation_sections.id
--   schedule     legislation_schedules.id           amendment  legislation_amendments.id
--   knowledge    knowledge_records.id               holiday    public_holidays "date|name"
--   rule_set     procedure_rule_sets.version        provision  law_provision_versions.id
--   case_law     tax_case_law.id                    calculator_rules  tax-rules.js rule-set id (no table)
--
-- 1. legal_verification_requests: a preparer's claim, with its authoritative
--    source. The database refuses a decision by the preparer.
-- 2. legal_register: every approved state, versioned; old versions are kept
--    (only superseded_at may be set, once); never deleted.
-- 3. legal_withdrawals: emergency withdrawal; lifting needs an approved
--    two-person "reinstate" request.
-- 4. legal_audit_log: append-only, hash-chained (each row's hash covers the
--    previous row's hash), so an edit or deletion anywhere breaks the chain.
-- 5. withdrawn / disputed flags on the governed tables (read paths filter on them).
-- 6. Trigger legal_require_two_person on the governed tables: a record can only
--    BECOME verified/approved inside a transaction that names an approved
--    request (SET LOCAL taxcomp.legal_request) whose approver is the verifier
--    and is not the preparer. No code path, old or new, can skip it.
-- Access: RLS on, Worker-only policy, no anon/authenticated grants.
-- Idempotent.

SET search_path TO taxcomp;

-- ---------------------------------------------------------------- 5. flags
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['legislation_law_versions', 'legislation_sections', 'legislation_schedules', 'legislation_amendments',
                           'knowledge_records', 'public_holidays', 'procedure_rule_sets', 'law_provision_versions', 'tax_case_law'] LOOP
    EXECUTE format('ALTER TABLE taxcomp.%I ADD COLUMN IF NOT EXISTS withdrawn INTEGER NOT NULL DEFAULT 0 CHECK (withdrawn IN (0, 1))', t);
    EXECUTE format('ALTER TABLE taxcomp.%I ADD COLUMN IF NOT EXISTS disputed INTEGER NOT NULL DEFAULT 0 CHECK (disputed IN (0, 1))', t);
  END LOOP;
END
$$;

-- ---------------------------------------------------------------- 1. requests
CREATE TABLE IF NOT EXISTS legal_verification_requests (
  id TEXT PRIMARY KEY NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('law_version', 'section', 'schedule', 'amendment', 'knowledge', 'holiday', 'rule_set', 'provision', 'case_law', 'calculator_rules')),
  entity_id TEXT NOT NULL CHECK (length(entity_id) BETWEEN 1 AND 200),
  action TEXT NOT NULL CHECK (action IN ('verify', 'supersede', 'reinstate')),
  change_json TEXT NOT NULL DEFAULT '{}' CHECK (change_json IS JSON OBJECT),
  jurisdiction TEXT NOT NULL DEFAULT 'UG' CHECK (jurisdiction ~ '^[A-Z]{2}$'),
  instrument_title TEXT NOT NULL CHECK (length(instrument_title) BETWEEN 3 AND 300),
  instrument_number TEXT CHECK (instrument_number IS NULL OR length(instrument_number) <= 120),
  legal_category TEXT NOT NULL CHECK (legal_category IN ('act', 'statutory_instrument', 'gazette_notice', 'commencement_instrument', 'judgment',
                                                         'ura_guidance', 'bill', 'budget_speech', 'commentary', 'press_report')),
  provision TEXT CHECK (provision IS NULL OR length(provision) <= 200),
  publication_date TEXT CHECK (publication_date IS NULL OR publication_date ~ '^\d{4}-\d{2}-\d{2}$'),
  assent_date TEXT CHECK (assent_date IS NULL OR assent_date ~ '^\d{4}-\d{2}-\d{2}$'),
  gazette_date TEXT CHECK (gazette_date IS NULL OR gazette_date ~ '^\d{4}-\d{2}-\d{2}$'),
  commencement_date TEXT CHECK (commencement_date IS NULL OR commencement_date ~ '^\d{4}-\d{2}-\d{2}$'),
  effective_from TEXT CHECK (effective_from IS NULL OR effective_from ~ '^\d{4}-\d{2}-\d{2}$'),
  effective_to TEXT CHECK (effective_to IS NULL OR effective_to ~ '^\d{4}-\d{2}-\d{2}$'),
  applicable_tax_year TEXT CHECK (applicable_tax_year IS NULL OR applicable_tax_year ~ '^\d{4}/\d{2}$'),
  source_url TEXT CHECK (source_url IS NULL OR (source_url ~ '^https://\S{4,}$' AND length(source_url) <= 508)),
  document_reference TEXT CHECK (document_reference IS NULL OR length(document_reference) BETWEEN 3 AND 300),
  evidence_note TEXT NOT NULL CHECK (length(evidence_note) BETWEEN 10 AND 4000),
  prepared_by TEXT NOT NULL,
  prepared_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  decided_by TEXT,
  decided_at TEXT,
  decision_note TEXT NOT NULL DEFAULT '',
  CONSTRAINT legal_request_has_source CHECK (source_url IS NOT NULL OR document_reference IS NOT NULL),
  CONSTRAINT legal_request_two_person CHECK (decided_by IS NULL OR decided_by <> prepared_by),
  CONSTRAINT legal_request_decided CHECK ((status = 'pending') = (decided_at IS NULL) AND (status IN ('pending', 'cancelled') OR decided_by IS NOT NULL)),
  CONSTRAINT legal_request_not_proposed_law CHECK (action <> 'verify' OR legal_category NOT IN ('bill', 'budget_speech', 'press_report')),
  CONSTRAINT legal_request_period CHECK (effective_from IS NULL OR effective_to IS NULL OR effective_from <= effective_to)
);
CREATE UNIQUE INDEX IF NOT EXISTS legal_requests_one_pending ON legal_verification_requests (entity_type, entity_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS legal_requests_status ON legal_verification_requests (status, prepared_at DESC);

-- ---------------------------------------------------------------- 2. register (versioned)
CREATE TABLE IF NOT EXISTS legal_register (
  id TEXT PRIMARY KEY NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('law_version', 'section', 'schedule', 'amendment', 'knowledge', 'holiday', 'rule_set', 'provision', 'case_law', 'calculator_rules')),
  entity_id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version >= 1),
  content_class TEXT NOT NULL CHECK (content_class IN ('verified_law', 'pending_verification', 'disputed', 'superseded', 'withdrawn',
                                                       'professional_commentary', 'proposed_legislation', 'administrative_guidance')),
  jurisdiction TEXT NOT NULL DEFAULT 'UG',
  instrument_title TEXT,
  instrument_number TEXT,
  legal_category TEXT,
  provision TEXT,
  publication_date TEXT,
  assent_date TEXT,
  gazette_date TEXT,
  commencement_date TEXT,
  effective_from TEXT,
  effective_to TEXT,
  applicable_tax_year TEXT,
  source_url TEXT,
  document_reference TEXT,
  request_id TEXT REFERENCES legal_verification_requests (id),
  prepared_by TEXT,
  approved_by TEXT,
  recorded_by TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  superseded_at TEXT,
  note TEXT NOT NULL DEFAULT '',
  UNIQUE (entity_type, entity_id, version),
  CONSTRAINT legal_register_verified_law CHECK (content_class <> 'verified_law' OR (
    request_id IS NOT NULL AND prepared_by IS NOT NULL AND approved_by IS NOT NULL AND approved_by <> prepared_by
    AND legal_category IN ('act', 'statutory_instrument', 'gazette_notice', 'commencement_instrument', 'judgment')
    AND (source_url IS NOT NULL OR document_reference IS NOT NULL)))
);
CREATE UNIQUE INDEX IF NOT EXISTS legal_register_current ON legal_register (entity_type, entity_id) WHERE superseded_at IS NULL;
CREATE INDEX IF NOT EXISTS legal_register_request ON legal_register (request_id);

-- ---------------------------------------------------------------- 3. withdrawals
CREATE TABLE IF NOT EXISTS legal_withdrawals (
  id TEXT PRIMARY KEY NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('law_version', 'section', 'schedule', 'amendment', 'knowledge', 'holiday', 'rule_set', 'provision', 'case_law', 'calculator_rules')),
  entity_id TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (length(reason) BETWEEN 10 AND 2000),
  withdrawn_by TEXT NOT NULL,
  withdrawn_at TEXT NOT NULL,
  lifted_by TEXT,
  lifted_at TEXT,
  lift_request_id TEXT REFERENCES legal_verification_requests (id),
  CHECK ((lifted_by IS NULL) = (lifted_at IS NULL) AND (lifted_at IS NULL) = (lift_request_id IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS legal_withdrawals_active ON legal_withdrawals (entity_type, entity_id) WHERE lifted_at IS NULL;
CREATE INDEX IF NOT EXISTS legal_withdrawals_lift_request ON legal_withdrawals (lift_request_id);

-- ---------------------------------------------------------------- 4. audit log (hash chain)
CREATE TABLE IF NOT EXISTS legal_audit_log (
  seq BIGINT NOT NULL UNIQUE,           -- set by the chain trigger (1, 2, 3 ...); restores reproduce it
  id TEXT PRIMARY KEY NOT NULL,
  occurred_at TEXT NOT NULL,
  actor_user_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('request.submit', 'request.approve', 'request.reject', 'request.cancel', 'entity.dispute',
                                         'entity.withdraw', 'entity.reinstate', 'register.version')),
  entity_type TEXT,
  entity_id TEXT,
  request_id TEXT,
  details_json TEXT NOT NULL DEFAULT '{}' CHECK (details_json IS JSON OBJECT),
  prev_hash TEXT NOT NULL,
  hash TEXT NOT NULL
);

CREATE OR REPLACE FUNCTION taxcomp.legal_audit_chain() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE prev TEXT; last_seq BIGINT;
BEGIN
  -- One writer at a time, so two transactions cannot both chain to the same row.
  PERFORM pg_catalog.pg_advisory_xact_lock(7240114);
  SELECT l.hash, l.seq INTO prev, last_seq FROM taxcomp.legal_audit_log l ORDER BY l.seq DESC LIMIT 1;
  NEW.seq := coalesce(last_seq, 0) + 1;
  NEW.prev_hash := coalesce(prev, 'genesis');
  NEW.hash := encode(sha256(convert_to(concat_ws('|', NEW.prev_hash, NEW.id, NEW.occurred_at, NEW.actor_user_id, NEW.action,
    coalesce(NEW.entity_type, ''), coalesce(NEW.entity_id, ''), coalesce(NEW.request_id, ''), NEW.details_json), 'UTF8')), 'hex');
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION taxcomp.legal_append_only() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE n JSONB; o JSONB;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    n := to_jsonb(NEW); o := to_jsonb(OLD);
    IF TG_TABLE_NAME = 'legal_register' THEN
      IF o->>'superseded_at' IS NULL AND n->>'superseded_at' IS NOT NULL AND (n - 'superseded_at') = (o - 'superseded_at') THEN
        RETURN NEW;  -- closing a version when a newer one is recorded
      END IF;
    ELSIF TG_TABLE_NAME = 'legal_withdrawals' THEN
      IF o->>'lifted_at' IS NULL AND n->>'lifted_at' IS NOT NULL
         AND (n - 'lifted_by' - 'lifted_at' - 'lift_request_id') = (o - 'lifted_by' - 'lifted_at' - 'lift_request_id') THEN
        RETURN NEW;  -- lifting a withdrawal once, after an approved reinstatement
      END IF;
    END IF;
  END IF;
  RAISE EXCEPTION 'legal_record_protected: % on taxcomp.% is not allowed', TG_OP, TG_TABLE_NAME USING ERRCODE = 'insufficient_privilege';
END
$$;

DROP TRIGGER IF EXISTS legal_audit_log_chain ON legal_audit_log;
CREATE TRIGGER legal_audit_log_chain BEFORE INSERT ON legal_audit_log FOR EACH ROW EXECUTE FUNCTION taxcomp.legal_audit_chain();
DROP TRIGGER IF EXISTS legal_audit_log_protect ON legal_audit_log;
CREATE TRIGGER legal_audit_log_protect BEFORE UPDATE OR DELETE ON legal_audit_log FOR EACH ROW EXECUTE FUNCTION taxcomp.legal_append_only();
DROP TRIGGER IF EXISTS legal_register_protect ON legal_register;
CREATE TRIGGER legal_register_protect BEFORE UPDATE OR DELETE ON legal_register FOR EACH ROW EXECUTE FUNCTION taxcomp.legal_append_only();
DROP TRIGGER IF EXISTS legal_withdrawals_protect ON legal_withdrawals;
CREATE TRIGGER legal_withdrawals_protect BEFORE UPDATE OR DELETE ON legal_withdrawals FOR EACH ROW EXECUTE FUNCTION taxcomp.legal_append_only();

-- Requests: once decided, a request never changes again.
CREATE OR REPLACE FUNCTION taxcomp.legal_request_protect() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'DELETE' OR OLD.status <> 'pending' THEN
    RAISE EXCEPTION 'legal_record_protected: decided verification requests cannot be changed or deleted' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF (to_jsonb(NEW) - 'status' - 'decided_by' - 'decided_at' - 'decision_note') <> (to_jsonb(OLD) - 'status' - 'decided_by' - 'decided_at' - 'decision_note') THEN
    RAISE EXCEPTION 'legal_record_protected: a submitted request''s evidence cannot be edited; cancel it and submit a new one' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END
$$;
DROP TRIGGER IF EXISTS legal_requests_protect ON legal_verification_requests;
CREATE TRIGGER legal_requests_protect BEFORE UPDATE OR DELETE ON legal_verification_requests FOR EACH ROW EXECUTE FUNCTION taxcomp.legal_request_protect();

-- ---------------------------------------------------------------- 6. two-person rule on the records
CREATE OR REPLACE FUNCTION taxcomp.legal_require_two_person() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  kind TEXT := TG_ARGV[0];
  n JSONB := to_jsonb(NEW);
  o JSONB := CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE '{}'::jsonb END;
  now_ok BOOLEAN;
  was_ok BOOLEAN;
  verifier TEXT;
  entity TEXT;
  req_id TEXT;
  req RECORD;
BEGIN
  IF kind IN ('law_version', 'section', 'schedule', 'amendment') THEN
    now_ok := n->>'verification_status' = 'verified'; was_ok := o->>'verification_status' = 'verified';
    verifier := n->>'verified_by'; entity := n->>'id';
  ELSIF kind = 'knowledge' THEN
    now_ok := n->>'status' = 'verified'; was_ok := o->>'status' = 'verified';
    verifier := n->>'reviewed_by'; entity := n->>'id';
  ELSIF kind = 'holiday' THEN
    now_ok := n->>'verified_by' IS NOT NULL; was_ok := o->>'verified_by' IS NOT NULL;
    verifier := n->>'verified_by'; entity := (n->>'holiday_date') || '|' || (n->>'name');
  ELSIF kind IN ('rule_set', 'provision') THEN
    now_ok := (n->>'approved_for_computation') = '1'; was_ok := (o->>'approved_for_computation') = '1';
    verifier := n->>'approved_by'; entity := CASE WHEN kind = 'rule_set' THEN n->>'version' ELSE n->>'id' END;
  ELSIF kind = 'case_law' THEN
    now_ok := n->>'summary_status' = 'approved' OR coalesce(n->>'appeal_status', 'unverified') <> 'unverified';
    was_ok := o->>'summary_status' = 'approved' OR coalesce(o->>'appeal_status', 'unverified') <> 'unverified';
    verifier := n->>'verified_by'; entity := n->>'id';
  ELSE
    RAISE EXCEPTION 'legal_require_two_person: unknown kind %', kind;
  END IF;
  IF NOT coalesce(now_ok, false) OR coalesce(was_ok, false) THEN
    RETURN NEW;
  END IF;
  -- Restoring a backup (scripts/taxcomp-backup.mjs) re-inserts records that were
  -- verified through this rule. Only a role other than the Worker's may do that.
  IF current_setting('taxcomp.restore', true) = 'on' AND current_user <> 'taxcomp_worker' THEN
    RETURN NEW;
  END IF;
  IF (n->>'withdrawn') = '1' THEN
    RAISE EXCEPTION 'legal_two_person_required: % % is withdrawn and must be reinstated first', kind, entity USING ERRCODE = 'check_violation';
  END IF;
  req_id := nullif(current_setting('taxcomp.legal_request', true), '');
  IF req_id IS NULL THEN
    RAISE EXCEPTION 'legal_two_person_required: % % can only be verified through an approved two-person verification request', kind, entity USING ERRCODE = 'check_violation';
  END IF;
  SELECT r.status, r.entity_type, r.entity_id, r.action, r.prepared_by, r.decided_by INTO req
    FROM taxcomp.legal_verification_requests r WHERE r.id = req_id;
  IF NOT FOUND OR req.status <> 'approved' OR req.action <> 'verify' OR req.entity_type <> kind OR req.entity_id <> entity
     OR req.decided_by IS DISTINCT FROM verifier OR req.decided_by = req.prepared_by THEN
    RAISE EXCEPTION 'legal_two_person_required: request % does not authorise verifying % % by %', req_id, kind, entity, verifier USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;

DO $$
DECLARE pair TEXT[];
BEGIN
  FOREACH pair SLICE 1 IN ARRAY ARRAY[
    ARRAY['legislation_law_versions', 'law_version'], ARRAY['legislation_sections', 'section'], ARRAY['legislation_schedules', 'schedule'],
    ARRAY['legislation_amendments', 'amendment'], ARRAY['knowledge_records', 'knowledge'], ARRAY['public_holidays', 'holiday'],
    ARRAY['procedure_rule_sets', 'rule_set'], ARRAY['law_provision_versions', 'provision'], ARRAY['tax_case_law', 'case_law']] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS legal_two_person ON taxcomp.%I', pair[1]);
    EXECUTE format('CREATE TRIGGER legal_two_person BEFORE INSERT OR UPDATE ON taxcomp.%I FOR EACH ROW EXECUTE FUNCTION taxcomp.legal_require_two_person(%L)', pair[1], pair[2]);
  END LOOP;
END
$$;

REVOKE ALL ON FUNCTION taxcomp.legal_require_two_person() FROM PUBLIC;
REVOKE ALL ON FUNCTION taxcomp.legal_audit_chain() FROM PUBLIC;
REVOKE ALL ON FUNCTION taxcomp.legal_append_only() FROM PUBLIC;
REVOKE ALL ON FUNCTION taxcomp.legal_request_protect() FROM PUBLIC;

-- ---------------------------------------------------------------- access
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'taxcomp_worker') THEN
    REVOKE ALL ON taxcomp.legal_verification_requests, taxcomp.legal_register, taxcomp.legal_withdrawals, taxcomp.legal_audit_log FROM taxcomp_worker;
    GRANT SELECT, INSERT, UPDATE ON taxcomp.legal_verification_requests, taxcomp.legal_register, taxcomp.legal_withdrawals TO taxcomp_worker;
    GRANT SELECT, INSERT ON taxcomp.legal_audit_log TO taxcomp_worker;
  END IF;
END
$$;

DO $$
DECLARE
  t TEXT;
  api_role TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['legal_verification_requests', 'legal_register', 'legal_withdrawals', 'legal_audit_log'] LOOP
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
