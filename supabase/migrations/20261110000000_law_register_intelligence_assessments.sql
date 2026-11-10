-- TaxComp foundations: Uganda Tax Law Register, Case Repository,
-- Intelligence routing log and the "Challenge an Assessment" workflow.
--
-- Design rules (enforced by CHECK constraints, not only by code):
-- * Point in time. A provision is stored as versions (provision_key +
--   version_no) with effective_from / effective_to, so the law "as at" any
--   date can be resolved. Amendments are rows in law_amendments that point at
--   the amending instrument; they never overwrite earlier text.
-- * Bills are not law. law_instruments.legislative_status separates
--   bill / passed / assented / commenced / repealed / unconfirmed. Only
--   instruments that are 'commenced' AND 'verified' may supply provisions
--   that the resolver applies (law-register.js).
-- * Nothing is "verified" without evidence: verified rows must carry an
--   official HTTPS URL, a reviewer and a verification date.
-- * Statutory time limits (e.g. the objection window) are data. The
--   deadline engine labels any date computed from an unverified rule as
--   PROVISIONAL and requires professional confirmation.
-- * The intelligence log stores routing metadata only - never the user's
--   question or document text.
-- * Assessment challenge events are append-only for the Worker role.

SET search_path TO taxcomp;

-- ------------------------------------------------------------ reference data
CREATE TABLE IF NOT EXISTS tax_heads (
  id TEXT PRIMARY KEY NOT NULL CHECK (id ~ '^[a-z0-9-]{2,60}$'),
  label TEXT NOT NULL CHECK (length(trim(label)) BETWEEN 1 AND 80),
  sort_order INTEGER NOT NULL DEFAULT 0
);

INSERT INTO tax_heads (id, label, sort_order) VALUES
  ('individual-income-tax', 'Individual income tax', 1),
  ('corporate-income-tax', 'Corporate income tax', 2),
  ('paye', 'PAYE', 3),
  ('withholding-tax', 'Withholding tax', 4),
  ('presumptive-tax', 'Presumptive tax (small business)', 5),
  ('rental-income-tax', 'Rental income tax', 6),
  ('capital-gains-tax', 'Capital gains tax', 7),
  ('capital-allowances', 'Capital allowances', 8),
  ('industrial-building-deduction', 'Industrial building deductions', 9),
  ('value-added-tax', 'VAT', 10),
  ('excise-duty', 'Excise duty', 11),
  ('stamp-duty', 'Stamp duty', 12),
  ('customs-import-tax', 'Customs and import taxes', 13),
  ('transfer-pricing', 'Transfer pricing', 14),
  ('international-tax', 'International taxation', 15),
  ('double-taxation-agreement', 'Double taxation agreements', 16),
  ('tax-procedure', 'Tax procedure, assessments and disputes', 17)
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------- A. Uganda Tax Law Register
CREATE TABLE IF NOT EXISTS law_instruments (
  id TEXT PRIMARY KEY NOT NULL CHECK (id ~ '^[a-z0-9-]{2,80}$'),
  short_title TEXT NOT NULL CHECK (length(trim(short_title)) BETWEEN 1 AND 200),
  instrument_kind TEXT NOT NULL CHECK (instrument_kind IN (
    'principal-act', 'amendment-act', 'regulations', 'statutory-instrument',
    'practice-note', 'public-ruling', 'bill', 'treaty')),
  -- The principal Act an amendment / regulation belongs to (NULL for principals).
  parent_instrument_id TEXT REFERENCES law_instruments(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
  year INTEGER CHECK (year BETWEEN 1900 AND 2100),
  act_number TEXT,
  chapter_reference TEXT,
  legislative_status TEXT NOT NULL CHECK (legislative_status IN (
    'bill', 'passed', 'assented', 'commenced', 'repealed', 'unconfirmed')),
  assent_date TEXT CHECK (assent_date IS NULL OR assent_date ~ '^\d{4}-\d{2}-\d{2}$'),
  commencement_date TEXT CHECK (commencement_date IS NULL OR commencement_date ~ '^\d{4}-\d{2}-\d{2}$'),
  gazette_reference TEXT,
  official_url TEXT CHECK (official_url IS NULL OR official_url ~ '^https://'),
  legal_source_id TEXT REFERENCES legal_sources(source_id) ON DELETE RESTRICT,
  verification_status TEXT NOT NULL DEFAULT 'pending-review'
    CHECK (verification_status IN ('pending-review', 'verified', 'superseded', 'withdrawn', 'rejected')),
  verified_by TEXT,
  verified_at TEXT,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (verification_status <> 'verified' OR (official_url IS NOT NULL AND verified_by IS NOT NULL AND verified_at IS NOT NULL)),
  CHECK (legislative_status <> 'commenced' OR verification_status <> 'verified' OR commencement_date IS NOT NULL),
  CHECK (instrument_kind <> 'bill' OR legislative_status IN ('bill', 'unconfirmed'))
);
CREATE INDEX IF NOT EXISTS law_instruments_parent ON law_instruments (parent_instrument_id);

CREATE TABLE IF NOT EXISTS law_provisions (
  id TEXT PRIMARY KEY NOT NULL,
  instrument_id TEXT NOT NULL REFERENCES law_instruments(id) ON DELETE RESTRICT,
  -- Stable citation key across versions, e.g. 'tpca:s24(1)'.
  provision_key TEXT NOT NULL CHECK (provision_key ~ '^[a-z0-9-]+:[A-Za-z0-9().-]+$'),
  version_no INTEGER NOT NULL CHECK (version_no >= 1),
  section_label TEXT NOT NULL,
  heading TEXT NOT NULL DEFAULT '',
  text_content TEXT NOT NULL DEFAULT '',
  tax_heads_json TEXT NOT NULL DEFAULT '[]' CHECK (tax_heads_json IS JSON ARRAY),
  effective_from TEXT CHECK (effective_from IS NULL OR effective_from ~ '^\d{4}-\d{2}-\d{2}$'),
  effective_to TEXT CHECK (effective_to IS NULL OR effective_to ~ '^\d{4}-\d{2}-\d{2}$'),
  introduced_by_instrument_id TEXT REFERENCES law_instruments(id) ON DELETE RESTRICT,
  verification_status TEXT NOT NULL DEFAULT 'pending-review'
    CHECK (verification_status IN ('pending-review', 'verified', 'superseded', 'withdrawn', 'rejected')),
  verified_by TEXT,
  verified_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (provision_key, version_no),
  CHECK (effective_to IS NULL OR effective_from IS NULL OR effective_from <= effective_to),
  CHECK (verification_status <> 'verified' OR (verified_by IS NOT NULL AND verified_at IS NOT NULL AND effective_from IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS law_provisions_key_effective ON law_provisions (provision_key, effective_from DESC);

CREATE TABLE IF NOT EXISTS law_amendments (
  id TEXT PRIMARY KEY NOT NULL,
  amending_instrument_id TEXT NOT NULL REFERENCES law_instruments(id) ON DELETE RESTRICT,
  target_instrument_id TEXT NOT NULL REFERENCES law_instruments(id) ON DELETE RESTRICT,
  target_provision_key TEXT NOT NULL,
  change_kind TEXT NOT NULL CHECK (change_kind IN ('insert', 'substitute', 'amend', 'repeal')),
  resulting_provision_id TEXT REFERENCES law_provisions(id) ON DELETE RESTRICT,
  effective_from TEXT CHECK (effective_from IS NULL OR effective_from ~ '^\d{4}-\d{2}-\d{2}$'),
  summary TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  CHECK (amending_instrument_id <> target_instrument_id)
);
CREATE INDEX IF NOT EXISTS law_amendments_target ON law_amendments (target_provision_key, effective_from);

CREATE TABLE IF NOT EXISTS law_time_limits (
  id TEXT PRIMARY KEY NOT NULL CHECK (id ~ '^[a-z0-9-]{2,80}$'),
  label TEXT NOT NULL,
  provision_key TEXT NOT NULL,
  trigger_event TEXT NOT NULL CHECK (trigger_event IN (
    'service-of-assessment', 'service-of-objection-decision', 'lodgement-of-objection',
    'service-of-tribunal-decision', 'end-of-tax-period', 'other')),
  period_amount INTEGER NOT NULL CHECK (period_amount > 0),
  period_unit TEXT NOT NULL CHECK (period_unit IN ('days', 'months')),
  -- 'calendar-days-after-trigger': day 1 is the day after the trigger.
  counting_rule TEXT NOT NULL DEFAULT 'calendar-days-after-trigger'
    CHECK (counting_rule IN ('calendar-days-after-trigger', 'calendar-months-after-trigger')),
  consequence TEXT NOT NULL DEFAULT '',
  tax_heads_json TEXT NOT NULL DEFAULT '[]' CHECK (tax_heads_json IS JSON ARRAY),
  verification_status TEXT NOT NULL DEFAULT 'pending-review'
    CHECK (verification_status IN ('pending-review', 'verified', 'superseded', 'withdrawn', 'rejected')),
  verified_by TEXT,
  verified_at TEXT,
  official_url TEXT CHECK (official_url IS NULL OR official_url ~ '^https://'),
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (verification_status <> 'verified' OR (official_url IS NOT NULL AND verified_by IS NOT NULL AND verified_at IS NOT NULL))
);

-- Seed: principal Acts and the 2026 amendment Acts. Every row is
-- pending-review; the 2026 Acts are 'unconfirmed' until assent and
-- commencement are checked against the Uganda Gazette / ULII.
INSERT INTO law_instruments (id, short_title, instrument_kind, parent_instrument_id, year, legislative_status, notes, created_at, updated_at) VALUES
  ('ita', 'Income Tax Act', 'principal-act', NULL, 1997, 'commenced', 'Confirm chapter number in the Laws of Uganda 2024 Revised Edition.', '2026-11-10T00:00:00.000Z', '2026-11-10T00:00:00.000Z'),
  ('vata', 'Value Added Tax Act', 'principal-act', NULL, 1996, 'commenced', 'Confirm chapter number in the Laws of Uganda 2024 Revised Edition.', '2026-11-10T00:00:00.000Z', '2026-11-10T00:00:00.000Z'),
  ('eda', 'Excise Duty Act', 'principal-act', NULL, 2014, 'commenced', 'Confirm chapter number in the Laws of Uganda 2024 Revised Edition.', '2026-11-10T00:00:00.000Z', '2026-11-10T00:00:00.000Z'),
  ('tpca', 'Tax Procedures Code Act', 'principal-act', NULL, 2014, 'commenced', 'Governs assessments, objections and administrative penalties and interest.', '2026-11-10T00:00:00.000Z', '2026-11-10T00:00:00.000Z'),
  ('tata', 'Tax Appeals Tribunals Act', 'principal-act', NULL, 1997, 'commenced', 'Governs applications to the Tax Appeals Tribunal for review of objection decisions.', '2026-11-10T00:00:00.000Z', '2026-11-10T00:00:00.000Z'),
  ('sda', 'Stamp Duty Act', 'principal-act', NULL, 2014, 'commenced', 'Confirm chapter number in the Laws of Uganda 2024 Revised Edition.', '2026-11-10T00:00:00.000Z', '2026-11-10T00:00:00.000Z'),
  ('ita-amendment-2026', 'Income Tax (Amendment) Act, 2026', 'amendment-act', 'ita', 2026, 'unconfirmed', 'Confirm assent date, Act number and commencement (expected 1 July 2026 with the FY 2026/27 budget) from the Gazette.', '2026-11-10T00:00:00.000Z', '2026-11-10T00:00:00.000Z'),
  ('vata-amendment-2026', 'Value Added Tax (Amendment) Act, 2026', 'amendment-act', 'vata', 2026, 'unconfirmed', 'Confirm assent date, Act number and commencement from the Gazette.', '2026-11-10T00:00:00.000Z', '2026-11-10T00:00:00.000Z'),
  ('eda-amendment-2026', 'Excise Duty (Amendment) Act, 2026', 'amendment-act', 'eda', 2026, 'unconfirmed', 'Confirm assent date, Act number and commencement from the Gazette.', '2026-11-10T00:00:00.000Z', '2026-11-10T00:00:00.000Z'),
  ('tpca-amendment-2026', 'Tax Procedures Code (Amendment) Act, 2026', 'amendment-act', 'tpca', 2026, 'unconfirmed', 'Check whether it changes objection, payment-on-objection or penalty rules before verifying any time limit.', '2026-11-10T00:00:00.000Z', '2026-11-10T00:00:00.000Z')
ON CONFLICT (id) DO NOTHING;

INSERT INTO law_time_limits (id, label, provision_key, trigger_event, period_amount, period_unit, counting_rule, consequence, tax_heads_json, notes, created_at, updated_at) VALUES
  ('objection-to-assessment', 'Lodge an objection to a tax decision / assessment', 'tpca:s24(1)', 'service-of-assessment', 45, 'days', 'calendar-days-after-trigger',
   'A late objection may be refused unless the Commissioner accepts an application for extension.', '[]',
   'Commonly cited as 45 days after service of the tax decision. Verify section number in the 2024 Revised Edition and any change by the TPC (Amendment) Act 2026 before marking verified.', '2026-11-10T00:00:00.000Z', '2026-11-10T00:00:00.000Z'),
  ('commissioner-objection-decision', 'Commissioner decides the objection', 'tpca:s24', 'lodgement-of-objection', 90, 'days', 'calendar-days-after-trigger',
   'Check the current consequence of no decision within the period.', '[]',
   'Verify period, trigger and consequence against current TPCA text before marking verified.', '2026-11-10T00:00:00.000Z', '2026-11-10T00:00:00.000Z'),
  ('tat-application', 'Apply to the Tax Appeals Tribunal for review of an objection decision', 'tata:s16', 'service-of-objection-decision', 30, 'days', 'calendar-days-after-trigger',
   'Check payment-on-objection / deposit requirements that apply before the Tribunal hears the matter.', '[]',
   'Verify period and pre-conditions against the current TAT Act and TPCA before marking verified.', '2026-11-10T00:00:00.000Z', '2026-11-10T00:00:00.000Z')
ON CONFLICT (id) DO NOTHING;

-- Check the deferred parent_instrument_id references now, so no trigger
-- events are pending when ROW LEVEL SECURITY is enabled below.
SET CONSTRAINTS ALL IMMEDIATE;

-- ------------------------------------------------ B. Uganda Tax Case Repository
CREATE TABLE IF NOT EXISTS tax_cases (
  id TEXT PRIMARY KEY NOT NULL,
  case_name TEXT NOT NULL CHECK (length(trim(case_name)) BETWEEN 1 AND 300),
  citation TEXT NOT NULL,
  forum TEXT NOT NULL CHECK (forum IN ('tax-appeals-tribunal', 'high-court', 'court-of-appeal', 'supreme-court', 'other')),
  decision_date TEXT CHECK (decision_date IS NULL OR decision_date ~ '^\d{4}-\d{2}-\d{2}$'),
  tax_heads_json TEXT NOT NULL DEFAULT '[]' CHECK (tax_heads_json IS JSON ARRAY),
  background TEXT NOT NULL DEFAULT '',
  issues_json TEXT NOT NULL DEFAULT '[]' CHECK (issues_json IS JSON ARRAY),
  decision_summary TEXT NOT NULL DEFAULT '',
  outcome TEXT NOT NULL DEFAULT 'unknown' CHECK (outcome IN (
    'taxpayer-succeeded', 'ura-succeeded', 'partly-allowed', 'remitted', 'withdrawn', 'unknown')),
  appeal_of_case_id TEXT REFERENCES tax_cases(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
  appeal_status TEXT NOT NULL DEFAULT 'unknown' CHECK (appeal_status IN (
    'final', 'appealed', 'overturned', 'upheld-on-appeal', 'unknown')),
  official_url TEXT CHECK (official_url IS NULL OR official_url ~ '^https://'),
  legal_source_id TEXT REFERENCES legal_sources(source_id) ON DELETE RESTRICT,
  verification_status TEXT NOT NULL DEFAULT 'pending-review'
    CHECK (verification_status IN ('pending-review', 'verified', 'superseded', 'withdrawn', 'rejected')),
  verified_by TEXT,
  verified_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (citation),
  CHECK (verification_status <> 'verified' OR (official_url IS NOT NULL AND verified_by IS NOT NULL AND verified_at IS NOT NULL AND decision_date IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS tax_case_principles (
  id TEXT PRIMARY KEY NOT NULL,
  case_id TEXT NOT NULL REFERENCES tax_cases(id) ON DELETE RESTRICT,
  principle TEXT NOT NULL CHECK (length(trim(principle)) BETWEEN 1 AND 2000),
  tax_head_id TEXT REFERENCES tax_heads(id) ON DELETE RESTRICT,
  paragraph_reference TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS tax_case_principles_case ON tax_case_principles (case_id);
CREATE INDEX IF NOT EXISTS tax_case_principles_head ON tax_case_principles (tax_head_id);

CREATE TABLE IF NOT EXISTS tax_case_provision_links (
  case_id TEXT NOT NULL REFERENCES tax_cases(id) ON DELETE RESTRICT,
  provision_key TEXT NOT NULL,
  relationship TEXT NOT NULL DEFAULT 'interprets' CHECK (relationship IN ('interprets', 'applies', 'distinguishes', 'mentions')),
  PRIMARY KEY (case_id, provision_key)
);
CREATE INDEX IF NOT EXISTS tax_case_provision_links_key ON tax_case_provision_links (provision_key);

-- ------------------------------------------- C. Intelligence routing log
-- Metadata only: never the question, document text or a person's name.
CREATE TABLE IF NOT EXISTS intel_triage_log (
  id TEXT PRIMARY KEY NOT NULL,
  audience TEXT NOT NULL CHECK (audience IN ('business-owner', 'tax-professional')),
  audience_basis TEXT NOT NULL CHECK (audience_basis IN ('selected', 'detected', 'default')),
  service_centre TEXT NOT NULL CHECK (service_centre IN (
    'computation', 'assessment-dispute', 'audit-preparation', 'health-check',
    'law-and-case-law', 'advisory', 'compliance-monitoring')),
  primary_intent TEXT NOT NULL,
  tax_heads_json TEXT NOT NULL DEFAULT '[]' CHECK (tax_heads_json IS JSON ARRAY),
  confidence TEXT NOT NULL CHECK (confidence IN ('high', 'medium', 'low')),
  escalation_recommended INTEGER NOT NULL DEFAULT 0 CHECK (escalation_recommended IN (0, 1)),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS intel_triage_log_created ON intel_triage_log (created_at DESC);

-- ---------------------------------------- Challenge an Assessment workflow
CREATE TABLE IF NOT EXISTS assessment_challenges (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  notice_reference TEXT NOT NULL DEFAULT '',
  tax_head_id TEXT REFERENCES tax_heads(id) ON DELETE RESTRICT,
  tax_period TEXT NOT NULL DEFAULT '',
  assessment_kind TEXT NOT NULL DEFAULT 'unknown' CHECK (assessment_kind IN (
    'default', 'additional', 'amended', 'estimated', 'jeopardy', 'self-assessment-adjustment', 'unknown')),
  notice_date TEXT CHECK (notice_date IS NULL OR notice_date ~ '^\d{4}-\d{2}-\d{2}$'),
  service_date TEXT CHECK (service_date IS NULL OR service_date ~ '^\d{4}-\d{2}-\d{2}$'),
  service_date_basis TEXT NOT NULL DEFAULT 'unknown' CHECK (service_date_basis IN ('user-confirmed', 'extracted', 'unknown')),
  currency TEXT NOT NULL DEFAULT 'UGX' CHECK (currency ~ '^[A-Z]{3}$'),
  principal_tax BIGINT CHECK (principal_tax IS NULL OR principal_tax >= 0),
  penalty BIGINT CHECK (penalty IS NULL OR penalty >= 0),
  interest BIGINT CHECK (interest IS NULL OR interest >= 0),
  disputed_amount BIGINT CHECK (disputed_amount IS NULL OR disputed_amount >= 0),
  stage TEXT NOT NULL DEFAULT 'intake' CHECK (stage IN (
    'intake', 'extraction-review', 'grounds-review', 'evidence-gathering', 'drafting',
    'professional-review', 'objection-lodged', 'awaiting-decision', 'decision-received',
    'tribunal-application', 'settled', 'closed', 'abandoned')),
  risk_level TEXT NOT NULL DEFAULT 'unassessed' CHECK (risk_level IN ('unassessed', 'low', 'medium', 'high', 'critical')),
  escalated_to_professional INTEGER NOT NULL DEFAULT 0 CHECK (escalated_to_professional IN (0, 1)),
  document_id TEXT,
  row_version INTEGER NOT NULL DEFAULT 1 CHECK (row_version >= 1),
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, client_id) REFERENCES phase6_clients(organization_id, id) ON DELETE RESTRICT,
  CHECK (service_date IS NULL OR notice_date IS NULL OR notice_date <= service_date)
);
CREATE INDEX IF NOT EXISTS assessment_challenges_org_stage ON assessment_challenges (organization_id, stage, updated_at DESC);

CREATE TABLE IF NOT EXISTS assessment_challenge_items (
  id TEXT PRIMARY KEY NOT NULL,
  challenge_id TEXT NOT NULL REFERENCES assessment_challenges(id) ON DELETE RESTRICT,
  item_kind TEXT NOT NULL CHECK (item_kind IN ('adjustment', 'penalty', 'interest', 'cited-provision', 'ground')),
  description TEXT NOT NULL DEFAULT '',
  amount BIGINT CHECK (amount IS NULL OR amount >= 0),
  provision_key TEXT,
  -- For grounds: how strong the ground looks on the evidence so far (never a promise of outcome).
  ground_strength TEXT CHECK (ground_strength IS NULL OR ground_strength IN ('supported', 'arguable', 'weak', 'needs-evidence')),
  case_ids_json TEXT NOT NULL DEFAULT '[]' CHECK (case_ids_json IS JSON ARRAY),
  source TEXT NOT NULL DEFAULT 'user' CHECK (source IN ('extracted', 'user', 'professional')),
  confirmed_by_user INTEGER NOT NULL DEFAULT 0 CHECK (confirmed_by_user IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS assessment_challenge_items_challenge ON assessment_challenge_items (challenge_id, item_kind);

CREATE TABLE IF NOT EXISTS assessment_challenge_deadlines (
  id TEXT PRIMARY KEY NOT NULL,
  challenge_id TEXT NOT NULL REFERENCES assessment_challenges(id) ON DELETE RESTRICT,
  time_limit_id TEXT NOT NULL REFERENCES law_time_limits(id) ON DELETE RESTRICT,
  trigger_date TEXT NOT NULL CHECK (trigger_date ~ '^\d{4}-\d{2}-\d{2}$'),
  due_date TEXT NOT NULL CHECK (due_date ~ '^\d{4}-\d{2}-\d{2}$'),
  -- Copied from the rule at computation time so the record shows what the date relied on.
  rule_verification_status TEXT NOT NULL,
  provisional INTEGER NOT NULL CHECK (provisional IN (0, 1)),
  confirmed_by TEXT,
  confirmed_at TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (challenge_id, time_limit_id),
  CHECK (trigger_date < due_date)
);

CREATE TABLE IF NOT EXISTS assessment_challenge_evidence (
  id TEXT PRIMARY KEY NOT NULL,
  challenge_id TEXT NOT NULL REFERENCES assessment_challenges(id) ON DELETE RESTRICT,
  requirement TEXT NOT NULL,
  linked_item_id TEXT REFERENCES assessment_challenge_items(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'needed' CHECK (status IN ('needed', 'requested', 'received', 'not-available', 'not-applicable')),
  document_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS assessment_challenge_evidence_challenge ON assessment_challenge_evidence (challenge_id, status);

CREATE TABLE IF NOT EXISTS assessment_challenge_drafts (
  id TEXT PRIMARY KEY NOT NULL,
  challenge_id TEXT NOT NULL REFERENCES assessment_challenges(id) ON DELETE RESTRICT,
  version_no INTEGER NOT NULL CHECK (version_no >= 1),
  draft_kind TEXT NOT NULL CHECK (draft_kind IN ('objection-letter', 'extension-request', 'tribunal-application', 'cover-note')),
  body_markdown TEXT NOT NULL,
  review_status TEXT NOT NULL DEFAULT 'draft' CHECK (review_status IN ('draft', 'in-professional-review', 'approved', 'rejected')),
  reviewed_by TEXT,
  reviewed_at TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (challenge_id, draft_kind, version_no),
  CHECK (review_status NOT IN ('approved', 'rejected') OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS assessment_challenge_events (
  id TEXT PRIMARY KEY NOT NULL,
  challenge_id TEXT NOT NULL REFERENCES assessment_challenges(id) ON DELETE RESTRICT,
  actor_user_id TEXT NOT NULL,
  event_kind TEXT NOT NULL,
  details_json TEXT NOT NULL DEFAULT '{}' CHECK (details_json IS JSON OBJECT),
  occurred_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS assessment_challenge_events_challenge ON assessment_challenge_events (challenge_id, occurred_at DESC);

-- ------------------------------------------------------------------- access
-- Revoke first: re-running migration 000000 grants DML on ALL tables.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON taxcomp.tax_heads FROM taxcomp_worker;
REVOKE DELETE, TRUNCATE ON
  taxcomp.law_instruments, taxcomp.law_provisions, taxcomp.law_amendments, taxcomp.law_time_limits,
  taxcomp.tax_cases, taxcomp.tax_case_principles, taxcomp.tax_case_provision_links,
  taxcomp.assessment_challenges, taxcomp.assessment_challenge_items, taxcomp.assessment_challenge_deadlines,
  taxcomp.assessment_challenge_evidence, taxcomp.assessment_challenge_drafts
  FROM taxcomp_worker;
REVOKE UPDATE, DELETE, TRUNCATE ON taxcomp.intel_triage_log, taxcomp.assessment_challenge_events FROM taxcomp_worker;
GRANT SELECT ON taxcomp.tax_heads TO taxcomp_worker;
GRANT SELECT, INSERT, UPDATE ON
  taxcomp.law_instruments, taxcomp.law_provisions, taxcomp.law_amendments, taxcomp.law_time_limits,
  taxcomp.tax_cases, taxcomp.tax_case_principles, taxcomp.tax_case_provision_links,
  taxcomp.assessment_challenges, taxcomp.assessment_challenge_items, taxcomp.assessment_challenge_deadlines,
  taxcomp.assessment_challenge_evidence, taxcomp.assessment_challenge_drafts
  TO taxcomp_worker;
GRANT SELECT, INSERT ON taxcomp.intel_triage_log, taxcomp.assessment_challenge_events TO taxcomp_worker;

DO $$
DECLARE
  t TEXT;
  api_role TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'tax_heads', 'law_instruments', 'law_provisions', 'law_amendments', 'law_time_limits',
    'tax_cases', 'tax_case_principles', 'tax_case_provision_links', 'intel_triage_log',
    'assessment_challenges', 'assessment_challenge_items', 'assessment_challenge_deadlines',
    'assessment_challenge_evidence', 'assessment_challenge_drafts', 'assessment_challenge_events'] LOOP
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
