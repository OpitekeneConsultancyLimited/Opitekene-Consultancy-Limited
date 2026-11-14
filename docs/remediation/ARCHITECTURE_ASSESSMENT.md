# TaxComp architecture assessment

Assessed 14 November 2026 against the live system ([inventory](SYSTEM_INVENTORY.md)). It covers what is sound, what is weak, and the recommended direction. It does not replace an independent security assessment.

## What is sound

1. **One trusted server-side boundary.** The browser never talks to the database. Supabase's public roles have no access to the `taxcomp` schema, and every read and write passes through the Worker, which holds the only database role. One choke point is easier to review and test than policies spread across 66 tables.
2. **Fail-closed configuration.** Missing secrets disable features instead of opening them: uploads stay off without a scanner, admin routes return 503 without a strong token, checkout says "being set up" without Flutterwave keys, and the paid AI routes refuse without a plan.
3. **Legal-content honesty in the AI layer.** Retrieval gives the model only section headings (no statutory wording is held) with their verification status. The prompt forbids stating rates or conditions from a heading, `checkCitations` flags any section the database didn't supply, and the 2026 amendments are always described as unverified, with Bill and reported figures shown side by side.
4. **Governed knowledge.** Knowledge records are drafts until a reviewer verifies them, any edit sends a record back to draft, and users see only `verified` and `outdated` records.
5. **Rule metadata in the calculators.** `tax-rules.js` refuses to mark a rule verified without a source, reviewer, verification date and verified effective dates. Historical periods select rules by effective date.
6. **Strong automated testing.** Real Postgres (PGlite) runs in the tests with every migration applied, plus strict TypeScript, an e2e browser test and axe accessibility checks.
7. **Encrypted, tested backups.** AES-256-GCM files are refused on tampering, and today's restore drill restored 1,974 of 1,974 rows into an empty database ([report](BACKUP_RESTORE_TEST_REPORT.md)).

## Weaknesses

| # | Weakness | Why it matters | Direction |
|---|---|---|---|
| A1 | **Tenant isolation lives only in application code.** RLS policies are `taxcomp_worker: ALL USING true`. | One missing `WHERE owner = ?` in any of roughly 60 routes exposes another customer's data, and the database would not stop it. | Short term: automated cross-tenant tests for every route that reads customer data (Phase 3.2). Longer term: set `app.user_id` per request and add owner-scoped RLS for the customer tables (`challenge_*`, `phase6_*`, `saved_assessments`, `user_profiles`, `billing_*`), so the database enforces it too. |
| A2 | **Staging shares the production database.** | A staging test or migration can change production data; migrations cannot be rehearsed. | Create a second (free) Supabase project for staging; point `wrangler.preview.toml` at its own Hyperdrive config. Needs owner approval. |
| A3 | **Admin access is one shared token.** | No per-person accountability, no MFA, and a leaked token gives full admin access. | Move `/admin/*` behind Supabase Auth with a `challenge_reviewers`-style role table and MFA, or Cloudflare Access. Rotate the token in the meantime. |
| A4 | **Two databases are configured.** The legacy D1 binding is kept for rollback. | Confusing; the admin APIs still use the `UNANSWERED_QUESTIONS` name. | Retire D1 after the rollback window (Phase 10). |
| A5 | **Calculator rates are hard-coded in JavaScript,** while the legislation register lives in the database. | Two sources of truth for rates. The register can't drive calculations, and a rate change needs a code deploy. | Keep code-based rules (reviewable in PRs), but link each rule to its legislation record ID and fail a test when the linked record is withdrawn. See TAX_RULE_CHANGE_CONTROL (Phase 4). |
| A6 | **Backups cover the data schema only.** | Sign-in accounts (`auth.users`) and uploaded files would be lost in a total loss. | Add Supabase Auth export and Storage object backup; define RTO/RPO (Phase 3.5). |
| A7 | **Silent background failures.** The legislative watch recorded nothing when it failed (fixed in this PR). | Failures go unnoticed for days. | Record every run, alert from the cloud audit (done for the watch; extend to other jobs). |
| A8 | **Repository root clutter.** About 90 historical reports and old Python prototypes. | Contradictory documentation; risk of reviewers reading stale claims. | Move historical reports into `docs/history/` (Phase 10). |
