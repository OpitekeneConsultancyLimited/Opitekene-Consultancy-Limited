# Access controls: administrators, staff and sign-in security

Phase 2c, audit findings **N8** (shared admin token) and **M4** (leaked-password protection unavailable on the Free plan). Migration `20261114000200_access_controls_launch_gates.sql`; code in `worker/admin-access.mjs`, `worker/challenge/api.mts`, `account.js`.

## 1. Who can do what

| Role | How they are recorded | What they can reach | Sign-in required |
|---|---|---|---|
| Customer | Any confirmed Supabase account | Their own cases, profile, saved assessments | Password (two-step optional) |
| Reviewer (staff) | `taxcomp.challenge_reviewers` (`can_approve_law` for legal approvers) | Review queue, assigned cases, verification register, law admin | Password **and** two-step code (`aal2`) |
| Administrator | `taxcomp.admin_users`: `can_operate` (questions, legal-source drafts, EFRIS), `can_manage_gates`, `can_approve_gates` | `/admin/*` pages and APIs on the Worker | Password **and** two-step code (`aal2`) |

* A reviewer whose session lacks two-step verification is treated as an ordinary customer. They see a message telling them to turn it on, and the refusal is logged (`staff.mfa`).
* The Worker database role can **read** `admin_users` but cannot insert, update or delete rows. No application bug can create or promote an administrator.
* Launch gates are open only to named administrators. The shared token is always refused there.

## 2. Adding and removing an administrator

Only the database owner can do this, in the Supabase SQL editor or with `npx supabase@2.121.0 db query --linked`. The person must first create a TaxComp account and turn on two-step sign-in (Account → Two-step sign-in).

```sql
-- 1. Find the account (the person must already have signed up)
SELECT id, email, email_confirmed_at FROM auth.users WHERE lower(email) = lower('person@example.com');

-- 2. Add them (choose only the rights they need)
INSERT INTO taxcomp.admin_users (user_id, email, display_name, can_operate, can_manage_gates, can_approve_gates, added_by, added_at, note)
VALUES ('<id from step 1>', 'person@example.com', 'Full Name', 1, 0, 0, 'Name of the owner adding them', now()::text, 'Reason / role');

-- Remove (keep the row for the record)
UPDATE taxcomp.admin_users SET active = 0, deactivated_at = now()::text WHERE email = 'person@example.com';
```

Give `can_approve_gates` only to management. A gate approver must not also be the person collecting that gate's evidence; the system enforces this per gate.

## 3. Retiring the shared admin token (N8)

The old `ADMIN_DASHBOARD_TOKEN` still works while `ADMIN_SHARED_TOKEN_ENABLED = "true"` in `wrangler.toml`. It was left on so nobody is locked out of the admin pages on deployment day.

* Every use, successful or not, is logged in `taxcomp.security_events` (`admin.shared_token`).
* The token can never reach launch gates or `/admin/me`.
* Staging (`wrangler.preview.toml`) already has it switched off.

To retire it:

1. Add each administrator as in section 2. Each signs in once at `/admin` with their email, password and two-step code.
2. Set `ADMIN_SHARED_TOKEN_ENABLED = "false"` and deploy the Worker.
3. Delete the secret: `npx wrangler@4.158.0 secret delete ADMIN_DASHBOARD_TOKEN`.
4. Check: `SELECT occurred_at, outcome, details_json FROM taxcomp.security_events WHERE event_type = 'admin.shared_token' ORDER BY occurred_at DESC LIMIT 20;` shows only refusals from then on.

## 4. Two-step sign-in (MFA)

* **Method:** TOTP (authenticator app) through Supabase Auth MFA. It works on the Free plan and is already enabled on the project (confirmed with `config diff`, 14 Nov 2026).
* **Setting it up:** Account → Two-step sign-in → scan the QR code → enter the code. Unfinished setups are removed before a new one starts.
* **Signing in:** once it is on, the site asks for the code after the password and stays hidden until the code is accepted.
* **Password reset:** a reset link cannot bypass it. The code is asked for before the new-password screen.
* **Admin pages:** these are served by the Worker. They sign in directly against Supabase Auth (password, then challenge and verify) and keep the token in page memory only. Closing the tab signs the person out.
* **Lost phone:** the owner checks the person's identity out of band (phone call or in person), then removes the factor so they can enrol again:
  ```sql
  DELETE FROM auth.mfa_factors WHERE user_id = '<id>';  -- the person then re-enrols at once
  ```
  Record the reason in the person's `admin_users.note` or in the reviewer file.

## 5. Interim controls while leaked-password protection is unavailable (M4)

| Control | Status |
|---|---|
| Leaked-password check (HaveIBeenPwned) | **Not available** on the Free plan. It switches on with Pro (see [INFRASTRUCTURE_RECOMMENDATION.md](INFRASTRUCTURE_RECOMMENDATION.md)) |
| Password policy | 12+ characters with letters and digits. Enforced in the browser today. Server-side enforcement is declared in `supabase/config.toml` (`minimum_password_length = 12`, `password_requirements = "letters_digits"`) and **waits on the owner running `config push`**. The production value is still 6 characters. |
| Two-step sign-in | Required for staff and administrators; optional for customers |
| Brute-force protection | Supabase Auth rate limits per IP: 30 sign-ins/sign-ups and 30 code checks per 5 minutes; 150 token refreshes. Declared in config and matching production. Worker rate limiter on `/admin` (8 per minute per IP) and on the Challenge API |
| Session management | Access tokens last 1 hour; refresh tokens rotate. "Sign out on all devices" in Account. Admin pages keep the session in memory only. Session time-boxing and inactivity time-outs are Pro features. |
| Account recovery | Email reset link (needs custom SMTP for reliable delivery, M3). Two-step sign-in still applies. The lost-device procedure is in section 4. |
| Authentication event logging | Supabase Auth audit log (`auth.audit_log_entries`: sign-ins, failures, factor changes). The Worker writes `taxcomp.security_events`: admin sign-ins and refusals, shared-token use, staff two-step refusals, gate changes and upload scan refusals. It records no passwords, tokens, IP addresses or file contents, and the Worker can only append. |
| Security notification emails | Templates ready (password changed, email changed, two-step on or off). They switch on with custom SMTP (M3). |

Useful queries:

```sql
-- Refusals in the last 7 days
SELECT occurred_at, event_type, actor_email, details_json FROM taxcomp.security_events
 WHERE outcome <> 'allowed' AND occurred_at > to_char(now() - interval '7 days', 'YYYY-MM-DD') ORDER BY occurred_at DESC;
-- Supabase Auth sign-in activity
SELECT created_at, payload->>'action' AS action, payload->>'actor_username' AS who FROM auth.audit_log_entries ORDER BY created_at DESC LIMIT 50;
```

Retention: security events are kept for 12 months. After that, the database owner (not the Worker) may delete older rows. Nobody can edit them.
