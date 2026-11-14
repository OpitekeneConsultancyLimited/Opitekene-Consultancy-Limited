# Remediation implementation tracker

Programme: TaxComp audit remediation and production readiness (master prompt and Independent Readiness Assessment, 14 Nov 2026). Updated at the end of every phase. Finding details are in the [findings register](AUDIT_FINDINGS_REGISTER.md).

## Phase status

| Phase | Scope | Status | PR | Notes |
|---|---|---|---|---|
| 1 | Baseline: inventory, architecture, findings, security baseline | **Done** (14 Nov) | this PR | Revalidated live; 13 new findings (N1–N13) |
| 2a | Quick technical fixes: L1, L3, M5, H2 prevention, H3 tooling, N1, N4, N10, N13 | **Live** (14 Nov) | #35 | M5 still needs the Cloudflare token secrets |
| 2b | H1 verification register, two-person review, emergency withdrawal, legal classes, audit chain | **Live** (14 Nov) | #36 | [Completion report](PHASE_2B_COMPLETION_REPORT.md). Content verification awaits reviewers; conflict and deadline evidence packs are the next H1 task |
| 2c | M2 launch-gate register; M3 email guide; M4 interim auth controls; L2 CSP; L4 infrastructure note; N8 admin auth; N17 upload scanning | **Live** (14 Nov) | #38 | [Completion report](PHASE_2C_COMPLETION_REPORT.md). Owner: password-policy push, add administrators, scanner, SMTP |
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

## Phase 2b detail (PR #36)

| Item | Evidence | Production |
|---|---|---|
| Migration `20261114000100` (4 tables, flags, two-person trigger on 9 tables, append-only, hash chain) | `legal-register.test.mjs` 6/6; `supabase-postgres.test.mjs` | Applied after backup and dry run; 70 tables, RLS everywhere, 9 triggers |
| `register.mts` + `/api/challenge/review/register/*`; old routes return 202 | Reworked legislation, knowledge and challenge tests | Worker `64d54d96`; signed-out 401 |
| Withdrawal propagation incl. calculators (`legal-status.js`) and no-store caching | Unit + e2e (PAYE blocked, 410) | `/api/legislation/withdrawals` live, no-store |
| Legal classes | Unit | 40 pending / 8 proposed / 5 disputed amendments |
| Reviewer UI: Verification register tab | e2e incl. axe and 360 px | Site cache v50 |
| Full suite | 472/472 unit; e2e 138/138 (Edge locally, Chrome in CI) | — |

## Phase 2c detail

| Item | Change | Test evidence | Still needed |
|---|---|---|---|
| Migration `20261114000200` | `admin_users`, `security_events`, `launch_gates` (8, none approved), `launch_gate_events` (hash chain), `challenge_documents.scan_status` | `access-controls.test.mjs` 7/7; `supabase-postgres.test.mjs` (74 tables, grants) | Applied 14 Nov after backup (92,488 bytes) and dry run; 74 tables, RLS on all, 8 gates not started |
| N8 | `worker/admin-access.mjs`; every admin page signs in a named admin with two-step code; shared token logged and switchable | `access-controls.test.mjs`; e2e browser sign-in | Owner adds admins, then sets `ADMIN_SHARED_TOKEN_ENABLED = "false"` |
| M4 | Two-step sign-in in Account; required for reviewers (`aal2`); password policy and rate limits in `config.toml` | `challenge-api.test.mjs` M4; e2e | Owner: `npx supabase@2.121.0 config push` (2 changes, previewed) |
| M2 | Launch-gate register, `/admin/gates`, readiness needs flags and gates | `access-controls.test.mjs`, `commercial-governance.test.mjs`, e2e | People appointed; evidence |
| N17 | Challenge uploads scanned before storage, fail closed | `challenge-api.test.mjs` N17 ×2 | Scanner on Fly.io (uploads off until then) |
| L2 | Meta CSP on both pages, `scripts/site-csp.mjs --check` in CI | `site-csp.test.mjs`; e2e: 0 violations | Custom domain for header-based protection (management) |
| M3, L4 | `TRANSACTIONAL_EMAIL.md` and templates; `INFRASTRUCTURE_RECOMMENDATION.md` | `config diff` accepted the template keys | Provider and DNS; plan decision |
| Full suite | — | 490/490 unit; e2e 154/154 (Edge locally, Chrome in CI) | Worker `8360931b`; site SW v51; live CSP: 0 violations in a real browser |

## Decisions and actions waiting on management

1. Approve or decline the git history rewrite after the rights check (H2).
2. Save the backup passphrase and the DB connection string in a password manager with MFA, name a second custodian, then delete the two plaintext files (H3, N7).
3. Create the Cloudflare API token secrets and set the `production` environment reviewers (M5).
4. Approve a second free Supabase project for staging (N5).
5. Appoint qualified Ugandan tax reviewers, **at least two** with their own accounts, one of them a legal approver (H1, G2), and a privacy adviser (G1). Two-person review cannot work with the single reviewer account that exists today.
5a. Obtain the gazetted 2026 amendment Acts and commencement instruments (needed to resolve the 5 conflicts).
5b. Review the uncommitted local edit to `index.html` (N16) before it is published.
6. Set RTO/RPO targets (G6).
7. Decide on the Anthropic and Flutterwave activations (M1), only after Phases 5 and 6.
