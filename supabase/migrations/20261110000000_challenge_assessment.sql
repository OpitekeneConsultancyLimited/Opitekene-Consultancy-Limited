-- Challenge an Assessment (v1): cases, field confirmations, documents,
-- disputed items, law register, procedure rules, TAT case law, reviewers,
-- consent, entitlements and the audit log.
--
-- Access model (decision D-04): browsers never query these tables. The Worker
-- verifies the Supabase JWT and filters every query by owner (or assigned
-- reviewer). RLS is on with the Worker-only policy, and anon / authenticated
-- get no grants at all.
--
-- Legal data (decisions D-10, D-14, D-16): nothing is approved for
-- computation here. Statute wording is a TODO_VERIFY placeholder; rates in
-- computation formulas are null until a reviewer enters and approves them.

SET search_path TO taxcomp;

-- ------------------------------------------------------------------- people
CREATE TABLE IF NOT EXISTS challenge_reviewers (
  user_id TEXT PRIMARY KEY NOT NULL,              -- Supabase auth.users id
  email TEXT NOT NULL,
  can_approve_law INTEGER NOT NULL DEFAULT 0 CHECK (can_approve_law IN (0, 1)),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS challenge_consents (
  user_id TEXT NOT NULL,
  consent_version TEXT NOT NULL CHECK (consent_version ~ '^[a-z0-9.-]{1,40}$'),
  accepted_at TEXT NOT NULL,
  PRIMARY KEY (user_id, consent_version)
);

-- -------------------------------------------------------------------- cases
CREATE TABLE IF NOT EXISTS challenge_cases (
  id TEXT PRIMARY KEY NOT NULL,
  owner_user_id TEXT NOT NULL,
  tax_head TEXT CHECK (tax_head IS NULL OR tax_head IN ('income_tax', 'vat')),
  assessment_type TEXT CHECK (assessment_type IS NULL OR assessment_type IN ('original', 'additional', 'other')),
  tin TEXT CHECK (tin IS NULL OR tin ~ '^[0-9]{10}$'),
  period_start TEXT CHECK (period_start IS NULL OR period_start ~ '^\d{4}-\d{2}-\d{2}$'),
  period_end TEXT CHECK (period_end IS NULL OR period_end ~ '^\d{4}-\d{2}-\d{2}$'),
  date_issued TEXT CHECK (date_issued IS NULL OR date_issued ~ '^\d{4}-\d{2}-\d{2}$'),
  date_served TEXT CHECK (date_served IS NULL OR date_served ~ '^\d{4}-\d{2}-\d{2}$'),
  service_method TEXT CHECK (service_method IS NULL OR service_method IN ('hand', 'email', 'ura-portal', 'post', 'other')),
  principal BIGINT CHECK (principal IS NULL OR principal >= 0),
  penal_tax BIGINT CHECK (penal_tax IS NULL OR penal_tax >= 0),
  interest BIGINT CHECK (interest IS NULL OR interest >= 0),
  -- Principal tax the taxpayer accepts (not in dispute); null until they say.
  tax_accepted BIGINT CHECK (tax_accepted IS NULL OR tax_accepted >= 0),
  ura_reasons TEXT NOT NULL DEFAULT '',
  provisions_cited_json TEXT NOT NULL DEFAULT '[]' CHECK (provisions_cited_json IS JSON ARRAY),
  -- Rate / months printed on URA's notice for its own interest and penal tax figures.
  notice_terms_json TEXT NOT NULL DEFAULT '{}' CHECK (notice_terms_json IS JSON OBJECT),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft', 'confirming', 'active', 'objection_filed', 'decision_received', 'tat', 'closed')),
  objection_filed_on TEXT CHECK (objection_filed_on IS NULL OR objection_filed_on ~ '^\d{4}-\d{2}-\d{2}$'),
  decision_served_on TEXT CHECK (decision_served_on IS NULL OR decision_served_on ~ '^\d{4}-\d{2}-\d{2}$'),
  preparing_tat INTEGER NOT NULL DEFAULT 0 CHECK (preparing_tat IN (0, 1)),
  late_reason TEXT NOT NULL DEFAULT '',
  -- Evidence checklist ticks, saved on the server: { "<item key>": "received" | "not-available" }.
  checklist_json TEXT NOT NULL DEFAULT '{}' CHECK (checklist_json IS JSON OBJECT),
  review_required INTEGER NOT NULL DEFAULT 0 CHECK (review_required IN (0, 1)),
  review_reasons_json TEXT NOT NULL DEFAULT '[]' CHECK (review_reasons_json IS JSON ARRAY),
  review_status TEXT NOT NULL DEFAULT 'not_required' CHECK (review_status IN ('not_required', 'pending', 'approved', 'changes_requested')),
  assigned_reviewer_id TEXT REFERENCES challenge_reviewers(user_id) ON DELETE RESTRICT,
  reviewed_by TEXT,
  reviewed_at TEXT,
  review_note TEXT NOT NULL DEFAULT '',
  -- The review sign-off covers this version of the case; any later change re-opens review.
  reviewed_case_version INTEGER,
  case_version INTEGER NOT NULL DEFAULT 1 CHECK (case_version >= 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (period_start IS NULL OR period_end IS NULL OR period_start <= period_end),
  CHECK (date_served IS NULL OR date_issued IS NULL OR date_issued <= date_served),
  CHECK (review_status <> 'approved' OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND reviewed_case_version IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS challenge_cases_owner ON challenge_cases (owner_user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS challenge_cases_reviewer ON challenge_cases (assigned_reviewer_id, review_status);

CREATE TABLE IF NOT EXISTS challenge_field_confirmations (
  id TEXT PRIMARY KEY NOT NULL,
  case_id TEXT NOT NULL REFERENCES challenge_cases(id) ON DELETE CASCADE,
  field_name TEXT NOT NULL CHECK (field_name IN (
    'tin', 'tax_head', 'assessment_type', 'period_start', 'period_end', 'date_issued',
    'principal', 'penal_tax', 'interest', 'ura_reasons', 'provisions_cited',
    'interest_rate_percent_per_month', 'interest_months', 'penal_tax_percent')),
  extracted_value TEXT,
  confirmed_value TEXT,
  confidence REAL CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  source TEXT NOT NULL CHECK (source IN ('ai-claude', 'ai-gemini', 'text-reader', 'user')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'corrected', 'unconfirmable')),
  confirmed_by TEXT,
  confirmed_at TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (case_id, field_name),
  CHECK (status = 'pending' OR (confirmed_by IS NOT NULL AND confirmed_at IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS challenge_documents (
  id TEXT PRIMARY KEY NOT NULL,
  case_id TEXT NOT NULL REFERENCES challenge_cases(id) ON DELETE CASCADE,
  owner_user_id TEXT NOT NULL,
  storage_path TEXT NOT NULL UNIQUE,
  doc_type TEXT NOT NULL CHECK (doc_type IN ('assessment', 'return', 'ledger', 'invoice', 'bank_statement', 'correspondence', 'objection_decision', 'other')),
  file_name TEXT NOT NULL CHECK (length(file_name) BETWEEN 1 AND 200),
  content_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 10485760),
  uploaded_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS challenge_documents_case ON challenge_documents (case_id);

CREATE TABLE IF NOT EXISTS challenge_disputed_items (
  id TEXT PRIMARY KEY NOT NULL,
  case_id TEXT NOT NULL REFERENCES challenge_cases(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  category TEXT NOT NULL CHECK (category IN ('income', 'expense', 'input_vat', 'output_vat', 'penal_tax', 'interest', 'credit', 'procedural', 'other')),
  description TEXT NOT NULL CHECK (length(description) BETWEEN 1 AND 500),
  ura_amount BIGINT CHECK (ura_amount IS NULL OR ura_amount >= 0),
  taxpayer_amount BIGINT CHECK (taxpayer_amount IS NULL OR taxpayer_amount >= 0),
  -- What the user told us (plain answers), stored as JSON for the classifier.
  facts_json TEXT NOT NULL DEFAULT '{}' CHECK (facts_json IS JSON OBJECT),
  documents_json TEXT NOT NULL DEFAULT '[]' CHECK (documents_json IS JSON ARRAY),
  -- Optional reviewer override of the computed outcome (recorded in the audit log).
  reviewer_outcome TEXT CHECK (reviewer_outcome IS NULL OR reviewer_outcome IN (
    'correct', 'computational_error', 'insufficient_evidence', 'arguable_legal_ground', 'procedural_issue')),
  keep_in_objection INTEGER NOT NULL DEFAULT 1 CHECK (keep_in_objection IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS challenge_disputed_items_case ON challenge_disputed_items (case_id, position);

CREATE TABLE IF NOT EXISTS challenge_case_entitlements (
  case_id TEXT NOT NULL REFERENCES challenge_cases(id) ON DELETE CASCADE,
  tier TEXT NOT NULL CHECK (tier IN ('reviewed', 'managed')),
  granted_by TEXT NOT NULL,
  granted_at TEXT NOT NULL,
  payment_reference TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (case_id, tier)
);

-- Plans already sold (Flutterwave / manual) map onto the pack tiers (D-08).
ALTER TABLE billing_plans ADD COLUMN IF NOT EXISTS challenge_tier TEXT NOT NULL DEFAULT 'free'
  CHECK (challenge_tier IN ('free', 'self-service', 'reviewed', 'managed'));
UPDATE billing_plans SET challenge_tier = 'self-service' WHERE id IN ('individual-monthly', 'firm-monthly') AND challenge_tier = 'free';

-- ------------------------------------------------------------ audit log
-- No foreign key: the trail must survive the deletion of the case it describes.
CREATE TABLE IF NOT EXISTS challenge_audit_log (
  id TEXT PRIMARY KEY NOT NULL,
  actor_user_id TEXT NOT NULL,
  actor_role TEXT NOT NULL CHECK (actor_role IN ('owner', 'reviewer', 'system')),
  action TEXT NOT NULL CHECK (length(action) BETWEEN 3 AND 60),
  case_id TEXT,
  document_id TEXT,
  details_json TEXT NOT NULL DEFAULT '{}' CHECK (details_json IS JSON OBJECT),
  occurred_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS challenge_audit_log_case ON challenge_audit_log (case_id, occurred_at DESC);

-- ------------------------------------------------------------ law register
CREATE TABLE IF NOT EXISTS law_statutes (
  id TEXT PRIMARY KEY NOT NULL CHECK (id ~ '^[a-z0-9-]{2,60}$'),
  title TEXT NOT NULL,
  chapter TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('principal', 'amendment')),
  parent_id TEXT REFERENCES law_statutes(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
  bill_status TEXT NOT NULL CHECK (bill_status IN ('bill', 'passed', 'returned', 'assented', 'in_force')),
  returned_date TEXT CHECK (returned_date IS NULL OR returned_date ~ '^\d{4}-\d{2}-\d{2}$'),
  assent_date TEXT CHECK (assent_date IS NULL OR assent_date ~ '^\d{4}-\d{2}-\d{2}$'),
  commencement_date TEXT CHECK (commencement_date IS NULL OR commencement_date ~ '^\d{4}-\d{2}-\d{2}$'),
  -- First tax period the law is applied to (may precede assent, e.g. ITA 2026).
  applies_from_period TEXT CHECK (applies_from_period IS NULL OR applies_from_period ~ '^\d{4}-\d{2}-\d{2}$'),
  source_url TEXT CHECK (source_url IS NULL OR source_url ~ '^https://'),
  verification_status TEXT NOT NULL DEFAULT 'pending-review' CHECK (verification_status IN ('pending-review', 'verified')),
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  CHECK (kind = 'principal' OR parent_id IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS law_provision_versions (
  id TEXT PRIMARY KEY NOT NULL CHECK (id ~ '^[a-z0-9.-]{2,80}$'),
  statute_id TEXT NOT NULL REFERENCES law_statutes(id) ON DELETE RESTRICT,
  topic TEXT NOT NULL CHECK (topic ~ '^[a-z0-9-]{2,60}$'),
  section TEXT NOT NULL,
  heading TEXT NOT NULL,
  text_or_summary TEXT NOT NULL DEFAULT 'TODO_VERIFY: paste official text from ULII',
  text_verified_by TEXT,
  text_verified_at TEXT,
  bill_status TEXT NOT NULL CHECK (bill_status IN ('bill', 'passed', 'returned', 'assented', 'in_force')),
  assent_date TEXT CHECK (assent_date IS NULL OR assent_date ~ '^\d{4}-\d{2}-\d{2}$'),
  commencement_date TEXT CHECK (commencement_date IS NULL OR commencement_date ~ '^\d{4}-\d{2}-\d{2}$'),
  applies_from_period TEXT CHECK (applies_from_period IS NULL OR applies_from_period ~ '^\d{4}-\d{2}-\d{2}$'),
  applies_to_period TEXT CHECK (applies_to_period IS NULL OR applies_to_period ~ '^\d{4}-\d{2}-\d{2}$'),
  amended_by_statute_id TEXT REFERENCES law_statutes(id) ON DELETE RESTRICT,
  computation_json TEXT NOT NULL DEFAULT '{}' CHECK (computation_json IS JSON OBJECT),
  approved_for_computation INTEGER NOT NULL DEFAULT 0 CHECK (approved_for_computation IN (0, 1)),
  approved_by TEXT,
  approved_at TEXT,
  source_url TEXT CHECK (source_url IS NULL OR source_url ~ '^https://'),
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (applies_to_period IS NULL OR applies_from_period IS NULL OR applies_from_period <= applies_to_period),
  CHECK (approved_for_computation = 0 OR (approved_by IS NOT NULL AND approved_at IS NOT NULL AND text_verified_by IS NOT NULL)),
  CHECK (bill_status <> 'bill' OR approved_for_computation = 0)
);
CREATE INDEX IF NOT EXISTS law_provision_versions_topic ON law_provision_versions (topic, applies_from_period);

-- --------------------------------------------------------- procedure rules
CREATE TABLE IF NOT EXISTS procedure_rule_sets (
  version TEXT PRIMARY KEY NOT NULL CHECK (version ~ '^[a-z0-9.-]{3,60}$'),
  title TEXT NOT NULL,
  sources_json TEXT NOT NULL DEFAULT '[]' CHECK (sources_json IS JSON ARRAY),
  approved_for_computation INTEGER NOT NULL DEFAULT 0 CHECK (approved_for_computation IN (0, 1)),
  approved_by TEXT,
  approved_at TEXT,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL,
  CHECK (approved_for_computation = 0 OR (approved_by IS NOT NULL AND approved_at IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS procedure_rules (
  rule_set_version TEXT NOT NULL REFERENCES procedure_rule_sets(version) ON DELETE RESTRICT,
  rule_key TEXT NOT NULL CHECK (rule_key IN ('objection', 'late_objection', 'objection_decision', 'tat_application', 'tat_payment', 'adr')),
  label TEXT NOT NULL,
  trigger_event TEXT NOT NULL CHECK (trigger_event IN ('service_of_assessment', 'lapse_of_objection_period', 'objection_filed', 'service_of_objection_decision', 'none')),
  period_days INTEGER CHECK (period_days IS NULL OR period_days > 0),
  urgent_days INTEGER CHECK (urgent_days IS NULL OR urgent_days >= 0),
  -- TODO_VERIFY flags (D-15): day-counting conventions are unconfirmed.
  exclude_trigger_day INTEGER NOT NULL DEFAULT 1 CHECK (exclude_trigger_day IN (0, 1)),
  weekend_holiday_rule TEXT NOT NULL DEFAULT 'calendar' CHECK (weekend_holiday_rule IN ('calendar', 'next_business_day')),
  counting_todo_verify INTEGER NOT NULL DEFAULT 1 CHECK (counting_todo_verify IN (0, 1)),
  payment_fraction NUMERIC CHECK (payment_fraction IS NULL OR (payment_fraction > 0 AND payment_fraction <= 1)),
  description TEXT NOT NULL,
  source_url TEXT CHECK (source_url IS NULL OR source_url ~ '^https://'),
  PRIMARY KEY (rule_set_version, rule_key)
);

-- ------------------------------------------------------------ TAT case law
CREATE TABLE IF NOT EXISTS tax_case_law (
  id TEXT PRIMARY KEY NOT NULL CHECK (id ~ '^[a-z0-9-]{3,120}$'),
  citation TEXT NOT NULL UNIQUE,
  parties TEXT NOT NULL,
  decision_date TEXT CHECK (decision_date IS NULL OR decision_date ~ '^\d{4}-\d{2}-\d{2}$'),
  forum TEXT NOT NULL DEFAULT 'TAT' CHECK (forum IN ('TAT')),
  background TEXT,
  legal_question TEXT,
  decision TEXT,
  principle TEXT,
  -- 'none' until someone drafts a summary; AI drafts stay 'draft' until a reviewer approves.
  summary_status TEXT NOT NULL DEFAULT 'none' CHECK (summary_status IN ('none', 'draft', 'approved')),
  summary_source TEXT CHECK (summary_source IS NULL OR summary_source IN ('ai', 'staff')),
  issue_tags_json TEXT NOT NULL DEFAULT '[]' CHECK (issue_tags_json IS JSON ARRAY),
  search_terms TEXT NOT NULL DEFAULT '',
  source_url TEXT NOT NULL CHECK (source_url ~ '^https://ulii\.org/'),
  appeal_status TEXT NOT NULL DEFAULT 'unverified' CHECK (appeal_status IN ('unverified', 'final', 'appealed', 'overturned', 'upheld')),
  verified_by TEXT,
  verified_at TEXT,
  ingested_at TEXT NOT NULL,
  CHECK (appeal_status = 'unverified' OR (verified_by IS NOT NULL AND verified_at IS NOT NULL)),
  CHECK (summary_status <> 'approved' OR (verified_by IS NOT NULL AND verified_at IS NOT NULL))
);

-- ------------------------------------------------------------- seed: law
INSERT INTO law_statutes (id, title, chapter, kind, parent_id, bill_status, returned_date, assent_date, commencement_date, applies_from_period, source_url, note, created_at) VALUES
  ('ita', 'Income Tax Act', 'Cap. 338', 'principal', NULL, 'in_force', NULL, NULL, NULL, NULL, 'https://ulii.org/en/legislation/', 'TODO_VERIFY: chapter number and exact ULII link (Laws of Uganda 2024 Revised Edition). Chapter taken from the owner''s brief.', '2026-11-10T00:00:00.000Z'),
  ('vata', 'Value Added Tax Act', 'Cap. 344', 'principal', NULL, 'in_force', NULL, NULL, NULL, NULL, 'https://ulii.org/en/legislation/', 'TODO_VERIFY: chapter number and exact ULII link. Chapter taken from the owner''s brief.', '2026-11-10T00:00:00.000Z'),
  ('tpca', 'Tax Procedures Code Act', 'Cap. 343', 'principal', NULL, 'in_force', NULL, NULL, NULL, NULL, 'https://ulii.org/en/legislation/', 'TODO_VERIFY: chapter number and exact ULII link. Chapter taken from the owner''s brief.', '2026-11-10T00:00:00.000Z'),
  ('tata', 'Tax Appeals Tribunal Act', 'Cap. 345', 'principal', NULL, 'in_force', NULL, NULL, NULL, NULL, 'https://ulii.org/en/legislation/', 'TODO_VERIFY: chapter number and exact ULII link. Chapter taken from the owner''s brief.', '2026-11-10T00:00:00.000Z'),
  ('vata-amendment-2026', 'Value Added Tax (Amendment) Act, 2026', NULL, 'amendment', 'vata', 'in_force', NULL, '2026-05-18', '2026-07-01', '2026-07-01', 'https://ulii.org/en/legislation/', 'Dates from the owner''s brief (assented 18 May 2026, commenced 1 July 2026). TODO_VERIFY against the Uganda Gazette.', '2026-11-10T00:00:00.000Z'),
  ('tpca-amendment-2026', 'Tax Procedures Code (Amendment) Act, 2026', NULL, 'amendment', 'tpca', 'in_force', NULL, '2026-05-18', '2026-07-01', '2026-07-01', 'https://ulii.org/en/legislation/', 'Dates from the owner''s brief (assented 18 May 2026, commenced 1 July 2026). TODO_VERIFY against the Uganda Gazette.', '2026-11-10T00:00:00.000Z'),
  ('ita-amendment-2026', 'Income Tax (Amendment) Act, 2026', NULL, 'amendment', 'ita', 'in_force', '2026-07-14', '2026-08-20', '2026-07-01', '2026-07-01', 'https://ulii.org/en/legislation/', 'Dates from the owner''s brief: the Bill was returned by the President on 14 July 2026 and assented on 20 August 2026; URA applies it from 1 July 2026. TODO_VERIFY against the Uganda Gazette.', '2026-11-10T00:00:00.000Z')
ON CONFLICT (id) DO NOTHING;

-- One version per statute regime and topic. Wording is never seeded; each
-- row says what it is about and waits for the official text (TODO_VERIFY).
INSERT INTO law_provision_versions (id, statute_id, topic, section, heading, bill_status, assent_date, commencement_date, applies_from_period, applies_to_period, amended_by_statute_id, computation_json, source_url, note, created_at, updated_at) VALUES
  ('ita.deductions.pre-2026', 'ita', 'expense-deductibility', 'TODO_VERIFY', 'Deduction of expenditure incurred in producing income', 'in_force', NULL, NULL, NULL, '2026-06-30', NULL, '{}', 'https://ulii.org/en/legislation/', '', '2026-11-10T00:00:00.000Z', '2026-11-10T00:00:00.000Z'),
  ('ita.deductions.2026', 'ita', 'expense-deductibility', 'TODO_VERIFY', 'Deduction of expenditure incurred in producing income (as amended in 2026)', 'in_force', '2026-08-20', '2026-07-01', '2026-07-01', NULL, 'ita-amendment-2026', '{}', 'https://ulii.org/en/legislation/', 'TODO_VERIFY: confirm whether the 2026 amendment changed this provision.', '2026-11-10T00:00:00.000Z', '2026-11-10T00:00:00.000Z'),
  ('ita.penal-tax.pre-2026', 'ita', 'penal-tax', 'TODO_VERIFY', 'Penal tax on a shortfall or false return', 'in_force', NULL, NULL, NULL, '2026-06-30', NULL, '{"kind":"percent-of-principal","percent":null,"todo":"TODO_VERIFY: rate and base"}', 'https://ulii.org/en/legislation/', '', '2026-11-10T00:00:00.000Z', '2026-11-10T00:00:00.000Z'),
  ('ita.penal-tax.2026', 'ita', 'penal-tax', 'TODO_VERIFY', 'Penal tax on a shortfall or false return (as amended in 2026)', 'in_force', '2026-08-20', '2026-07-01', '2026-07-01', NULL, 'ita-amendment-2026', '{"kind":"percent-of-principal","percent":null,"todo":"TODO_VERIFY: rate and base"}', 'https://ulii.org/en/legislation/', 'TODO_VERIFY: confirm whether the 2026 amendment changed this provision.', '2026-11-10T00:00:00.000Z', '2026-11-10T00:00:00.000Z'),
  ('vata.input-credit.pre-2026', 'vata', 'input-vat', 'TODO_VERIFY', 'Credit for input tax and the documents required', 'in_force', NULL, NULL, NULL, '2026-06-30', NULL, '{}', 'https://ulii.org/en/legislation/', '', '2026-11-10T00:00:00.000Z', '2026-11-10T00:00:00.000Z'),
  ('vata.input-credit.2026', 'vata', 'input-vat', 'TODO_VERIFY', 'Credit for input tax and the documents required (as amended in 2026)', 'in_force', '2026-05-18', '2026-07-01', '2026-07-01', NULL, 'vata-amendment-2026', '{}', 'https://ulii.org/en/legislation/', 'TODO_VERIFY: confirm whether the 2026 amendment changed this provision.', '2026-11-10T00:00:00.000Z', '2026-11-10T00:00:00.000Z'),
  ('tpca.objection.pre-2026', 'tpca', 'objection-procedure', 'TODO_VERIFY', 'Objection to a tax decision', 'in_force', NULL, NULL, NULL, '2026-06-30', NULL, '{}', 'https://ura.go.ug/en/domestic-taxes/objection-appeals/', '', '2026-11-10T00:00:00.000Z', '2026-11-10T00:00:00.000Z'),
  ('tpca.objection.2026', 'tpca', 'objection-procedure', 'TODO_VERIFY', 'Objection to a tax decision (as amended in 2026)', 'in_force', '2026-05-18', '2026-07-01', '2026-07-01', NULL, 'tpca-amendment-2026', '{}', 'https://ura.go.ug/en/domestic-taxes/objection-appeals/', 'TODO_VERIFY: confirm whether the 2026 amendment changed this provision.', '2026-11-10T00:00:00.000Z', '2026-11-10T00:00:00.000Z'),
  ('tpca.interest.pre-2026', 'tpca', 'interest', 'TODO_VERIFY', 'Interest on unpaid tax', 'in_force', NULL, NULL, NULL, '2026-06-30', NULL, '{"kind":"simple-monthly","ratePercentPerMonth":null,"todo":"TODO_VERIFY: rate and whether it compounds"}', 'https://ulii.org/en/legislation/', '', '2026-11-10T00:00:00.000Z', '2026-11-10T00:00:00.000Z'),
  ('tpca.interest.2026', 'tpca', 'interest', 'TODO_VERIFY', 'Interest on unpaid tax (as amended in 2026)', 'in_force', '2026-05-18', '2026-07-01', '2026-07-01', NULL, 'tpca-amendment-2026', '{"kind":"simple-monthly","ratePercentPerMonth":null,"todo":"TODO_VERIFY: rate and whether it compounds"}', 'https://ulii.org/en/legislation/', 'TODO_VERIFY: confirm whether the 2026 amendment changed this provision.', '2026-11-10T00:00:00.000Z', '2026-11-10T00:00:00.000Z'),
  ('tpca.burden-of-proof', 'tpca', 'burden-of-proof', 'TODO_VERIFY', 'Burden of proving that a tax decision is wrong', 'in_force', NULL, NULL, NULL, NULL, NULL, '{}', 'https://ulii.org/en/legislation/', '', '2026-11-10T00:00:00.000Z', '2026-11-10T00:00:00.000Z'),
  ('tata.review-application', 'tata', 'tat-application', 'TODO_VERIFY', 'Application to the Tribunal for review of an objection decision', 'in_force', NULL, NULL, NULL, NULL, NULL, '{}', 'https://ura.go.ug/en/domestic-taxes/objection-appeals/', '', '2026-11-10T00:00:00.000Z', '2026-11-10T00:00:00.000Z')
ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------- seed: procedure rules
INSERT INTO procedure_rule_sets (version, title, sources_json, created_at) VALUES
  ('objections-2026.v1', 'Objections, Tribunal applications and payment before the Tribunal (published rules)',
   '["https://ura.go.ug/en/domestic-taxes/objection-appeals/","https://monitor.co.ug/uganda/business/prosper/resolving-tax-disputes-3558190"]',
   '2026-11-10T00:00:00.000Z')
ON CONFLICT (version) DO NOTHING;

INSERT INTO procedure_rules (rule_set_version, rule_key, label, trigger_event, period_days, urgent_days, payment_fraction, description, source_url) VALUES
  ('objections-2026.v1', 'objection', 'Objection to URA', 'service_of_assessment', 45, 10, NULL,
   'Object within 45 days of receiving the assessment.', 'https://ura.go.ug/en/domestic-taxes/objection-appeals/'),
  ('objections-2026.v1', 'late_objection', 'Late objection', 'lapse_of_objection_period', NULL, NULL, NULL,
   'The Commissioner may accept a late objection for absence from Uganda, sickness or another reasonable cause, if there was no unreasonable delay.', 'https://ura.go.ug/en/domestic-taxes/objection-appeals/'),
  ('objections-2026.v1', 'objection_decision', 'URA decision on the objection', 'objection_filed', 90, NULL, NULL,
   'URA has 90 days to decide an objection.', 'https://monitor.co.ug/uganda/business/prosper/resolving-tax-disputes-3558190'),
  ('objections-2026.v1', 'tat_application', 'Application to the Tax Appeals Tribunal', 'service_of_objection_decision', 30, 10, NULL,
   'Apply to the Tax Appeals Tribunal within 30 days after service of the objection decision.', 'https://ura.go.ug/en/domestic-taxes/objection-appeals/'),
  ('objections-2026.v1', 'tat_payment', 'Payment before the Tribunal', 'none', NULL, NULL, 0.30,
   'Pay 30% of the tax assessed or the tax not in dispute, whichever is higher, before the Tribunal hears the application.', 'https://ura.go.ug/en/domestic-taxes/objection-appeals/'),
  ('objections-2026.v1', 'adr', 'Alternative dispute resolution', 'none', NULL, NULL, NULL,
   'URA and the taxpayer may agree to settle outside the Tribunal. This never replaces filing on time.', 'https://ura.go.ug/en/domestic-taxes/objection-appeals/')
ON CONFLICT (rule_set_version, rule_key) DO NOTHING;

SET CONSTRAINTS ALL IMMEDIATE;

-- ------------------------------------------------------------ storage bucket
DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES ('assessment-documents', 'assessment-documents', false, 10485760, ARRAY[
      'application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/plain', 'text/csv'])
    ON CONFLICT (id) DO UPDATE
      SET public = false,
          file_size_limit = EXCLUDED.file_size_limit,
          allowed_mime_types = EXCLUDED.allowed_mime_types;
  END IF;
END
$$;

-- ------------------------------------------------------------------- access
-- Revoke first: re-running migration 000000 grants DML on ALL tables.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON taxcomp.law_statutes, taxcomp.procedure_rule_sets, taxcomp.procedure_rules FROM taxcomp_worker;
REVOKE DELETE, TRUNCATE ON taxcomp.law_provision_versions, taxcomp.tax_case_law, taxcomp.challenge_reviewers, taxcomp.challenge_consents FROM taxcomp_worker;
REVOKE UPDATE, DELETE, TRUNCATE ON taxcomp.challenge_audit_log FROM taxcomp_worker;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON taxcomp.challenge_reviewers FROM taxcomp_worker;
REVOKE TRUNCATE ON taxcomp.challenge_cases, taxcomp.challenge_field_confirmations, taxcomp.challenge_documents,
  taxcomp.challenge_disputed_items, taxcomp.challenge_case_entitlements FROM taxcomp_worker;
GRANT SELECT ON taxcomp.law_statutes, taxcomp.procedure_rules, taxcomp.challenge_reviewers TO taxcomp_worker;
-- Reviewers approve rule sets and verify statute text through the Worker (audited).
GRANT SELECT, UPDATE ON taxcomp.procedure_rule_sets TO taxcomp_worker;
GRANT SELECT, INSERT, UPDATE ON taxcomp.law_provision_versions, taxcomp.tax_case_law, taxcomp.challenge_consents TO taxcomp_worker;
GRANT SELECT, INSERT ON taxcomp.challenge_audit_log TO taxcomp_worker;
-- One-click deletion of a case removes its rows (D-04); the audit log stays.
GRANT SELECT, INSERT, UPDATE, DELETE ON taxcomp.challenge_cases, taxcomp.challenge_field_confirmations, taxcomp.challenge_documents,
  taxcomp.challenge_disputed_items, taxcomp.challenge_case_entitlements TO taxcomp_worker;

DO $$
DECLARE
  t TEXT;
  api_role TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'challenge_reviewers', 'challenge_consents', 'challenge_cases', 'challenge_field_confirmations',
    'challenge_documents', 'challenge_disputed_items', 'challenge_case_entitlements', 'challenge_audit_log',
    'law_statutes', 'law_provision_versions', 'procedure_rule_sets', 'procedure_rules', 'tax_case_law'] LOOP
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
