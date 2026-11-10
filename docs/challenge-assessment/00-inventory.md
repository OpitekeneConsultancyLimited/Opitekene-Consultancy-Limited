# Challenge an Assessment: Phase 0 inventory

Date: 2026-11-10. Repository: `OpitekeneConsultancyLimited/Opitekene-Consultancy-Limited`.

## Starting point

| Item | State |
|---|---|
| `main` (live) | Commit `cc45c823`: PR #9 redesign with the `#lp-*` signed-out landing page. |
| PR #10 `front-page-sample` (open) | The owner's own front-page design. It replaces the `#lp-*` landing with a public front page (header, hero, quick calculator, services, sign-in, contact). |
| PR #11 `foundations-law-register` (open) | An earlier law register and assessment module, never applied or merged. **Superseded by this work** and can be closed. |
| This work | Branch `feature/challenge-assessment`, built on PR #10 because PR #10 is the owner's latest explicit front-page decision (decision D-01). |

## The brief's Section 2 table against the repository

| Area | Brief says | Repository | Difference |
|---|---|---|---|
| Routing | Hash routes `#home`, `#tools`, `#knowledge`, `#assistant`, `#workspace`, `#account`, `#plans`, … | `site-router.js`. There are six views (`home`, `tools`, `knowledge`, `assistant`, `workspace`, `about`) and prefixed routes `#calc-*`, `#kb-*`, `#ws-*`. Any other `#id` scrolls to that element and shows its view; this is how `#account`, `#plans` and `#payments` work. | None of substance. `#challenge` is added as a seventh view. |
| Signed-out landing | `#auth-gate`, `#lp-features`, `#lp-how`, `#lp-plans`, `#lp-faq` | Live: as described. PR #10: `#auth-gate` holds the owner's front page (`#pc-calculator`, `#pc-services`, `#pc-online` with `#lp-signin`, `#pc-contact`). The other `#lp-*` ids no longer exist. | Challenge an Assessment is added to `#pc-services` and to the toolkit list in `#pc-online` (D-02). |
| Signed-in home | Hero with a live PAYE preview and four service cards | `#home`: hero with `#paye-preview`, then the `.feature-grid` of four cards. | As described. A fifth card is added. |
| Auth | Supabase project `xbooviddjkikcbccfcnw` | `account.js` (browser, publishable key in `<meta>`); `worker/supabase-auth.mjs` checks ES256 JWTs against the project's JWKS. | As described. |
| AI | Worker `taxcomp-uganda-chat` `/chat`, Claude with Gemini fallback | `worker/index.mjs` (`/chat`, `/advisor`, `/search`) and `worker/claude-research.mjs` (`claude-opus-5-5`, SDK 1.3.0). | As described. **Production lacks `ANTHROPIC_API_KEY`**, and the Gemini key's quota was exhausted on 2026-11-09, so neither provider is working in production today. |
| Payments | Flutterwave plans plus manual mobile money (`#payments`) | `worker/billing.mjs` with plans `individual-monthly` (UGX 100,000) and `firm-monthly` (UGX 500,000); `#payments` shows the manual Mobile Money details. | **Production lacks `FLW_SECRET_KEY` and `FLW_WEBHOOK_HASH`**, so online payment is off. Manual payments are not recorded as entitlements (D-08). |
| Knowledge centre | `#kb-laws`, `#kb-cases` | `#tax-laws` / `#other-heads` (`data-kb="laws"`) and `#tax-cases` (`data-kb="cases"`), reached with `#kb-laws` / `#kb-cases`. Content comes from `tax-advisory.js` and `case-law-registry.js` (static). | As described. The register feeds these pages through new panels. |
| Calculation modes | Simulation and filing-ready | The company, industrial-building and capital-gains calculators offer "Simulation (provisional estimate)" or "Filing-ready (verified rules only)"; filing-ready refuses to calculate without verified rules (`index.html`, `corporate-tax.js`, `industrial-building.js`, `capital-gains.js`). | As described. Deadlines from unapproved rules use the same "Provisional / simulation" treatment. |
| Workspace | `#ws-overview` … `#ws-settings`, authenticated API | `#workspace` panes, the Phase 6 firm workspace (`phase6-app.js`, `/api/phase6/*`) and `#account`. | As described. "My assessments" is added as a pane. |
| Checklists | Audit and health checklists saved in the browser | `audit-health.js`. | Left as they are. |
| Legal pages | `#privacy`, `#terms`, `#disclaimer` | Present in the `about` view. | Privacy text updated for uploads. |
| Branding | Theme `#0a1f3c`, mobile viewport, Apple meta tags | `<meta name="theme-color" content="#0a1f3c">` and Apple tags are present. **`manifest.webmanifest` has `theme_color: #176345`**. | The mismatch is recorded only; it is not in this task's scope. |
| Restructure | Root vs `/taxcomp/` | Still the root layout on GitHub Pages; no `/taxcomp/` folder. | All new paths are relative. |

## Tooling found

| Tool | State |
|---|---|
| Build | None for the site (static files). The Worker is bundled by `wrangler` (esbuild). |
| Tests | `node --test *.test.js worker/*.test.mjs` (376 tests on this base) and `python -m unittest`. Browser checks use `playwright-core` with Edge (scratch scripts). |
| Real Postgres in tests | `@electric-sql/pglite` with every migration applied (`worker/pglite-test-support.mjs`), plus a fake Supabase Auth and Storage API (`worker/supabase-test-fakes.mjs`). |
| Lint / format | None configured. Not added (D-12). |
| TypeScript | None before this work (D-03). |
| CI | `.github/workflows/release-candidate.yml` and `deploy-pages.yml` (Node 22, Python 3.12, `wrangler deploy --dry-run`). |
| Worker config | `wrangler.toml`: Hyperdrive `taxcomp-supabase`, `DATABASE_PROVIDER=supabase`, rate limiter `CHAT_LIMITER`. |
| Database | Supabase migrations in `supabase/migrations/`. Schema `taxcomp`, role `taxcomp_worker` (reached through Hyperdrive). |
| Storage | Private bucket `phase6-documents` with no client policies; the Worker reads and writes it with the service-role key (`worker/supabase-storage.mjs`). |
| PWA | `manifest.webmanifest`. `service-worker.js` (cache `taxcomp-app-v30`) caches same-origin GET requests only. The Worker is on another origin, so API responses are never cached. |
| Backups | `scripts/taxcomp-backup.mjs` refuses to run when a table is missing from `TABLE_ORDER` in `scripts/d1-to-supabase.mjs`. |

## Required fix 1: duplicated landing and home sections

On the live site (`main`), `#auth-gate` and `<main>` contain the same six blocks with different wording.

| Block | Signed-out landing (removed by PR #10) | Signed-in home (kept) |
|---|---|---|
| Hero | "Smarter Tax Management. Better Business Decisions." with a sign-in card | The same heading with the live PAYE preview |
| Features | "Your tax work, in plain numbers" (`#lp-features`) | "Everything for Uganda tax, in one place." |
| Steps | "Up and running in three steps" (`#lp-how`) | "Your estimate in three steps" (`#how-it-works`) |
| Plans | "Plans that grow with you" (`#lp-plans`) | "Plans that grow with you" (`#plans`) |
| FAQ | "Questions people ask" (`#lp-faq`) | "Questions people ask" (`#faq`) |
| Call to action | "Take control of your tax and financial management." | The same |

**Resolution.** PR #10, the owner's own design, already replaced the landing copies with a front page whose content does not repeat the home page: a quick calculator, services, the sign-in section and contact details. That PR is the base of this work, so the removal is in place. The fix commit on this branch adds a test that keeps it that way:
- No `<h2>` heading may appear both in `#auth-gate` and in the home view.
- Every `href="#…"` must resolve to an element id, a view, or a `calc-` / `kb-` / `ws-` route.
- `#auth-gate` keeps `#lp-signin` (the sign-in card), so links to the sign-in card still work.
- The removed ids `#lp-features`, `#lp-how`, `#lp-plans` and `#lp-faq` have no links pointing to them in the repository. An old bookmark that uses one shows the signed-out front page from the top.

Buttons: "Sign in" (`data-auth-mode="signin"`) scrolls to `#lp-signin` and opens the Sign in tab, and "Get started" opens Create account. "Install the app" lives on the signed-in home (`#install-app-hero`) and on `#install-guide`; the signed-out front page has no install button.

## Required fix 2: Row Level Security (summary; see `rls-audit.md`)

Production already has RLS on every table, no grants to `anon` or `authenticated`, no views, and one private bucket with no client policies. No real service-role key has ever been committed. Only the Auth setting "leaked password protection" is flagged.

## What is reused

- **Auth:** the JWT check (`createSupabaseTokenVerifier`) and the identity pattern from `billing.mjs`.
- **Database:** the D1-compatible adapter (`worker/db.mjs`), the PGlite test harness, `TABLE_ORDER` for backups, and the RLS / grant pattern from the billing migration.
- **Storage:** the `createSupabaseStorageBucket` helper with a new bucket name.
- **AI:** the `@anthropic-ai/sdk` 1.3.0 pin, the `claude-opus-5-5` model, the `ANTHROPIC_FETCH` test seam and the existing `GEMINI_API_KEY`.
- **Plans:** `billing_plans` and `billing_subscriptions` as the source of entitlements.
- **Site:** the router, `design.css` tokens and components, and the existing `#privacy` section.

## Conflicts with the brief (none stop the work; all are recorded in `decisions.md`)

1. **Base branch:** the brief describes the live `#lp-*` landing; the owner's newer PR #10 replaces it (D-01, D-02).
2. **Access model:** the brief assumes browsers query Supabase directly under RLS. TaxComp's browsers never query the database: every request goes through the Worker, which checks the JWT and filters by owner, and the API roles have no grants at all (D-04).
3. **Signed URLs:** document downloads go through the Worker instead of signed URLs (D-05).
4. **TypeScript:** the brief asks for a strict-TypeScript Worker, but the existing Worker is JavaScript. New code is TypeScript; existing files are unchanged (D-03).
5. **Statute chapters:** the brief gives the 2024 Revised Edition chapters (ITA Cap. 338, VAT Cap. 344, TPCA Cap. 343, TAT Act Cap. 345). They are seeded with `TODO_VERIFY`.
