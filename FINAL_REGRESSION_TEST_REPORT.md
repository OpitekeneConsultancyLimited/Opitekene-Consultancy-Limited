# Final regression test report

Date: 2026-11-08  
Scope: full local project suites, including restored production-baseline transaction files.

## Results

| Suite | Command | Result |
|---|---|---|
| JavaScript and Worker | `node --test --test-reporter=spec *.test.js worker/*.test.mjs` | **301 passed, 0 failed** |
| Focused security/API/deployment/analytics/subscription | `node --test --test-reporter=spec authentication.test.js worker/operations-analytics.test.mjs worker/phase6-auth.test.mjs worker/phase6-api.test.mjs worker/deployment-security.test.mjs subscription-management.test.js` | **28 passed, 0 failed** |
| Python | `py -m unittest discover -s . -q` | **17 passed, 0 failed** |
| Migrations, tenant constraints, analytics and restore | `py -m unittest test_phase6_migration -v` | **9 passed, 0 failed** |
| Worker bundle | `npx wrangler deploy --dry-run` | **Passed**, no deployment |

The full Node suite includes the two missing `tax-transaction.js` and `tax-transaction.test.js` files restored byte-for-byte from production baseline commit `6572ba8dbc693dc827bf3cb561f5656bbc41bc86` after the initial local comparison found them absent.

## Coverage reflected by tests

Tax calculator/rule modules, transaction and multi-tax analysis, tax explanation/advisor/AI retrieval, reports and export paths, legal references, Phase 6 auth/session/RBAC, synthetic tenant isolation, client workflows, subscription entitlements, analytics aggregate/retention contract, and SQLite migrations/recovery.

## Not established by regression tests

No test suite proves legal correctness, at-rest encryption/key rotation, security scan cleanliness, production D1 compatibility, D1 backup/restore, production analytics RBAC, payment provider behavior, or independent approval. See `FINAL_PRODUCTION_BLOCKER_REGISTER.md`.
