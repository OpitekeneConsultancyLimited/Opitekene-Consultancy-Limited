# Architecture audit

Audit date: 12 November 2026. Scope: the whole repository, GitHub Pages, the Cloudflare Worker, the Supabase database and the deployment workflows. The facts below were checked against the code and the live system on that date.

## 1. What the system is

| Layer | Technology | Where |
| --- | --- | --- |
| Web front end | Static HTML, CSS and plain JavaScript (UMD modules, no build step). Before this change it was one 178 KB `index.html` with hash-routed views. | GitHub Pages, `https://opitekeneconsultancylimited.github.io/Opitekene-Consultancy-Limited/` |
| API | One Cloudflare Worker, `taxcomp-uganda-chat` (`worker/index.mjs`, 1,733 lines, plus 38 modules; strict TypeScript `.mts` for newer modules). Daily cron at 02:15 UTC (legislative watch). Rate limiter of 8 requests per minute per IP. | `https://taxcomp-uganda-chat.omaratomdenis1.workers.dev` |
| Database | Supabase Postgres 17, private schema `taxcomp`, 66 tables, 19 migrations. Reached through Cloudflare Hyperdrive with a `?`-placeholder adapter (`worker/db.mjs`). RLS is on for every table with a Worker-only policy; anon and authenticated roles have no grants. | Supabase project `xbooviddjkikcbccfcnw` (EU) |
| Authentication | Supabase Auth (email and password). Tokens are verified in the Worker against the project's signing keys. | `account.js`, `worker/supabase-auth.mjs` |
| File storage | Supabase Storage, private buckets (`phase6-documents`, `assessment-documents`) | Worker only |
| AI | Anthropic Claude (main provider; the key is not yet set) and Google Gemini (backup; key set). Calls are made only from the Worker, never from the browser. | `worker/claude-research.mjs`, `worker/challenge/ai.mts` |
| Payments | Flutterwave (keys not yet set; manual Mobile Money fallback) | `worker/billing.mjs` |
| Tests | Node test runner: 465 unit and integration tests, including real Postgres via PGlite. Python unittest. Browser tests with Playwright and Edge, plus the axe accessibility engine (129 checks). | `*.test.js`, `worker/*.test.mjs`, `scripts/challenge-e2e.mjs` |
| CI/CD | `deploy-pages.yml` (tests, then Pages), `release-candidate.yml` (migrations replayed, backup and restore drill, Worker build), and CodeQL | `.github/workflows` |

## 2. Findings

### A. Working, verified live

- **Calculators** (tax-calculator.js): PAYE with FY 2025/26 and FY 2026/27 bands, individual, company, VAT, rental, withholding (22 categories), presumptive, customs, capital allowances, industrial buildings and capital gains, each with its working.
- **Tax Impact Assessment and guided answers:**
  - the impact engine runs deterministic scenarios (VAT threshold, PAYE, 2026 withholding) on the server;
  - guided answers cover 7 common questions;
  - chat follow-ups complete a calculation.
- **AI assistant** (`/advisor`, `/chat`): retrieves sections from the legislation database and the 2026 amendments register, checks citations, and has Simple and Professional modes.
- **Legislation:**
  - the legislation database has 18 laws, 701 sections and 41 schedules, with editions and history;
  - the 2026 amendments register holds 53 changes, each with Bill and reported figures;
  - there is a reviewer verification workflow and a public read API.
- **Knowledge records** (Primer notes, reviewer-entered case law), with a review workflow.
- **Challenge an Assessment:** deadlines, analysis, response pack, reviewer assignment and audit log.
- **Personalised dashboard:** onboarding, Simple and Professional modes, obligation discovery with progress, saved assessments and 2026 changes.
- **Accounts and plans:** sign-up and sign-in work. Checkout waits for the Flutterwave keys.
- **Backups:** encrypted, with a restore drill that passed.

### B. Partly implemented

- **Practice workspace (Phase 6).** Clients, obligations, documents and reports with tenant isolation are built and tested, but the API returns 503 by design until four review settings are signed off.
- **Payments.** Code and tests exist; the Flutterwave keys are not set.
- **AI provider.** The Anthropic key is not set, so live AI answers run on Gemini only.
- **Nightly backups.** The scheduled task exists but has not completed a scheduled run.
- **Malware scanner (ClamAV).** Built, not deployed, so Phase 6 uploads stay off.
- **Legislation content.** Structure only: no wording is held, and nothing is verified by a lawyer yet. The 2026 changes are unverified against the gazetted Acts.
- **Tax-year selection.** Only PAYE has it. The other calculators use FY 2026/27 only.

### C. Broken (found in this audit)

| Issue | Severity | Status |
| --- | --- | --- |
| **Pages published the whole repository.** That included a copyrighted law compendium PDF (filename marked "_unlocked"), the tax-rule verification spreadsheet, Worker source, migrations and internal documents, all downloadable from the public website. | Critical | **Fixed.** Pages now publishes only the 41 files the two pages reference (`scripts/build-pages.mjs`). The compendium is removed from the repository; see the security audit for its git history. |
| **`styles.css` was corrupted by PR #29.** A scripted edit replaced every `.` with `b`, which broke most of the original stylesheet. design.css covered most of the layout, so tests passed and it went live. | High | **Fixed.** Restored from the previous version, with the five intended colour changes re-applied (diff verified). |
| The tax-topic filter rejected questions about a TIN or returns, and retrieval cited unrelated Acts. | Medium | Fixed in PR #31. |

### D. Duplicated

- **Two stylesheets** (`styles.css` 65 KB and `design.css` 74 KB) with overlapping rules from successive redesigns.
- **Two sign-in implementations:** `phase6-app.js` (workspace) and `account.js` (site). Both use Supabase Auth.
- **Legacy D1 binding** (`[[d1_databases]]`) and `worker/migrations` remain, although production uses Supabase through Hyperdrive. The binding name `UNANSWERED_QUESTIONS` is reused for the Postgres adapter.
- **Python prototypes at the repository root** (`tax law.py`, `get_taxcomp.py` and others) duplicate logic now in JavaScript. They are tested by CI but not used by the site.

### E. Insecure

See `SECURITY_AUDIT.md`. In short:

- the publication of the whole repository is fixed;
- the compendium remains in public git history;
- there is no Content Security Policy, which GitHub Pages cannot send as a header;
- there is no MFA for reviewer and approver accounts.

### F. Unnecessarily complicated

- **Many globals, no build step.** The app page loads 29 scripts in a fixed order, and each script publishes a global.
- **`worker/index.mjs` handles too much in one 1,733-line file:** chat, advisor, search, admin, impact routing and evidence building.
- **Phase flags** (`PHASE6_*`, `PHASE10_*`, `PHASE11_*`) gate unfinished features. They are correct, but there are many of them.

### G. To build

See `IMPLEMENTATION_ROADMAP.md`.

## 3. Changes made with this audit

The corporate site and TaxComp are now separate (see `TARGET_ARCHITECTURE.md`):

- **Corporate site, `/`:** Home, About Us, Services (8), Training, Insights, TaxComp and Contact Us, plus public privacy and terms. It is public, has no sign-in wall, and loads only the quick-estimate scripts.
- **TaxComp app, `/taxcomp/`:** its own sign-in screen and its own navigation: Dashboard, Ask TaxComp, Tax Tools, Law & Knowledge, Compliance and Workspace.
- **Backward compatibility:** old links (for example `/#workspace`), Supabase sign-in and password links (`#access_token=…`) and Flutterwave returns (`?tx_ref=…`) are forwarded from `/` to `/taxcomp/`. Payment returns now go to `/taxcomp/` directly.
- **Installed app:** the service worker stays at the root so it covers both pages. The installed app now opens `/taxcomp/`.
