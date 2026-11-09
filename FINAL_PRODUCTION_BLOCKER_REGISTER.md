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
| SEC-4 | Malware scanning for uploaded documents | **BUILT, AWAITING DEPLOY** | Self-hosted ClamAV chosen (documents stay on your own machine). Service `scanner/` plus Worker adapter `worker/malware-scanner.mjs`; tested (EICAR detected, infected uploads never stored, fails closed). Open: deploy it to Fly.io and set `MALWARE_SCANNER_URL` and the `MALWARE_SCANNER_TOKEN` secret (`scanner/README.md`). Uploads stay disabled until then. |
| BCP-1 | Automated backups and retention | **BUILT, AWAITING OWNER SETUP** | Owner decision 2026-11-09: stay on the Supabase Free plan (no restorable platform backups). Replacement: daily encrypted logical backups (`scripts/taxcomp-backup.mjs`, scheduled by `scripts/backup-setup.ps1`), 35-day retention, encrypted off-site copy in OneDrive. RPO up to 24 h. Open: the owner runs the setup script and saves the passphrase in a password manager. |
| BCP-2 | Isolated production-equivalent restore; RPO/RTO | **DRILL PASSED (empty dataset)** | 2026-11-09: encrypted backup of production restored into an isolated, freshly created Supabase project; `verify-restore` **MATCH** (`evidence/restore-drill-2026-11-09.json`); about 19 s plus project creation. Open: agree RPO/RTO targets, sign off, and repeat once production holds real data. |
| DB-1 | Migrations staging compatibility | **CLOSED** | All Supabase migrations pass on PostgreSQL 17 in CI on every PR, applied cleanly to production (history in sync) and replayed from scratch on an isolated project during the BCP-2 drill (identical schema fingerprint). D1 migrations 0004–0006 are superseded. |
| DB-2 | Rollback/recovery and concurrency | **PARTLY CLOSED** | Recovery proven by the BCP-2 drill; cross-tenant isolation and authorization tested end to end on Postgres; Worker rollback target `7c86d391`. Open: concurrent-load test on staging. |
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
