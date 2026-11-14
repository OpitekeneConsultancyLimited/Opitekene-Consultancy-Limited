# TaxComp system inventory

Baseline taken **14 November 2026** from the live systems and the `main` branch (commit `d538c28`), not from earlier reports. It's the reference for the [findings register](AUDIT_FINDINGS_REGISTER.md).

## 1. Environments

| Environment | What it is | Source | Data |
|---|---|---|---|
| Production site | GitHub Pages: corporate site at `/`, TaxComp app at `/taxcomp/` | `main`, built by `.github/workflows/deploy-pages.yml` from the allowlist in `scripts/build-pages.mjs` | none (static) |
| Production API | Cloudflare Worker `taxcomp-uganda-chat` (version `660a417b`, deployed 14 Nov 2026) | Until this PR: `wrangler deploy` from the owner's PC folder `TaxComp-Prototype` (not a git checkout). From this PR: `.github/workflows/deploy-worker.yml` | Supabase via Hyperdrive `taxcomp-supabase` |
| Staging API | Cloudflare Worker `taxcomp-prototype-preview-chat` (`wrangler.preview.toml`) | Manual until this PR | **The same production Supabase database** (finding N5) |
| Database | Supabase project (EU West, Postgres 17, Free plan), private schema `taxcomp`, role `taxcomp_worker` | `supabase/migrations/` (20 files with this PR) applied by `supabase db push --linked` | 66 tables; 2 sign-in accounts; 1 reviewer |
| Local development | `npm run dev` (local Supabase, needs Docker; untested) and `npm run dev:lite` (PGlite in memory) | working folder | local only |
| Backups | Windows task "TaxComp daily backup" 02:30 on the owner's PC; AES-256-GCM `.tcbak` files in `%USERPROFILE%\TaxComp-backups` plus a copy in OneDrive | `scripts/backup-daily.ps1`, `scripts/taxcomp-backup.mjs` | `taxcomp` schema only (not `auth.users`, not Storage objects: finding N6) |
| Monitoring | Windows task "TaxComp daily audit" 07:30 (`scripts/daily-audit.ps1`); from this PR also `.github/workflows/scheduled-audit.yml` (cloud, 07:30 and 19:30 Kampala) | repo | read-only |

The local folder matched `main` file for file except `scripts/dev.mjs`, which had an uncommitted Windows path fix (now included), and local-only files: e2e screenshots, the compendium PDF, the local Supabase copy and `wrangler.preview.toml` (now committed).

## 2. Components

| Component | Main files | Notes |
|---|---|---|
| Corporate site | `index.html`, `design.css`, `front-page.js` | Public. Contact form opens WhatsApp |
| TaxComp app (SPA) | `taxcomp/index.html`, `site-router.js`, `account.js`, `app.js`, `dashboard.js`, `tax-chat.js`, `challenge-app.js`, `phase6-app.js`, `kb-search.js`, `impact-assessment.js`, `international-tax.js`, `intl-tax-reasoning.js` | Everything behind a page-level sign-in gate (`#auth-gate`); service worker cache v49 |
| Calculators (run in the browser and in the Worker) | `tax-calculator.js`, `tax-rules.js`, `corporate-tax.js`, `capital-allowances.js`, `capital-gains.js`, `industrial-building.js`, `multi-tax-analysis.js`, `international-tax.js`, `tax-transaction.js` | Rules carry `approvalStatus`; PAYE FY 2026/27 and FY 2025/26 are `pending-primary-source-verification` |
| API Worker | `worker/index.mjs` (router, chat, advisor, search, admin, cron), `worker/billing.mjs`, `worker/phase6-api.mjs`, `worker/challenge/*.mts` (strict TypeScript), `worker/db.mjs` (D1-style adapter over Postgres) | One deployable bundle |
| Legislative engine | `worker/challenge/legislation.mts`, `law-index.json`, migrations `…000300`, `…000310`, `…000500` | 18 laws, 701 section headings (structure only, no wording), 41 schedules, 53 amendments; all unverified |
| Knowledge base | `worker/challenge/knowledge.mts`, migration `…000100` | 62 records, all `draft`; users see only `verified`/`outdated` |
| Challenge an Assessment | `worker/challenge/api.mts`, `store.mts`, `extract.mts`, `deadlines.mts`, `pack.mts`, `ai.mts` | Uploads to private bucket `assessment-documents`; AI reading needs `ANTHROPIC_API_KEY` (not set) |
| Legislative watch | `worker/challenge/lawwatch.mts`, cron `15 2 * * *` | Follows bills.parliament.ug. **Has failed silently since 12 Nov** (finding N13) |
| Billing | `worker/billing.mjs`, migrations `…000300`, `…000200` (case payments) | Flutterwave (keys not set); manual and WhatsApp payments recorded by approvers |
| Firm workspace (Phase 6) | `worker/phase6-api.mjs`, `phase6-auth.mjs`, bucket `phase6-documents` | Supabase Auth; documents need the malware scanner |
| Malware scanner | `scanner/` (ClamAV, Fly.io), `worker/malware-scanner.mjs` | Not deployed; `MALWARE_SCANNER_URL` empty, so uploads stay disabled (fails safe) |

## 3. API surface (Worker)

| Prefix | Module | Authentication |
|---|---|---|
| `POST /chat`, `/advisor`, `/search` | `index.mjs` | Origin allowlist + rate limit (8/min); `/advisor` web research needs a Premium plan |
| `/api/legislation`, `/api/legislation/*` | `legislation.mts` | Public read (origin-locked) |
| `POST /api/impact` | `impact.mts` | Public (origin-locked) |
| `/api/challenge/*` (22 routes: assessments, cases, consent, profile, case-law, knowledge, law, me, review/…) | `api.mts` | Supabase Auth JWT; `review/*` needs a `challenge_reviewers` row (approver flag for law/payments) |
| `/api/account`, `/api/account/firm`, `/api/billing/checkout`, `/confirm`, `/webhook` | `billing.mjs` | JWT; webhook verified by `FLW_WEBHOOK_HASH` |
| `/api/phase6/*` | `phase6-api.mjs` | Supabase Auth + organisation membership roles |
| `/admin`, `/admin/questions`, `/admin/legal-sources`, `/admin/efris` | `index.mjs` | One shared bearer token `ADMIN_DASHBOARD_TOKEN` (≥32 chars) + rate limit; fails closed |
| cron | `index.mjs` `scheduled` | Expired-question cleanup + legislative watch |

## 4. External services and secrets

Only secret names are recorded, never values.

| Service | Purpose | Secret(s) | State |
|---|---|---|---|
| Cloudflare Workers + Hyperdrive | API hosting, DB pooling | wrangler login on the owner's PC; `CLOUDFLARE_API_TOKEN` for CI (to be created) | Live |
| Supabase | Postgres, Auth, Storage | `SUPABASE_SERVICE_ROLE_KEY` (Worker); DB connection string (owner PC) | Live |
| GitHub | Code, Pages, CI, CodeQL, secret scanning (+ push protection) | `GITHUB_TOKEN` (CI) | Live; `main` unprotected; Dependabot security updates off |
| Google Gemini | Chat fallback, extraction backup | `GEMINI_API_KEY` | Set; free tier hit quota before |
| Anthropic | Chat/research primary, document reading | `ANTHROPIC_API_KEY` | **Not set** |
| Flutterwave | Card/mobile-money checkout | `FLW_SECRET_KEY`, `FLW_WEBHOOK_HASH` | **Not set** |
| ClamAV scanner (Fly.io) | Upload scanning | `MALWARE_SCANNER_TOKEN` | Not deployed |
| Parliament Bill Tracker | Legislative watch | none | Site currently closing connections |
| WhatsApp (link only) | Contact, manual payments | none | Live |
| Other Worker secrets present | `ADMIN_DASHBOARD_TOKEN`, `ASSET_WORKSPACE_PASSWORD` | | Set |

## 5. Database

- 66 tables in `taxcomp`, all with RLS enabled. One policy per table: `taxcomp_worker` may do everything (`USING true`). `anon` and `authenticated` have no `USAGE` on the schema, so they cannot read anything.
- Consequence: **tenant isolation is enforced only in the Worker's code**, not by row-level policies (see the [architecture assessment](ARCHITECTURE_ASSESSMENT.md)).
- `taxcomp_worker` grants: SELECT on 66 tables, INSERT on 61, UPDATE on 53, DELETE on 35; no BYPASSRLS, not superuser.
- Functions: `auth_user_id_by_email` (SECURITY DEFINER, `search_path=''`, worker only), `phase6_audit_log_immutable` (trigger), `legislation_log_change` (trigger, no fixed search_path: finding L1, fixed by migration `20261114000000`).
- Storage: two private buckets (`assessment-documents`: PDF/JPEG/PNG/WebP…, 10 MB; `phase6-documents`: 10 MB), no storage policies; accessed only by the Worker with the service-role key.

## 6. CI/CD (before this PR)

| Workflow | Trigger | Does |
|---|---|---|
| `codeql.yml` | PR, push | CodeQL JS/TS + Python |
| `deploy-pages.yml` | push to `main` | tests, tsc, Python, allowlist check, then Pages deploy |
| `release-candidate.yml` | `release-candidate/**` branches | full suite + e2e + Worker dry run |

Pull requests to `main` ran **only CodeQL** before merge (finding N1).

## 7. Tests

465 unit/integration tests (`node --test`, including PGlite Postgres suites), strict `tsc`, Python unittests, e2e `scripts/challenge-e2e.mjs` (Chrome + axe-core), DOM contract check. This PR adds 1 test file and extends the law-watch test: 466 tests.

## 8. Documentation

About 90 Markdown reports sit in the repository root (`PHASE5_TASK*_REPORT.md`, `FINAL_*`, `RELEASE_*` and others). Several of them describe states that are no longer current. `docs/remediation/` is now the current record, and older reports are historical (finding N11).
