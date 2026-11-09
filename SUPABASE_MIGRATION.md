# Moving TaxComp from Cloudflare D1 to Supabase

Status (2026-11-09): **all three phases are built, tested and provisioned in Supabase.**
They are not live until the remaining deploy steps below are done.

| Phase | What | State |
|---|---|---|
| 1. Database | Supabase Postgres via Hyperdrive, D1-compatible adapter | Built, tested, provisioned |
| 2. Storage | Client documents in private Supabase Storage bucket `phase6-documents` | Built, tested, bucket created, verified against live Storage |
| 3. Auth | Phase 6 sign-in, password reset and invitations via Supabase Auth | Built, tested, verified against the live signing keys |

### Remaining steps (need your permission or your hands)
Run them from `TaxComp-Prototype` in a terminal, in this order:

1. **Merge PR #2** into `main` (GitHub "Merge pull request"). This publishes the site changes.
2. **Give the Worker the Supabase service key.** This pipes the legacy `service_role`
   key (a JWT; Storage rejects the newer `sb_secret_` keys) straight into the
   secret, without displaying it:
   ```powershell
   $k = ((npx supabase@2.121.0 projects api-keys --project-ref xbooviddjkikcbccfcnw -o json | Out-String) -replace '(?s)^[^\[]*','' | ConvertFrom-Json | ? name -eq service_role).api_key
   $k | npx wrangler@4.158.0 secret put SUPABASE_SERVICE_ROLE_KEY
   $k | npx wrangler@4.158.0 secret put SUPABASE_SERVICE_ROLE_KEY -c wrangler.preview.toml
   Remove-Variable k
   ```
3. **Supabase Auth URL settings.** Dashboard → Authentication → URL Configuration:
   Site URL `https://opitekeneconsultancylimited.github.io/Opitekene-Consultancy-Limited/`,
   and add the same URL under Redirect URLs. Invitation and reset links only return there.
4. **Email.** Supabase's built-in email sender allows only a few emails per hour.
   Before inviting staff, set up custom SMTP (Authentication → Emails → SMTP Settings).
5. **Preview Worker:** `npx wrangler@4.158.0 deploy -c wrangler.preview.toml`, then check the chat still answers.
6. **Production Worker:** uncomment the `[[hyperdrive]]` block in `wrangler.toml`, then
   `npx wrangler@4.158.0 deploy`. Production D1 was checked on 2026-11-09: every
   data table was empty, so no data copy is needed.
7. **Rollback** if anything is wrong:
   `npx wrangler@4.158.0 rollback 7c86d391-0856-4b18-b238-8f8b6f8d5264`
   (the production version from 2026-11-07).

The Phase 6 practice workspace itself stays switched off until you set the
`taxcomp-phase6-api` meta tag in `index.html`, the `PHASE6_*` review flags, and
the `PHASE6_BOOTSTRAP_SECRET` secret, as the release gate requires.

### Provisioned on 2026-11-09
| Item | Value |
|---|---|
| Supabase project | `xbooviddjkikcbccfcnw` ("opitekenecons-lab's Project", eu-west-1, Postgres 17), org OPITEKENE CONSULTANCY LIMITED |
| Migrations applied | `…000000_taxcomp_schema`, `…000100_audit_logs_append_only`, `…000200_storage_and_supabase_auth` (via `supabase db push`) |
| Worker DB login | role `taxcomp_worker`. Its password and connection string are in `%USERPROFILE%\TaxComp-secrets\supabase-taxcomp-worker.txt` (outside OneDrive, owner-only). Move them to a password manager and delete the file. |
| Storage | private bucket `phase6-documents`, 10 MiB limit, `application/octet-stream` only, no access policies (only the Worker's service key can use it) |
| Auth | ES256 signing keys (JWKS). Browser config in `index.html`: `taxcomp-supabase-url` and `taxcomp-supabase-anon-key` (the publishable key, which is public by design) |
| Verified live | worker login via pooler; `search_path=taxcomp`; 32 tables; no `auth.*` access; audit tables INSERT/SELECT only; adapter round trip; real JWKS rejects a forged token; Storage upload, read, refused overwrite, blocked public URL, delete |
| Hyperdrive | `taxcomp-supabase`, id `1ec8106d082a4e309115ab818454fc8b` (in `wrangler.preview.toml`; commented out in `wrangler.toml`) |

### How Phase 3 sign-in works
* The browser (`phase6-app.js`) signs in with supabase-js 2.118.0, loaded only when
  the workspace is configured. It sends the Supabase access token as
  `Authorization: Bearer`, plus `X-Organization-Id` when the user belongs to several practices.
* The Worker verifies the token itself against the project's public signing keys
  (`worker/supabase-auth.mjs`). TaxComp's own tables still decide access:
  memberships, roles and client assignments, re-checked on every request, so
  deactivation is immediate.
* Passwords, lockout, resets and invitation emails are handled by Supabase Auth. The old
  `/auth/login` and `/auth/password-reset/*` endpoints answer 410 Gone, and there are no
  cookies or CSRF tokens. The first practice is created by a signed-in user with
  the bootstrap secret.
* Invitations: new emails get a Supabase invite; existing Supabase accounts are
  linked through `taxcomp.auth_user_id_by_email` (callable only by the Worker role).

Re-running migrations by hand: always run **all** files in `supabase/migrations` in
name order. Re-running only the first one re-grants privileges a later one revokes.
Prefer `npx supabase@2.121.0 db push --linked`, which tracks what has been applied.

## How it works

The Worker still runs on Cloudflare. All of its SQL goes through one binding
(`env.UNANSWERED_QUESTIONS`). When a `HYPERDRIVE` binding exists, `worker/db.mjs`
replaces that binding, per request, with a D1-compatible adapter over Supabase
Postgres. Without `HYPERDRIVE`, the Worker keeps using D1. **Rollback is removing
one binding and redeploying.**

| Piece | File |
|---|---|
| Postgres schema (all 34 tables, private `taxcomp` schema, RLS on) | `supabase/migrations/20261109000000_taxcomp_schema.sql` |
| D1-compatible adapter + SQLite→Postgres translation | `worker/db.mjs` |
| D1 → Supabase data copy | `scripts/d1-to-supabase.mjs` |
| Tests on a real Postgres engine (PGlite) | `worker/supabase-*.test.mjs` |

Never paste passwords or connection strings into chat, commits or tickets.
They go only into the Supabase SQL editor, `wrangler secret`/`hyperdrive` prompts,
or your password manager.

## One-time setup (you do this)

### 1. Create the Supabase project
1. https://supabase.com/dashboard → **New project**. Organization: Opitekene
   Consultancy Limited. Name: `taxcomp`. Region: the closest available to Uganda
   (e.g. Frankfurt `eu-central-1` or London `eu-west-2`).
2. Save the generated **database password** in your password manager.

### 2. Create the schema
1. Dashboard → **SQL Editor** → New query.
2. Paste the whole of `supabase/migrations/20261109000000_taxcomp_schema.sql` → **Run**.
   (Safe to run again; it is idempotent.)
3. Check: **Table Editor** → schema dropdown → `taxcomp` shows 34 tables.
4. Leave **Settings → API → Exposed schemas** as is. Do **not** add `taxcomp`.

### 3. Give the Worker its own login
In the SQL editor, run this with a new long random password (not the
project password). Save it in your password manager first:

```sql
ALTER ROLE taxcomp_worker WITH LOGIN PASSWORD 'paste-a-long-random-password-here';
```

The role can only read and write the `taxcomp` tables. It cannot change the
schema or read Supabase's own tables.

### 4. Build the connection string
Dashboard → **Connect** → **Session pooler** (port 5432; it works over IPv4).
Take that URI and change the user to `taxcomp_worker.<project-ref>` and the
password to the step 3 password:

```
postgresql://taxcomp_worker.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres
```

### 5. Create the Hyperdrive config
From `TaxComp-Prototype`, in a terminal (wrangler prompts for login if needed):

```powershell
npx wrangler@4.158.0 hyperdrive create taxcomp-supabase --connection-string="<the URI from step 4>"
```

Copy the returned `id`. Do not commit the connection string.

## Cut over (preview first, then production)

1. **Preview.** Add the binding to `wrangler.preview.toml`:
   ```toml
   compatibility_flags = ["nodejs_compat"]

   [[hyperdrive]]
   binding = "HYPERDRIVE"
   id = "<id from step 5>"
   ```
   `npx wrangler@4.158.0 deploy -c wrangler.preview.toml`, then try the chat,
   `/admin`, `/admin/efris` and the legal-source admin on the preview Worker.
2. **Copy the data.** Writes `supabase/d1-data-import.sql`, which is git-ignored and holds client data:
   ```powershell
   node scripts/d1-to-supabase.mjs
   ```
   Paste that file into the Supabase SQL editor → Run. **Delete the file afterwards.**
   It is safe to re-run, so you can do this again just before switching.
3. **Production.** In `wrangler.toml`, uncomment the `[[hyperdrive]]` block and set
   the `id`. Re-run step 2 to pick up anything written since, then
   `npx wrangler@4.158.0 deploy`.
4. **Verify.** Ask the chat a question it can't answer, check it appears at `/admin`
   and in Supabase (`taxcomp.unanswered_questions`).

## Rollback
Comment out the `[[hyperdrive]]` block in `wrangler.toml` and redeploy. The Worker
goes back to D1 immediately. D1 stays bound, unchanged, for at least two weeks after
cutover. Anything written to Supabase in the meantime is not copied back to D1.

## Notes and limits
* Phase 6 needs Supabase. Without the `HYPERDRIVE` binding it answers 503, because the
  legacy D1 schema cannot hold Supabase Auth identities. The chat, `/admin`, EFRIS
  and legal-source tools keep working on either database.
* `/admin`, `/admin/efris` and the legal-source admin still use the
  `ADMIN_DASHBOARD_TOKEN` operator token, not Supabase Auth.
* If a `PHASE6_DOCUMENTS` binding is configured, it takes precedence over Supabase Storage.
* Supabase backups: the free plan has no point-in-time recovery. Check your plan's
  backup and retention terms against blocker BCP-1 before storing client data.
* SQLite-only SQL handled by the adapter: `?` placeholders, camelCase aliases,
  `instr()`, `COLLATE NOCASE`, `date('now', ...)` and `changes()`, the last only
  inside `batch()`. New queries should use plain portable SQL.
