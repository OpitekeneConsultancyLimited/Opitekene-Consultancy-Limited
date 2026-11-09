-- TaxComp schema for Supabase Postgres (17+).
--
-- Postgres translation of the Cloudflare D1 migrations 0001-0006 in
-- worker/migrations. Column names, types-as-seen-by-the-Worker and constraints
-- are kept equivalent so the Worker's SQL runs unchanged through worker/db.mjs.
--
-- Security model
-- * Tables live in the private "taxcomp" schema. Supabase only exposes the
--   schemas listed under API settings (public by default) through its Data API,
--   so nothing here is reachable with the anon/authenticated API keys.
-- * Row level security is enabled on every table as a second layer; only the
--   dedicated "taxcomp_worker" role (used by the Cloudflare Worker through
--   Hyperdrive) has policies. Authorization stays in the Worker.
-- * The role is created without a password. Set one yourself in the SQL editor
--   (never commit it):  ALTER ROLE taxcomp_worker WITH LOGIN PASSWORD '...';
--
-- Differences from the SQLite schema
-- * json_valid(x)              -> x IS JSON
-- * COLLATE NOCASE             -> unique/ordered indexes on lower(...)
-- * GLOB '[A-Z][A-Z][A-Z]'     -> ~ '^[A-Z]{3}$'
-- * date(x) = x                -> ISO yyyy-mm-dd regex plus a real date cast
-- * RAISE(ABORT) triggers      -> PL/pgSQL trigger function
-- * REAL                       -> double precision; byte/amount counters -> bigint
-- * legal_sources and phase6_documents are created before the tables that
--   reference them (SQLite allowed forward references, Postgres does not).

CREATE SCHEMA IF NOT EXISTS taxcomp;
SET search_path TO taxcomp;

-- ---------------------------------------------------------------- 0001 + 0002
CREATE TABLE IF NOT EXISTS unanswered_questions (
  id TEXT PRIMARY KEY NOT NULL,
  question TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consented_at TEXT
);
CREATE INDEX IF NOT EXISTS unanswered_questions_created_at
  ON unanswered_questions (created_at DESC);
CREATE INDEX IF NOT EXISTS unanswered_questions_expires_at
  ON unanswered_questions (expires_at);

-- ----------------------------------------------------------------------- 0003
CREATE TABLE IF NOT EXISTS efris_clients (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  tin TEXT UNIQUE,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS efris_products (
  id TEXT PRIMARY KEY NOT NULL,
  client_id TEXT NOT NULL REFERENCES efris_clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  item_code TEXT NOT NULL DEFAULT '',
  unit TEXT NOT NULL,
  selling_price DOUBLE PRECISION NOT NULL CHECK (selling_price >= 0),
  tax_category TEXT NOT NULL CHECK (tax_category IN ('standard', 'zero_rated', 'exempt', 'out_of_scope')),
  vat_rate DOUBLE PRECISION NOT NULL CHECK (vat_rate >= 0 AND vat_rate <= 100),
  classification_code TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS efris_invoices (
  id TEXT PRIMARY KEY NOT NULL,
  client_id TEXT NOT NULL REFERENCES efris_clients(id) ON DELETE CASCADE,
  invoice_number TEXT NOT NULL,
  invoice_type TEXT NOT NULL CHECK (invoice_type IN ('tax_invoice', 'receipt', 'credit_note', 'debit_note')),
  transaction_date TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  customer_tin TEXT,
  original_invoice_number TEXT,
  lines_json TEXT NOT NULL,
  net_amount DOUBLE PRECISION NOT NULL CHECK (net_amount >= 0),
  vat_amount DOUBLE PRECISION NOT NULL CHECK (vat_amount >= 0),
  total_amount DOUBLE PRECISION NOT NULL CHECK (total_amount >= 0),
  status TEXT NOT NULL CHECK (status IN ('draft', 'validated')),
  created_at TEXT NOT NULL,
  UNIQUE (client_id, invoice_number)
);

CREATE TABLE IF NOT EXISTS efris_imports (
  id TEXT PRIMARY KEY NOT NULL,
  client_id TEXT NOT NULL REFERENCES efris_clients(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK (source_type IN ('efris', 'sales_ledger')),
  invoice_number TEXT NOT NULL,
  transaction_date TEXT NOT NULL,
  customer_name TEXT,
  customer_tin TEXT,
  amount DOUBLE PRECISION NOT NULL CHECK (amount >= 0),
  vat_amount DOUBLE PRECISION NOT NULL CHECK (vat_amount >= 0 AND vat_amount <= amount),
  tax_category TEXT,
  imported_status TEXT NOT NULL,
  fiscalisation_reference TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS efris_audit_log (
  id TEXT PRIMARY KEY NOT NULL,
  client_id TEXT NOT NULL,
  action TEXT NOT NULL,
  record_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS efris_products_client_name ON efris_products (client_id, name);
CREATE UNIQUE INDEX IF NOT EXISTS efris_products_client_item_code
  ON efris_products (client_id, item_code) WHERE item_code <> '';
CREATE INDEX IF NOT EXISTS efris_invoices_client_created ON efris_invoices (client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS efris_imports_client_invoice ON efris_imports (client_id, invoice_number, source_type);
CREATE INDEX IF NOT EXISTS efris_audit_client_created ON efris_audit_log (client_id, created_at DESC);

-- ----------------------------------------------------------------------- 0004
CREATE TABLE IF NOT EXISTS legal_sources (
  source_id TEXT PRIMARY KEY NOT NULL,
  record_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending-review', 'verified', 'superseded', 'withdrawn', 'rejected')),
  review_history_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS legal_sources_status_updated ON legal_sources (status, updated_at DESC);

CREATE TABLE IF NOT EXISTS legal_source_audit (
  id TEXT PRIMARY KEY NOT NULL,
  source_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('submitted', 'updated-draft', 'verified', 'rejected')),
  actor TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS legal_source_audit_source_created ON legal_source_audit (source_id, created_at DESC);

-- ----------------------------------------------------------------------- 0005
CREATE TABLE IF NOT EXISTS phase6_bootstrap_state (
  state_key TEXT PRIMARY KEY NOT NULL,
  completed_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS phase6_organizations (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 160),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'archived')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS phase6_users (
  id TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('pending', 'active', 'inactive', 'locked')),
  failed_login_attempts INTEGER NOT NULL DEFAULT 0 CHECK (failed_login_attempts >= 0),
  locked_until TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
-- SQLite: email TEXT COLLATE NOCASE UNIQUE
CREATE UNIQUE INDEX IF NOT EXISTS phase6_users_email_nocase ON phase6_users (lower(email));

CREATE TABLE IF NOT EXISTS phase6_memberships (
  organization_id TEXT NOT NULL REFERENCES phase6_organizations(id) ON DELETE RESTRICT,
  user_id TEXT NOT NULL REFERENCES phase6_users(id) ON DELETE RESTRICT,
  role TEXT NOT NULL CHECK (role IN (
    'system-admin', 'practice-admin', 'tax-consultant', 'accountant', 'reviewer', 'client'
  )),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TEXT NOT NULL,
  PRIMARY KEY (organization_id, user_id)
);

CREATE TABLE IF NOT EXISTS phase6_sessions (
  session_hash TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  csrf_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  revoked_at TEXT,
  FOREIGN KEY (organization_id, user_id)
    REFERENCES phase6_memberships(organization_id, user_id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS phase6_sessions_user_expiry ON phase6_sessions (user_id, expires_at, revoked_at);

CREATE TABLE IF NOT EXISTS phase6_password_resets (
  token_hash TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES phase6_users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT
);
CREATE INDEX IF NOT EXISTS phase6_password_resets_user_expiry
  ON phase6_password_resets (user_id, expires_at, consumed_at);

CREATE TABLE IF NOT EXISTS phase6_clients (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL REFERENCES phase6_organizations(id) ON DELETE RESTRICT,
  legal_business_name TEXT NOT NULL CHECK (length(trim(legal_business_name)) BETWEEN 1 AND 200),
  tin TEXT,
  registration_number TEXT,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('individual', 'company', 'partnership', 'ngo', 'trust', 'other')),
  taxpayer_category TEXT NOT NULL CHECK (taxpayer_category IN ('individual', 'company', 'ngo', 'sme', 'other')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  engagement_status TEXT NOT NULL DEFAULT 'pending' CHECK (engagement_status IN ('pending', 'active', 'completed', 'declined')),
  created_by TEXT NOT NULL REFERENCES phase6_users(id) ON DELETE RESTRICT,
  updated_by TEXT NOT NULL REFERENCES phase6_users(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT,
  UNIQUE (organization_id, id),
  CHECK ((status = 'active' AND archived_at IS NULL) OR (status = 'archived' AND archived_at IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS phase6_clients_org_tin_unique
  ON phase6_clients (organization_id, tin)
  WHERE tin IS NOT NULL AND length(trim(tin)) > 0;
CREATE INDEX IF NOT EXISTS phase6_clients_org_status_name
  ON phase6_clients (organization_id, status, lower(legal_business_name));

CREATE TABLE IF NOT EXISTS phase6_client_access (
  organization_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  assigned_by TEXT NOT NULL REFERENCES phase6_users(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL,
  PRIMARY KEY (organization_id, user_id, client_id),
  FOREIGN KEY (organization_id, user_id)
    REFERENCES phase6_memberships(organization_id, user_id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, client_id)
    REFERENCES phase6_clients(organization_id, id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS phase6_client_access_user ON phase6_client_access (organization_id, user_id, client_id);

CREATE TABLE IF NOT EXISTS phase6_client_tax_profiles (
  organization_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  schema_version INTEGER NOT NULL DEFAULT 1 CHECK (schema_version = 1),
  profile_json TEXT NOT NULL CHECK (profile_json IS JSON),
  created_by TEXT NOT NULL REFERENCES phase6_users(id) ON DELETE RESTRICT,
  updated_by TEXT NOT NULL REFERENCES phase6_users(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (organization_id, client_id),
  FOREIGN KEY (organization_id, client_id)
    REFERENCES phase6_clients(organization_id, id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS phase6_engagements (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 200),
  service_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'completed', 'cancelled')),
  assigned_consultant_id TEXT REFERENCES phase6_users(id) ON DELETE RESTRICT,
  created_by TEXT NOT NULL REFERENCES phase6_users(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, client_id)
    REFERENCES phase6_clients(organization_id, id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS phase6_engagements_org_client_status
  ON phase6_engagements (organization_id, client_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS phase6_engagements_consultant_status
  ON phase6_engagements (organization_id, assigned_consultant_id, status);

CREATE TABLE IF NOT EXISTS phase6_obligations (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  tax_type TEXT NOT NULL,
  tax_period TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  filing_deadline TEXT,
  payment_deadline TEXT,
  filing_status TEXT NOT NULL DEFAULT 'upcoming' CHECK (filing_status IN ('upcoming', 'due-soon', 'overdue', 'prepared', 'filed', 'under-review')),
  payment_status TEXT NOT NULL DEFAULT 'upcoming' CHECK (payment_status IN ('upcoming', 'due-soon', 'overdue', 'partially-paid', 'paid', 'under-review')),
  outstanding_amount DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK (outstanding_amount >= 0),
  deadline_source_id TEXT REFERENCES legal_sources(source_id) ON DELETE RESTRICT,
  deadline_verification_status TEXT NOT NULL DEFAULT 'unverified' CHECK (deadline_verification_status IN ('unverified', 'verified')),
  responsible_user_id TEXT REFERENCES phase6_users(id) ON DELETE RESTRICT,
  status_history_json TEXT NOT NULL DEFAULT '[]' CHECK (status_history_json IS JSON),
  row_version INTEGER NOT NULL DEFAULT 1 CHECK (row_version >= 1),
  created_by TEXT NOT NULL REFERENCES phase6_users(id) ON DELETE RESTRICT,
  updated_by TEXT NOT NULL REFERENCES phase6_users(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, client_id)
    REFERENCES phase6_clients(organization_id, id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS phase6_obligations_org_client_period
  ON phase6_obligations (organization_id, client_id, tax_period, tax_type);
CREATE INDEX IF NOT EXISTS phase6_obligations_org_deadline_status
  ON phase6_obligations (organization_id, filing_deadline, filing_status, payment_deadline, payment_status);

CREATE TABLE IF NOT EXISTS phase6_documents (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  document_type TEXT NOT NULL,
  file_name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL CHECK (size_bytes >= 0),
  sha256 TEXT NOT NULL CHECK (length(sha256) = 64),
  object_key TEXT NOT NULL UNIQUE,
  tax_period TEXT,
  transaction_date TEXT,
  status TEXT NOT NULL DEFAULT 'pending-review' CHECK (status IN ('pending-review', 'reviewed', 'rejected', 'archived')),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_by TEXT NOT NULL REFERENCES phase6_users(id) ON DELETE RESTRICT,
  updated_by TEXT NOT NULL REFERENCES phase6_users(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, client_id)
    REFERENCES phase6_clients(organization_id, id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS phase6_documents_org_client_status
  ON phase6_documents (organization_id, client_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS phase6_compliance_documents (
  organization_id TEXT NOT NULL,
  obligation_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  added_by TEXT NOT NULL REFERENCES phase6_users(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL,
  PRIMARY KEY (organization_id, obligation_id, document_id),
  FOREIGN KEY (organization_id, obligation_id)
    REFERENCES phase6_obligations(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, document_id)
    REFERENCES phase6_documents(organization_id, id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS phase6_document_versions (
  organization_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version >= 1),
  object_key TEXT NOT NULL UNIQUE,
  file_name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL CHECK (size_bytes >= 0),
  sha256 TEXT NOT NULL CHECK (length(sha256) = 64),
  created_by TEXT NOT NULL REFERENCES phase6_users(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL,
  PRIMARY KEY (organization_id, document_id, version),
  FOREIGN KEY (organization_id, document_id)
    REFERENCES phase6_documents(organization_id, id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS phase6_document_reviews (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  reviewer_id TEXT NOT NULL REFERENCES phase6_users(id) ON DELETE RESTRICT,
  decision TEXT NOT NULL CHECK (decision IN ('reviewed', 'rejected', 'archived')),
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  FOREIGN KEY (organization_id, document_id)
    REFERENCES phase6_documents(organization_id, id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS phase6_document_reviews_document
  ON phase6_document_reviews (organization_id, document_id, created_at DESC);

CREATE TABLE IF NOT EXISTS phase6_analysis_proposals (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  tax_period TEXT,
  tax_head TEXT NOT NULL,
  field TEXT NOT NULL,
  proposed_json TEXT NOT NULL CHECK (proposed_json IS JSON),
  confirmed_json TEXT CHECK (confirmed_json IS NULL OR confirmed_json IS JSON),
  source_page INTEGER NOT NULL CHECK (source_page >= 1),
  confidence DOUBLE PRECISION NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  status TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'accepted', 'rejected', 'corrected')),
  created_by TEXT NOT NULL REFERENCES phase6_users(id) ON DELETE RESTRICT,
  reviewed_by TEXT REFERENCES phase6_users(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, client_id)
    REFERENCES phase6_clients(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, document_id)
    REFERENCES phase6_documents(organization_id, id) ON DELETE RESTRICT,
  CHECK ((status = 'proposed' AND confirmed_json IS NULL AND reviewed_by IS NULL) OR
         (status <> 'proposed' AND reviewed_by IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS phase6_analysis_proposals_org_client_status
  ON phase6_analysis_proposals (organization_id, client_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS phase6_scenarios (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  engagement_id TEXT,
  tax_period TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'under-review', 'archived')),
  scenario_json TEXT NOT NULL CHECK (scenario_json IS JSON),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_by TEXT NOT NULL REFERENCES phase6_users(id) ON DELETE RESTRICT,
  updated_by TEXT NOT NULL REFERENCES phase6_users(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, client_id)
    REFERENCES phase6_clients(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, engagement_id)
    REFERENCES phase6_engagements(organization_id, id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS phase6_scenarios_org_client_status
  ON phase6_scenarios (organization_id, client_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS phase6_scenario_documents (
  organization_id TEXT NOT NULL,
  scenario_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  added_by TEXT NOT NULL REFERENCES phase6_users(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL,
  PRIMARY KEY (organization_id, scenario_id, document_id),
  FOREIGN KEY (organization_id, scenario_id)
    REFERENCES phase6_scenarios(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, document_id)
    REFERENCES phase6_documents(organization_id, id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS phase6_scenario_versions (
  organization_id TEXT NOT NULL,
  scenario_id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version >= 1),
  scenario_json TEXT NOT NULL CHECK (scenario_json IS JSON),
  created_by TEXT NOT NULL REFERENCES phase6_users(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL,
  PRIMARY KEY (organization_id, scenario_id, version),
  FOREIGN KEY (organization_id, scenario_id)
    REFERENCES phase6_scenarios(organization_id, id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS phase6_reports (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  engagement_id TEXT,
  scenario_id TEXT,
  report_type TEXT NOT NULL,
  tax_period TEXT,
  status TEXT NOT NULL DEFAULT 'review-required' CHECK (status IN ('draft', 'review-required', 'approved', 'rejected')),
  report_json TEXT NOT NULL CHECK (report_json IS JSON),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_by TEXT NOT NULL REFERENCES phase6_users(id) ON DELETE RESTRICT,
  reviewed_by TEXT REFERENCES phase6_users(id) ON DELETE RESTRICT,
  review_notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, client_id)
    REFERENCES phase6_clients(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, engagement_id)
    REFERENCES phase6_engagements(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, scenario_id)
    REFERENCES phase6_scenarios(organization_id, id) ON DELETE RESTRICT,
  CHECK ((status IN ('draft', 'review-required') AND reviewed_by IS NULL) OR
         (status IN ('approved', 'rejected') AND reviewed_by IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS phase6_reports_org_client_status
  ON phase6_reports (organization_id, client_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS phase6_report_versions (
  organization_id TEXT NOT NULL,
  report_id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version >= 1),
  report_json TEXT NOT NULL CHECK (report_json IS JSON),
  status TEXT NOT NULL CHECK (status IN ('draft', 'review-required', 'approved', 'rejected')),
  created_by TEXT NOT NULL REFERENCES phase6_users(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL,
  PRIMARY KEY (organization_id, report_id, version),
  FOREIGN KEY (organization_id, report_id)
    REFERENCES phase6_reports(organization_id, id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS phase6_audit_log (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL REFERENCES phase6_organizations(id) ON DELETE RESTRICT,
  actor_user_id TEXT NOT NULL REFERENCES phase6_users(id) ON DELETE RESTRICT,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  details_json TEXT NOT NULL DEFAULT '{}' CHECK (details_json IS JSON),
  occurred_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS phase6_audit_org_resource_time
  ON phase6_audit_log (organization_id, resource_type, resource_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS phase6_audit_org_actor_time
  ON phase6_audit_log (organization_id, actor_user_id, occurred_at DESC);

CREATE OR REPLACE FUNCTION phase6_audit_log_immutable() RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'phase6 audit events are immutable';
END;
$$;

DROP TRIGGER IF EXISTS phase6_audit_log_no_update ON phase6_audit_log;
CREATE TRIGGER phase6_audit_log_no_update
  BEFORE UPDATE ON phase6_audit_log
  FOR EACH ROW EXECUTE FUNCTION phase6_audit_log_immutable();
DROP TRIGGER IF EXISTS phase6_audit_log_no_delete ON phase6_audit_log;
CREATE TRIGGER phase6_audit_log_no_delete
  BEFORE DELETE ON phase6_audit_log
  FOR EACH ROW EXECUTE FUNCTION phase6_audit_log_immutable();

-- ----------------------------------------------------------------------- 0006
CREATE TABLE IF NOT EXISTS phase10_usage_daily (
  organization_id TEXT NOT NULL REFERENCES phase6_organizations(id) ON DELETE RESTRICT,
  metric_date TEXT NOT NULL CHECK (
    metric_date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' AND to_char(metric_date::date, 'YYYY-MM-DD') = metric_date
  ),
  metric_name TEXT NOT NULL CHECK (metric_name IN (
    'calculator_opened',
    'calculation_completed',
    'advisor_request_completed',
    'report_generated',
    'api_error'
  )),
  event_count INTEGER NOT NULL DEFAULT 0 CHECK (event_count >= 0),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (organization_id, metric_date, metric_name)
);
CREATE INDEX IF NOT EXISTS phase10_usage_daily_org_date
  ON phase10_usage_daily (organization_id, metric_date DESC);

CREATE TABLE IF NOT EXISTS phase11_subscriptions (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL REFERENCES phase6_organizations(id) ON DELETE RESTRICT,
  plan_id TEXT NOT NULL CHECK (length(trim(plan_id)) BETWEEN 1 AND 80),
  status TEXT NOT NULL CHECK (status IN ('pending', 'active', 'past_due', 'canceled', 'expired', 'suspended')),
  provider TEXT,
  provider_subscription_id TEXT,
  currency TEXT CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$'),
  amount_minor BIGINT CHECK (amount_minor IS NULL OR amount_minor >= 0),
  period_start TEXT,
  period_end TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK ((period_start IS NULL AND period_end IS NULL) OR (
    period_start ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' AND to_char(period_start::date, 'YYYY-MM-DD') = period_start AND
    period_end ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' AND to_char(period_end::date, 'YYYY-MM-DD') = period_end AND
    period_start <= period_end
  )),
  UNIQUE (organization_id, id),
  UNIQUE (provider, provider_subscription_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS phase11_one_current_subscription_per_org
  ON phase11_subscriptions (organization_id)
  WHERE status IN ('pending', 'active', 'past_due');
CREATE INDEX IF NOT EXISTS phase11_subscriptions_org_status
  ON phase11_subscriptions (organization_id, status, period_end);

CREATE TABLE IF NOT EXISTS phase11_payment_events (
  provider TEXT NOT NULL,
  provider_event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload_sha256 TEXT NOT NULL CHECK (length(payload_sha256) = 64),
  processing_status TEXT NOT NULL CHECK (processing_status IN ('received', 'processed', 'rejected')),
  received_at TEXT NOT NULL,
  processed_at TEXT,
  PRIMARY KEY (provider, provider_event_id)
);
CREATE INDEX IF NOT EXISTS phase11_payment_events_status_received
  ON phase11_payment_events (processing_status, received_at);

CREATE TABLE IF NOT EXISTS phase11_invoices (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL,
  subscription_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_invoice_id TEXT NOT NULL,
  invoice_number TEXT NOT NULL,
  currency TEXT NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  amount_minor BIGINT NOT NULL CHECK (amount_minor >= 0),
  status TEXT NOT NULL CHECK (status IN ('draft', 'issued', 'paid', 'void', 'refunded')),
  issued_at TEXT,
  due_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (organization_id, subscription_id)
    REFERENCES phase11_subscriptions(organization_id, id) ON DELETE RESTRICT,
  UNIQUE (provider, provider_invoice_id),
  UNIQUE (organization_id, invoice_number)
);
CREATE INDEX IF NOT EXISTS phase11_invoices_org_created
  ON phase11_invoices (organization_id, created_at DESC);

-- ------------------------------------------------------------ access control
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'taxcomp_worker') THEN
    CREATE ROLE taxcomp_worker NOLOGIN;
  END IF;
END
$$;

ALTER ROLE taxcomp_worker SET search_path = taxcomp;
GRANT USAGE ON SCHEMA taxcomp TO taxcomp_worker;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA taxcomp TO taxcomp_worker;

-- Keep Supabase's API roles out of this schema even if someone later adds it
-- to the exposed-schemas list.
DO $$
DECLARE
  api_role TEXT;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      EXECUTE format('REVOKE ALL ON SCHEMA taxcomp FROM %I', api_role);
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA taxcomp FROM %I', api_role);
    END IF;
  END LOOP;
END
$$;

-- Row level security on every table; only the Worker role has a policy.
DO $$
DECLARE
  t RECORD;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'taxcomp' LOOP
    EXECUTE format('ALTER TABLE taxcomp.%I ENABLE ROW LEVEL SECURITY', t.tablename);
    EXECUTE format('DROP POLICY IF EXISTS taxcomp_worker_all ON taxcomp.%I', t.tablename);
    EXECUTE format(
      'CREATE POLICY taxcomp_worker_all ON taxcomp.%I TO taxcomp_worker USING (true) WITH CHECK (true)',
      t.tablename
    );
  END LOOP;
END
$$;
