# Release candidate changelog

Base: production commit `6572ba8dbc693dc827bf3cb561f5656bbc41bc86`  
Date: 2026-11-07

## Candidate changes

- Added locally tested, disabled-by-default aggregate analytics ingestion and tenant-scoped expiry deletion contracts. No production event source, reporting API or scheduled retention task is enabled.
- Added allowlist, aggregation, minimization, disabled-mode and retention tests; extended SQLite integration coverage for migration 0006 and tenant-scoped retention.
- Added test coverage confirming all six subscription plan labels can receive explicitly configured entitlements without fixed prices.
- Removed duplicate object keys from `tax-advisory.js` and `worker/phase6-api.mjs`; the Worker dry-run then passed without duplicate-key warnings.
- Restored `tax-transaction.js` and its test exactly from the production baseline because both were missing in the local folder; this retains existing functionality and adds their tests to local full-suite results.
- Added the requested production gate, source integrity, security, encryption, key-rotation, migration, backup/DR, analytics, commercial, legal, regression and release evidence documents.
- Added `TAX_RULE_VERIFICATION_REGISTER.xlsx` with all 43 rules, their current code metadata, missing official evidence and pending-review status.
- Restored all production-baseline source/test files missing from the workspace before declaring the final 299-test Node result.

## Safety state

- No Phase 6 operational gate was enabled.
- Analytics remains disabled; live billing remains inactive.
- No production Pages or Worker deployment occurred.
- No remote D1 migration was applied.
- No tax-rule status or computation value was promoted.
- No security, legal, privacy or commercial approval was fabricated.

The final candidate commit and tag are authoritative only after they exist in the candidate branch and are recorded in `RELEASE_SOURCE_INTEGRITY.md`.
