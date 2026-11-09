# Paid accounts: setup and operations

People create a TaxComp account on the site (**Account** in the menu), pay a
monthly plan with MTN or Airtel Mobile Money or a card through Flutterwave, and
their access switches on as soon as the payment is verified.

| Plan | Price | Unlocks |
|---|---|---|
| Individual Premium (`individual-monthly`) | UGX 100,000 / month | AI tax advisor with live, source-linked web research in the chat |
| Firm (`firm-monthly`) | UGX 500,000 / month | A private practice workspace for the firm (the payer becomes its administrator and invites staff), plus Premium research |

Prices live in the database (`taxcomp.billing_plans`), not in code. To change
one, run in the Supabase SQL editor, for example:
`UPDATE taxcomp.billing_plans SET amount = 120000 WHERE id = 'individual-monthly';`

## How payment is protected
* Checkout happens on Flutterwave's own page. TaxComp never sees card numbers or PINs.
* Access is granted only after the Worker asks Flutterwave's API to confirm the
  transaction (status, reference, currency, amount). A webhook or redirect only
  triggers that check, so forged or replayed messages grant nothing.
* Each payment adds exactly one month: a repeated confirmation, a replayed
  webhook, an underpayment, the wrong currency, or a transaction belonging to a
  different checkout adds nothing (tested in `worker/billing.test.mjs`).
* Renewals stack: paying before the end adds a month to the current end date.
* Mobile Money cannot be debited automatically, so nothing is charged without
  the customer acting. They renew from their account.
* A Firm workspace is suspended (HTTP 402) while its subscription has lapsed,
  and restored immediately on renewal. The workspace itself also stays behind
  the Phase 6 release gate (`FINAL_PRODUCTION_BLOCKER_REGISTER.md`).

## One-time setup (owner)
1. **Flutterwave business account**: <https://dashboard.flutterwave.com>. Complete
   KYC for Opitekene Consultancy Limited and enable Mobile Money Uganda and cards.
2. **Webhook**: Settings → Webhooks.
   * URL: `https://taxcomp-uganda-chat.omaratomdenis1.workers.dev/api/billing/webhook`
   * Secret hash: a long random value you create (save it in your password manager).
3. **Worker secrets**: from `TaxComp-Prototype`, in your own terminal. Wrangler
   prompts for each value; paste it there, not in chat:
   ```powershell
   npx wrangler@4.158.0 secret put FLW_SECRET_KEY      # starts FLWSECK_TEST- (test) or FLWSECK- (live)
   npx wrangler@4.158.0 secret put FLW_WEBHOOK_HASH    # the secret hash from step 2
   ```
   Start with the **test** key: the account page then shows "test mode" and no
   real money moves. Switch to the live key when you are ready to charge.
4. **Supabase Auth** (Dashboard → Authentication):
   * URL Configuration: Site URL and Redirect URL
     `https://opitekeneconsultancylimited.github.io/Opitekene-Consultancy-Limited/`
   * Email sign-ups enabled, with email confirmation on (the default).
   * SMTP: Supabase's built-in sender allows only a few emails per hour, so add
     your own SMTP provider before launch, or sign-up confirmations will stall.
5. Test end to end with Flutterwave's test Mobile Money number, then switch to the live key.

## Operations
* See paying customers: `SELECT a.email, s.plan_id, s.status, s.current_period_end FROM taxcomp.billing_subscriptions s JOIN taxcomp.billing_accounts a USING (user_id) ORDER BY s.current_period_end DESC;`
* Payment history: `taxcomp.billing_payments` (pending / successful / failed, with Flutterwave transaction ids for reconciliation).
* Refunds are made in the Flutterwave dashboard. To end access early, set the
  subscription's `status = 'canceled'`.
* Turn online payment off: set `BILLING_ENABLED = "false"` in `wrangler.toml` and deploy.
