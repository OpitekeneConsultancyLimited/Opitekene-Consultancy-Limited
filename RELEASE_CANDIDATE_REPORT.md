# Release candidate report

Date: 2026-11-07  
Candidate: **source-controlled review candidate; not deployable or production-approved**

## Baseline and release boundary

- Production Pages/Worker source baseline: `6572ba8dbc693dc827bf3cb561f5656bbc41bc86`.
- Existing live Worker version: `7c86d391-0856-4b18-b238-8f8b6f8d5264`.
- Candidate branch: `release-candidate/2026-11-07-production-gate`.
- Candidate source commit `fe27d7231d7774da7448a252aa1599b83395ff2e` is a direct child of the production baseline; its tree is `05cfbc828ab7194e8d3454ee9301a9871ab93f12`. The final annotated tag is `taxcomp-2.0.0-rc.2` (unsigned); it supersedes the preliminary evidence tag `taxcomp-2.0.0-rc.1`.
- Read-only production D1 inventory reports migrations 0004–0006 pending.
- Candidate source is pushed only to the non-production branch. No production deployment, remote D1 migration, analytics activation, or billing activation occurred.
- The candidate tag is not signed and no protected-tag rule was verified. Independent source-to-build attestation remains outstanding.

## Candidate checks

| Gate | Status | Evidence |
|---|---|---|
| Existing JavaScript/Worker regression suite | **PASSED** | Final run and count recorded in `COMPLETE_TEST_RESULTS.md`. |
| Existing Python suite | **PASSED** | Final run and count recorded in `COMPLETE_TEST_RESULTS.md`. |
| Auth, RBAC, tenant tests | **PASSED** | Local synthetic API/auth tests and SQLite constraints; production D1 not tested. |
| Migration compatibility/restore | **PASSED** | Local SQLite application, constraints, backup/restore and integrity checks; D1 staging remains blocked. |
| Analytics privacy unit tests | **PASSED** | Allowlisted aggregate service; not wired to production sources, and flag remains false. |
| Payment sandbox | **BLOCKED** | No provider or sandbox credentials. |
| At-rest encryption / key rotation | **BLOCKED** | No cryptographic or provider configuration evidence. |
| CodeQL and independent scans | **BLOCKED** | CodeQL CLI unavailable; the workflow on this candidate does not run on this branch, and no candidate scan result exists. |
| Legal source approval | **BLOCKED** | 43 executable rules remain pending primary-source verification; register is not an approval. |
| Production readiness | **BLOCKED** | Multiple mandatory approvals and provider/staging tests remain outstanding. |

## Release controls

Keep the Phase 6 operations gate closed, analytics disabled, all Phase 11 launch approvals false, and billing inactive. Do not apply 0004–0006 remotely. Before any deployment, run security scans against the tagged revision, complete staging D1/restore and provider sandbox testing, obtain independent security/privacy/legal approvals, and explicitly authorize deployment.
