# Transactional email (custom SMTP)

Audit finding **M3**. Today Supabase's built-in sender handles sign-up confirmations, password resets and invitations. It allows only a few emails per hour, is meant for testing, and sends from a Supabase address. Before inviting staff or opening sign-up widely, TaxComp needs its own sending domain.

**Nothing here has been activated.** No provider account exists and no credentials were created or invented.

## 1. Choose a provider (management)

Any SMTP provider with domain verification, bounce and complaint webhooks and a suppression list will do. Supabase documents Resend, Brevo, AWS SES, Postmark and SendGrid. Compare current prices on the providers' own pages; TaxComp's volume (sign-ups, resets, notices) fits the free or entry tiers of most of them. Record the provider as a data processor (privacy gate).

## 2. Sending domain and DNS

Use a subdomain of the company domain, for example `mail.<company-domain>`, so marketing email and transactional email keep separate reputations. Add the records the provider gives you. Their shape:

| Record | Type | Value (example only; use the provider's exact values) |
|---|---|---|
| SPF | TXT on the sending domain | `v=spf1 include:<provider-spf-domain> -all` |
| DKIM | TXT or CNAME, as the provider specifies | the provider's public key (`<selector>._domainkey…`) |
| DMARC | TXT at `_dmarc.<domain>` | start with `v=DMARC1; p=none; rua=mailto:<reports-address>`, move to `p=quarantine` after 2–4 clean weeks, then `p=reject` |
| Return-path / bounce | CNAME, if the provider uses one | as given |

Check with the provider's verification page, then by sending to a Gmail address and opening "Show original": SPF, DKIM and DMARC should all show **PASS**.

## 3. Connect Supabase Auth

In `supabase/config.toml`:
1. Fill in the `[auth.email.smtp]` block (host, port, user, sender address and name). The password is passed as an environment variable at push time and never written to the file; the exact commands are in the file.
2. Uncomment the template and notification blocks.
3. Preview with `npx supabase@2.121.0 config diff`, then run `config push`.

The CLI accepts all ten blocks. This was checked with a read-only `config diff` on 14 Nov 2026, which also showed that production's security notifications are currently **off**.

With custom SMTP set, raise the email rate limit (`[auth.rate_limit] email_sent`) to what the provider allows, for example 30 per hour.

## 4. Templates (in `supabase/templates/`)

| Email | File | Trigger |
|---|---|---|
| Confirm email address | `confirmation.html` | Sign-up |
| Invitation | `invite.html` | Firm admin or staff invites |
| Password reset | `recovery.html` | Forgot password (says two-step sign-in still applies) |
| Sign-in link | `magic_link.html` | Not used by the app today; branded in case it is switched on |
| Confirm new email | `email_change.html` | Email change |
| Re-authentication code | `reauthentication.html` | Sensitive changes |
| Password changed | `notification_password_changed.html` | Security notification |
| Email changed | `notification_email_changed.html` | Security notification |
| Two-step sign-in on | `notification_mfa_factor_enrolled.html` | Security notification |
| Two-step sign-in off | `notification_mfa_factor_unenrolled.html` | Security notification |

The templates use inline styles and contain no tracking pixels and no tax content. Every email says that staff never ask for passwords or codes.

## 5. Bounces, complaints and monitoring

* Turn on the provider's suppression list, so hard bounces and complaints are never mailed again.
* Send bounce and complaint webhooks or digests to the operations mailbox. Review them weekly; above 2% bounces or 0.1% complaints, stop and investigate.
* Keep DMARC aggregate reports (`rua`) and review them monthly.
* Watch the provider's delivery dashboard. Supabase Auth logs (Dashboard → Logs → Auth) show send failures.

## 6. Test plan (run after activation; record the results as operations-gate evidence)

| # | Workflow | Steps | Expected |
|---|---|---|---|
| 1 | Sign-up confirmation | Create an account with a new Gmail and a new Outlook address | Branded email within 1 minute; link confirms and signs in; SPF/DKIM/DMARC PASS |
| 2 | Password reset | Forgot password | Email arrives; link opens "Choose a new password"; an account with two-step sign-in is asked for the code first |
| 3 | Invitation | Firm admin invites a staff member | Invite arrives; accepting leads to password setup |
| 4 | Email change | Change the email in Supabase | Confirmation to the new address; "email changed" notice to the old one |
| 5 | Password changed | Change the password | "Password changed" notice |
| 6 | Two-step on or off | Enrol, then remove, the authenticator | Two notices |
| 7 | Rate limit | Request 6 resets in a row | Later requests refused politely; no email flood |
| 8 | Bounce | Sign up with a non-existent mailbox at your domain | Bounce recorded and the address suppressed |
| 9 | Spam placement | Tests 1–2 to Gmail, Outlook and Yahoo | Inbox, not spam |
