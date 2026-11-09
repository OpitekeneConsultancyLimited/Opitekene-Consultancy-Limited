-- Paid accounts: monthly plans paid through Flutterwave (UGX).
--
-- * billing_plans: prices are data (change the amount here, not in code).
-- * billing_payments: one row per checkout (tx_ref). A row becomes 'successful'
--   only after the Worker re-verifies the transaction with Flutterwave's API
--   (amount, currency, reference); the provider transaction id is unique, so
--   replayed webhooks cannot credit twice.
-- * billing_subscriptions: one per user and plan. Each verified payment adds
--   one calendar month to current_period_end (from now, or from the current
--   end if still active). Mobile Money cannot be auto-debited, so renewal is a
--   new payment by the user; nothing is charged without their action.
-- * phase6_organizations.billing_subscription_id: firm workspaces created by a
--   subscriber are suspended (HTTP 402) while that subscription is not active.

SET search_path TO taxcomp;

CREATE TABLE IF NOT EXISTS billing_plans (
  id TEXT PRIMARY KEY NOT NULL CHECK (id ~ '^[a-z0-9-]{3,40}$'),
  audience TEXT NOT NULL CHECK (audience IN ('individual', 'firm')),
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 80),
  description TEXT NOT NULL DEFAULT '',
  amount BIGINT NOT NULL CHECK (amount > 0),          -- whole UGX (no minor unit)
  currency TEXT NOT NULL DEFAULT 'UGX' CHECK (currency ~ '^[A-Z]{3}$'),
  interval_months INTEGER NOT NULL DEFAULT 1 CHECK (interval_months BETWEEN 1 AND 12),
  includes_premium_advisor INTEGER NOT NULL DEFAULT 1 CHECK (includes_premium_advisor IN (0, 1)),
  includes_firm_workspace INTEGER NOT NULL DEFAULT 0 CHECK (includes_firm_workspace IN (0, 1)),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  sort_order INTEGER NOT NULL DEFAULT 0
);

INSERT INTO billing_plans (id, audience, name, description, amount, includes_premium_advisor, includes_firm_workspace, sort_order) VALUES
  ('individual-monthly', 'individual', 'Individual Premium',
   'AI tax advisor with live, source-linked web research.', 100000, 1, 0, 1),
  ('firm-monthly', 'firm', 'Firm',
   'Private practice workspace for your firm and staff, plus Premium research.', 500000, 1, 1, 2)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS billing_accounts (
  user_id TEXT PRIMARY KEY NOT NULL,           -- Supabase auth.users id
  email TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS billing_subscriptions (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES billing_accounts(user_id) ON DELETE RESTRICT,
  plan_id TEXT NOT NULL REFERENCES billing_plans(id) ON DELETE RESTRICT,
  status TEXT NOT NULL CHECK (status IN ('active', 'expired', 'canceled')),
  current_period_start TEXT NOT NULL,
  current_period_end TEXT NOT NULL,
  organization_id TEXT REFERENCES phase6_organizations(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (user_id, plan_id),
  UNIQUE (organization_id),
  CHECK (current_period_start < current_period_end)
);
CREATE INDEX IF NOT EXISTS billing_subscriptions_user ON billing_subscriptions (user_id, current_period_end DESC);

CREATE TABLE IF NOT EXISTS billing_payments (
  tx_ref TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES billing_accounts(user_id) ON DELETE RESTRICT,
  plan_id TEXT NOT NULL REFERENCES billing_plans(id) ON DELETE RESTRICT,
  amount BIGINT NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'successful', 'failed')),
  provider TEXT NOT NULL DEFAULT 'flutterwave',
  provider_transaction_id TEXT UNIQUE,
  provider_payment_type TEXT,
  created_at TEXT NOT NULL,
  verified_at TEXT,
  CHECK ((status = 'successful') = (provider_transaction_id IS NOT NULL AND verified_at IS NOT NULL) OR status = 'failed')
);
CREATE INDEX IF NOT EXISTS billing_payments_user_created ON billing_payments (user_id, created_at DESC);

-- Deferred so a backup can insert firms before their subscriptions inside one
-- transaction (the two tables reference each other).
ALTER TABLE phase6_organizations ADD COLUMN IF NOT EXISTS billing_subscription_id TEXT
  REFERENCES billing_subscriptions(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;

-- Access: the Worker may read plans but not change prices; payments and
-- subscriptions are never deleted by the Worker.
-- (Revoke first: re-running migration 000000 grants DML on ALL tables.)
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON taxcomp.billing_plans FROM taxcomp_worker;
REVOKE DELETE, TRUNCATE ON taxcomp.billing_accounts, taxcomp.billing_subscriptions, taxcomp.billing_payments FROM taxcomp_worker;
GRANT SELECT ON taxcomp.billing_plans TO taxcomp_worker;
GRANT SELECT, INSERT, UPDATE ON taxcomp.billing_accounts, taxcomp.billing_subscriptions, taxcomp.billing_payments TO taxcomp_worker;

DO $$
DECLARE
  t TEXT;
  api_role TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['billing_plans', 'billing_accounts', 'billing_subscriptions', 'billing_payments'] LOOP
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
