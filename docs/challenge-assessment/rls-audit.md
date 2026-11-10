# Row Level Security audit (required fix 2)

**Project:** `xbooviddjkikcbccfcnw` (production). **Date:** 2026-11-10.

**Method:** read-only. `npx supabase@2.121.0 db advisors --linked --type all`, plus one catalogue query through `supabase db query --linked` over `pg_class`, `pg_policies`, `storage.buckets`, `information_schema.role_table_grants` and `pg_proc`. Nothing was changed in production.

## Findings before this work

| Area | Result |
|---|---|
| Tables in `public` | **None.** All application data is in the `taxcomp` schema. |
| `taxcomp` tables | 36 tables, **RLS enabled on all 36**. Each has one policy, `taxcomp_worker_all`, granted only to the Worker's database role `taxcomp_worker`. |
| Grants to `anon` / `authenticated` | **None** on any application table. The publishable key in the page can reach no TaxComp data through the Data API. |
| Views / materialised views | **None** in application schemas, so nothing can bypass RLS. |
| Storage buckets | One: `phase6-documents`, **private** (`public = false`), 10 MB limit, **no client storage policies**, so browsers cannot list or fetch objects. |
| `SECURITY DEFINER` functions | One: `taxcomp.auth_user_id_by_email`, with `search_path=""` and EXECUTE revoked from PUBLIC and granted only to `taxcomp_worker`. |
| Supabase security advisor | 1 warning: `auth_leaked_password_protection` (Leaked Password Protection disabled). This is an Auth setting, not RLS. On the Free plan it may not be available; the owner should turn it on in Dashboard → Authentication → Policies if the plan allows. |
| Performance advisor | 38 `unindexed_foreign_keys` and 25 `unused_index` (INFO). Not security issues; left for a later tidy-up. |

## Service-role key in code or git history

- **History:** I scanned all 118 commits on all 12 branches through the GitHub API, looking for Supabase `sb_secret_` keys and for tokens whose payload has `"role":"service_role"`. There were 6 matches, all deliberate **synthetic test fixtures**: the signature is literally `synthetic-test-signature`, and the secret reads `sb_secret_abcdefghij…`. They are in `worker/supabase-test-fakes.mjs`, `worker/deployment-security.test.mjs` and `worker/supabase-auth-storage.test.mjs`.
- **Large files:** six diffs were too large for the API to return. The current versions of those files contain no key, and GitHub secret scanning (enabled, with push protection, which covers the full history) has **0 alerts**.
- **Conclusion:** no real service-role key has been committed, so Checkpoint B (rotation) is not needed. The key exists only as a Worker secret, and it is **currently not set** in production.

## Changes in this work

Migration `20261110000000_challenge_assessment.sql` adds 13 tables. Each one has:
- RLS enabled, with the `taxcomp_worker_all` policy for the Worker role only;
- `REVOKE ALL` from `anon` and `authenticated`;
- the narrowest Worker grants:

| Table | Worker may |
|---|---|
| `challenge_audit_log` | SELECT, INSERT (append-only) |
| `challenge_reviewers`, `law_statutes`, `procedure_rules` | SELECT (owner-managed) |
| `procedure_rule_sets` | SELECT, UPDATE (approval by a legal approver, audited) |
| `law_provision_versions`, `tax_case_law`, `challenge_consents` | SELECT, INSERT, UPDATE (never DELETE) |
| Case tables (`challenge_cases`, `challenge_field_confirmations`, `challenge_documents`, `challenge_disputed_items`, `challenge_case_entitlements`) | SELECT, INSERT, UPDATE, DELETE (one-click deletion of a case) |

The migration also creates the bucket `assessment-documents`: **private**, 10 MB, with a list of allowed file types and **no client policies** (decision D-05).

The existing tables needed no RLS change, because the audit found nothing to fix.

## Tests

| Test | What it proves |
|---|---|
| `worker/supabase-postgres.test.mjs` | All 49 tables have RLS and the policy; the Worker role has the grants above; the audit logs are append-only. |
| `worker/challenge-api.test.mjs`, "the public API roles cannot read any TaxComp table, old or new" | It grants `anon` and `authenticated` USAGE on the schema (the worst-case misconfiguration). Both roles then still fail to SELECT or DELETE from new tables and from existing ones (`billing_accounts`, `phase6_clients`, `phase6_documents`, `phase6_audit_log`, `unanswered_questions`). Both buckets are private. |
| `worker/challenge-api.test.mjs`, "a second user cannot…" | A second signed-in user gets 404 on every case route (read, edit, delete, fields, items, read-notice, pack, document download). An unassigned reviewer also gets 404. |
| `worker/challenge-api.test.mjs`, "signed-out visitors…" | Without a token every route answers 401. A token signed with another key is refused. A foreign Origin gets 403. |
| Existing Phase 6 suites | Cross-organisation isolation for the existing workspace (`worker/phase6-api.test.mjs`, `worker/supabase-phase6-e2e.test.mjs`). |

## Applying to production (Checkpoint B)

The migration has been applied only to the in-process Postgres used by the tests (PGlite, all migrations in order, twice). **It has not been run against production.** The owner must approve it, then run:

```
npx supabase@2.121.0 db push --linked
```
