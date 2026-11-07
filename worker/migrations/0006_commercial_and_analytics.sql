CREATE TABLE IF NOT EXISTS phase10_usage_daily (
  organization_id TEXT NOT NULL REFERENCES phase6_organizations(id) ON DELETE RESTRICT,
  metric_date TEXT NOT NULL CHECK (date(metric_date) = metric_date),
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
  currency TEXT CHECK (currency IS NULL OR currency GLOB '[A-Z][A-Z][A-Z]'),
  amount_minor INTEGER CHECK (amount_minor IS NULL OR amount_minor >= 0),
  period_start TEXT,
  period_end TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK ((period_start IS NULL AND period_end IS NULL) OR
         (date(period_start) = period_start AND date(period_end) = period_end AND period_start <= period_end)),
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
  currency TEXT NOT NULL CHECK (currency GLOB '[A-Z][A-Z][A-Z]'),
  amount_minor INTEGER NOT NULL CHECK (amount_minor >= 0),
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
