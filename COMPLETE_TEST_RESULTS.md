# Complete test results

Date: 2026-11-07  
Project: `TaxComp-Prototype/`

## Final complete local suites

| Suite | Command | Result |
|---|---|---|
| Application and Worker JavaScript | `node --test --test-reporter=spec *.test.js worker/*.test.mjs` | 299 passed, 0 failed |
| Python | `py -m unittest discover -s . -q` | 16 passed, 0 failed |
| Targeted security/deployment/subscription/API | Node selectors for deployment, analytics, governance, auth/API and subscriptions | 26 passed, 0 failed |
| Migration / restore / tenant constraints | `py -m unittest test_phase6_migration -v` | 9 passed, 0 failed |
| Changed-module syntax | `node --check` on Phase 6 API/auth, security gate, analytics, governance and subscription module | Passed |
| Cloudflare Worker bundle | `npx wrangler deploy --dry-run` | Passed; no deployment performed |

Test coverage included tax calculators, rules, international-tax and multi-tax analysis, advisor/clarification/report workflows, Phase 6 auth/API and synthetic end-to-end flows, source registry, migrations, local backup/restore with integrity checks, analytics ingestion/retention contract, and Phase 8–12 foundations.

## Limits of this evidence

- Tests are local and use synthetic data/fakes or SQLite; they do not prove tax-law accuracy, Cloudflare D1 staging behavior, encryption at rest, performance under concurrency, production backup restoration, wired analytics, or payment-provider behavior.
- No production database migrations were run.
- The initial Worker dry run reported duplicate object keys (one in `tax-advisory.js`, one in `worker/phase6-api.mjs`); both duplicates were removed without changing behavior. The final dry run passed with those warnings cleared; Wrangler still reports its existing experimental `unsafe` configuration warning.
- No payment sandbox tests were possible; no provider is configured.
- The CodeQL workflow is present on the non-production candidate branch but has not run: it is not on the default branch and its push trigger is restricted to `main`. CodeQL and independent scanner CLIs are unavailable, and no project dependency manifest/lockfile was found.
- The candidate is not deployed. Production `main` remains at `6572ba8dbc693dc827bf3cb561f5656bbc41bc86`; no production deployment occurred.
