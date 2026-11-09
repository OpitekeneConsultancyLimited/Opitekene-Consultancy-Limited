# Moving TaxComp from Cloudflare D1 to Supabase

Status: **Phase 1 (database) built and tested. Not yet switched on in production.**
Phase 2 (document storage) and Phase 3 (Supabase Auth) come next.

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
* `phase6_users.password_hash`, `phase6_sessions` and `phase6_password_resets`
  remain for now. Phase 3 replaces them with Supabase Auth.
* Client documents still use the `PHASE6_DOCUMENTS` R2-style binding until Phase 2.
* Supabase backups: the free plan has no point-in-time recovery. Check your plan's
  backup and retention terms against blocker BCP-1 before storing client data.
* SQLite-only SQL handled by the adapter: `?` placeholders, camelCase aliases,
  `instr()`, `COLLATE NOCASE`, `date('now', ...)` and `changes()`, the last only
  inside `batch()`. New queries should use plain portable SQL.
