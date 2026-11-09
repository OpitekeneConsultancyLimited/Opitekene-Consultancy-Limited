# Final production blocker register

Date: 2026-11-07, updated 2026-11-09 for the move to Supabase
Overall: **NOT PRODUCTION-READY for client data. Do not enable client-data operations or commercial billing.**

The Phase 6 practice workspace opens only when the four `PHASE6_*` flags below are
`"true"`. Each flag states that the linked blockers are closed with evidence and
sign-off; set it only when that is true. The `PHASE11_*` flags do not open the
workspace; they cover a paid public launch.

| Flag | Requires |
|---|---|
| `PHASE6_DATA_AT_REST_REVIEWED` | SEC-1 |
| `PHASE6_BACKUP_RESTORE_VERIFIED` | BCP-1, BCP-2, DB-2 |
| `PHASE6_SECURITY_REVIEWED` | SEC-2, SEC-3 (and SEC-4 for document uploads) |
| `PHASE6_OPERATIONS_ENABLED` | the three above, plus REL-2 approval |

| ID | Requirement | Status | Evidence / closure criteria |
|---|---|---|---|
| SEC-1 | At-rest encryption and key management | **PARTLY EVIDENCED** | Verified 2026-11-09: database SSL enforcement **enabled** (a non-TLS login is refused: `ESSLREQUIRED`); the Worker uses TLS through Hyperdrive; the `taxcomp` schema is not exposed by the Data API; RLS is on all 32 tables; the `taxcomp_worker` role is least-privilege (no `auth.*`, no DDL, audit tables INSERT/SELECT only); documents sit in a private bucket with no public URL (verified). **Open:** obtain Supabase's at-rest encryption and key-management evidence (provider-managed keys; SOC 2 report or trust-center documentation) and record acceptance; move the Worker DB password from `%USERPROFILE%\TaxComp-secrets` into a password manager. |
| SEC-2 | CodeQL and independent vulnerability/dependency scan | **CodeQL PASSED / external scan BLOCKED** | CodeQL passes on every PR, including the Supabase changes (PR #2, PR #3). `package-lock.json` now exists, so a dependency scanner can run, but no independent scan has been run yet. |
| SEC-3 | Independent security/privacy approval | **AWAITING EXTERNAL APPROVAL** | Scope now includes Supabase Auth (local ES256 JWT verification, membership re-check per request, no cookies or CSRF), Storage and Hyperdrive. The reviewer records their approval here. |
| SEC-4 | Malware scanning for uploaded documents | **BLOCKED** | Uploads return 503 until a `PHASE6_MALWARE_SCANNER` service binding exists. Choose a provider whose data handling is acceptable for client tax documents. |
| BCP-1 | Automated backups and retention | **BLOCKED** | 2026-11-09: WAL-G enabled, PITR off, no backups listed (project created that day). Confirm the plan (the Free plan has no restorable daily backups), enable the needed backups/PITR, and record retention. See `BACKUP_RESTORE_DRILL.md`. |
| BCP-2 | Isolated production-equivalent restore; RPO/RTO | **READY TO EXECUTE** | Procedure: `BACKUP_RESTORE_DRILL.md`. Verifier: `scripts/verify-restore.mjs` (tested; run live 2026-11-09). Open: agree RPO/RTO, restore into a separate project, get a MATCH verdict, and sign off. |
| DB-1 | Migrations staging compatibility | **PARTLY CLOSED** | All three Supabase migrations pass on PostgreSQL 17 (PGlite) in CI on every PR and were applied to production Supabase on 2026-11-09 (`supabase db push`, history in sync). D1 migrations 0004–0006 are superseded. Open: replay them on the drill project from BCP-2 to evidence a staging run. |
| DB-2 | Rollback/recovery and concurrency | **PARTLY CLOSED** | Cross-tenant isolation and authorization are tested end to end on Postgres (`worker/phase6-api.test.mjs`, `worker/supabase-phase6-e2e.test.mjs`). Worker rollback target: `7c86d391`. Open: recovery via the BCP-2 drill. |
| ANA-1 | Analytics ingestion and retention | **BLOCKED** | Unchanged: no production event source or scheduled retention task; flag false. |
| ANA-2 | Analytics RBAC and privacy approval | **BLOCKED** | Unchanged. |
| PAY-1 | Provider selection, sandbox and lifecycle | **BLOCKED** | Unchanged; no billing implemented. |
| PAY-2 | Invoices/refunds and live billing approval | **BLOCKED** | Unchanged. |
| LEG-1 | Uganda primary legal sources and provisions | **BLOCKED** | Unchanged: `LEGAL_REVIEW_REGISTER.md`, 43 rules lacking an official source and a qualified reviewer. |
| LEG-2 | Tax-year and computation approval | **AWAITING EXTERNAL APPROVAL** | Unchanged. |
| AUTH-1 | Supabase Auth configuration | **OPEN (owner action)** | Set Site URL and Redirect URL to the site; configure custom SMTP before inviting staff; set `SUPABASE_SERVICE_ROLE_KEY` (service_role JWT) and `PHASE6_BOOTSTRAP_SECRET` as Worker secrets. See `SUPABASE_MIGRATION.md`. |
| REL-1 | Source-controlled release candidate | **PASSED WITH LIMITATIONS** | Unchanged; Supabase work shipped through reviewed PRs #2/#3 with CI and CodeQL. |
| REL-2 | Production deployment and launch approval | **PARTLY CLOSED** | The infrastructure move to Supabase is deployed (Worker `c787b592`, 2026-11-09) with the Phase 6 workspace still gated off. Launch approval for client-data operations remains blocked on the items above. |

## Closed locally (not production acceptance)

- Authorization/RBAC and synthetic cross-tenant API tests, now on real Postgres with Supabase Auth tokens (322+ tests).
- SQLite migration constraints and local backup/restore with integrity/foreign-key checks (legacy D1 path).
- Privacy-minimized analytics service contract tests; analytics remain disabled.
- Configurable subscription helper and schema idempotency constraints; no payment provider or live transactions.

These local results do not override the blocked requirements above.
