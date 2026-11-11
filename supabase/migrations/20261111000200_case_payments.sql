-- Per-case purchases for Challenge an Assessment (owner decision 2026-11-11):
--   Reviewed pack  UGX 250,000 per case, paid online (Flutterwave).
--   Managed dispute  quoted per case; a reviewer grants it after payment
--   (existing entitlement route), so it has no plan row.
--
-- billing_plans.kind separates monthly plans (shown on the Account page) from
-- per-case plans (bought from inside a case). A verified per-case payment
-- grants the case a challenge_case_entitlements row instead of a subscription.
-- Idempotent.

SET search_path TO taxcomp;

ALTER TABLE billing_plans ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'subscription'
  CHECK (kind IN ('subscription', 'per_case'));

-- Deferred, like billing_subscriptions.organization_id: a backup restores
-- billing tables before challenge tables inside one transaction. A deleted
-- case keeps its payment record (case_id becomes NULL).
ALTER TABLE billing_payments ADD COLUMN IF NOT EXISTS case_id TEXT
  REFERENCES challenge_cases(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX IF NOT EXISTS billing_payments_case ON billing_payments (case_id);

INSERT INTO billing_plans (id, audience, name, description, amount, includes_premium_advisor, includes_firm_workspace, sort_order, kind, challenge_tier) VALUES
  ('challenge-reviewed-case', 'individual', 'Reviewed pack (one case)',
   'An Opitekene reviewer checks one assessment case and signs off the full response pack.', 250000, 0, 0, 10, 'per_case', 'reviewed')
ON CONFLICT (id) DO NOTHING;
