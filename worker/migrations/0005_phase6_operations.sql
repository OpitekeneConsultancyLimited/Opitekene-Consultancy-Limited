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
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  password_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('pending', 'active', 'inactive', 'locked')),
  failed_login_attempts INTEGER NOT NULL DEFAULT 0 CHECK (failed_login_attempts >= 0),
  locked_until TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

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
CREATE INDEX IF NOT EXISTS phase6_sessions_user_expiry
  ON phase6_sessions (user_id, expires_at, revoked_at);

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
  ON phase6_clients (organization_id, status, legal_business_name COLLATE NOCASE);

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
CREATE INDEX IF NOT EXISTS phase6_client_access_user
  ON phase6_client_access (organization_id, user_id, client_id);

CREATE TABLE IF NOT EXISTS phase6_client_tax_profiles (
  organization_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  schema_version INTEGER NOT NULL DEFAULT 1 CHECK (schema_version = 1),
  profile_json TEXT NOT NULL CHECK (json_valid(profile_json)),
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
  outstanding_amount REAL NOT NULL DEFAULT 0 CHECK (outstanding_amount >= 0),
  deadline_source_id TEXT REFERENCES legal_sources(source_id) ON DELETE RESTRICT,
  deadline_verification_status TEXT NOT NULL DEFAULT 'unverified' CHECK (deadline_verification_status IN ('unverified', 'verified')),
  responsible_user_id TEXT REFERENCES phase6_users(id) ON DELETE RESTRICT,
  status_history_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(status_history_json)),
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

CREATE TABLE IF NOT EXISTS phase6_documents (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  document_type TEXT NOT NULL,
  file_name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0),
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

CREATE TABLE IF NOT EXISTS phase6_document_versions (
  organization_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version >= 1),
  object_key TEXT NOT NULL UNIQUE,
  file_name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0),
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
  proposed_json TEXT NOT NULL CHECK (json_valid(proposed_json)),
  confirmed_json TEXT CHECK (confirmed_json IS NULL OR json_valid(confirmed_json)),
  source_page INTEGER NOT NULL CHECK (source_page >= 1),
  confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
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
  scenario_json TEXT NOT NULL CHECK (json_valid(scenario_json)),
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
  scenario_json TEXT NOT NULL CHECK (json_valid(scenario_json)),
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
  report_json TEXT NOT NULL CHECK (json_valid(report_json)),
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
  report_json TEXT NOT NULL CHECK (json_valid(report_json)),
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
  details_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(details_json)),
  occurred_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS phase6_audit_org_resource_time
  ON phase6_audit_log (organization_id, resource_type, resource_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS phase6_audit_org_actor_time
  ON phase6_audit_log (organization_id, actor_user_id, occurred_at DESC);

CREATE TRIGGER IF NOT EXISTS phase6_audit_log_no_update
BEFORE UPDATE ON phase6_audit_log
BEGIN
  SELECT RAISE(ABORT, 'phase6 audit events are immutable');
END;
CREATE TRIGGER IF NOT EXISTS phase6_audit_log_no_delete
BEFORE DELETE ON phase6_audit_log
BEGIN
  SELECT RAISE(ABORT, 'phase6 audit events are immutable');
END;
