# Remediation implementation tracker

Programme: TaxComp audit remediation and production readiness (master prompt and Independent Readiness Assessment, 14 Nov 2026). Updated at the end of every phase. Finding details are in the [findings register](AUDIT_FINDINGS_REGISTER.md).

## Phase status

| Phase | Scope | Status | PR | Notes |
|---|---|---|---|---|
| 1 | Baseline: inventory, architecture, findings, security baseline | **Done** (14 Nov) | this PR | Revalidated live; 13 new findings (N1–N13) |
| 2a | Quick technical fixes: L1, L3, M5, H2 prevention, H3 tooling, N1, N4, N10, N13 | **Implemented** (14 Nov) | this PR | Live once merged and deployed; see below |
| 2b | H1 verification register, two-person review, withdrawal; conflict and deadline evidence packs | Next | — | Needs a lawyer to approve, not to build |
| 2c | M2 launch-gate register; M3 email guide; M4 interim auth controls; L2 CSP; L4 infrastructure note; N8 admin auth | Planned | — | |
| 3 | Privacy documents (G1); tenant-isolation tests (G4); API review; audit trail (G5); DR (G6, N6) | Planned | — | |
| 4 | Tax calculation inventory and test register (G2) | Planned | — | Expected answers must come from the tax reviewer |
| 5 | AI evaluation and security (G3) | Planned | — | |
| 6 | Payments and subscriptions (G7) | Planned | — | Needs Flutterwave sandbox keys |
| 7–11 | UX/UAT, operations documents, full test programme, documentation tidy-up, readiness gates | Planned | — | |

## Phase 2a detail (this PR)

| Item | Change | Test evidence | Still needed to close |
|---|---|---|---|
| L1 | Migration `20261114000000_function_hardening.sql` | `worker/function-hardening.test.mjs` passes, and fails without the migration | Apply with `db push` after merge; re-run the Supabase advisor |
| L3 | `.github/workflows/scheduled-audit.yml`, `scripts/cloud-audit.mjs` | Local run: all checks passed | First scheduled run on GitHub |
| M5 | `.github/workflows/deploy-worker.yml`, `wrangler.preview.toml` committed, [DEPLOYMENT_POLICY.md](DEPLOYMENT_POLICY.md) | Flags checked against wrangler 4.158.0 | Owner: Cloudflare token secrets and `production` environment reviewers; first CI deploy |
| N1 | `.github/workflows/ci.yml` (runs on every PR) | This PR is its first run | none |
| H2 prevention, N4 | `scripts/repo-content-guard.mjs`, `.gitignore`, ICPAU PDF removed from `main`, `scripts/git-history-cleanup.ps1` (not run) | Guard flags exactly the two third-party PDFs locally | Management: rights check and rewrite approval |
| H3, N7 | `scripts/protect-local-secrets.ps1`, `backup-daily.ps1` prefers DPAPI, `scripts/backup-restore-drill.(mjs\|ps1)` | Drill PASS 1,974/1,974 rows; backup via DPAPI path PASS | Owner: save both secrets in the password manager, delete the two plaintext files, custodian restore test |
| N10 | `scripts/dev.mjs` Windows path fix committed | none | none |
| N13 | `lawwatch.mts` records every run, 20 s timeout | `worker/lawwatch.test.mjs` (6/6) | Worker deploy |

## Decisions and actions waiting on management

1. Approve or decline the git history rewrite after the rights check (H2).
2. Save the backup passphrase and the DB connection string in a password manager with MFA, name a second custodian, then delete the two plaintext files (H3, N7).
3. Create the Cloudflare API token secrets and set the `production` environment reviewers (M5).
4. Approve a second free Supabase project for staging (N5).
5. Appoint a qualified Ugandan tax reviewer (H1, G2) and a privacy adviser (G1).
6. Set RTO/RPO targets (G6).
7. Decide on the Anthropic and Flutterwave activations (M1), only after Phases 5 and 6.
