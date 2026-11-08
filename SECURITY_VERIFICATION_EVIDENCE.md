# Security verification evidence

Date: 2026-11-07  
Scope: local `TaxComp-Prototype/` source and synthetic tests. This is not an independent security audit.

## Results

| Requirement | Status | Evidence / limitation |
|---|---|---|
| At-rest encryption | **BLOCKED** | No encryption of sensitive D1 columns or application-level envelope encryption was demonstrated. A readiness flag is not cryptographic evidence. Cloud-provider encryption and account configuration were not independently verified. |
| Key ownership, storage and rotation | **BLOCKED** | No key-management binding, key inventory, rotation procedure, or rotation test is configured. |
| CodeQL | **IN PROGRESS** | RC3 run 42452241675 found two high and two medium alerts; RC4 includes remediation and needs a fresh result before these are considered cleared. |
| Independent dependency/vulnerability scans | **BLOCKED** | `codeql`, `pip-audit`, `trivy`, `osv-scanner`, `snyk`, and `grype` are unavailable. No npm/Python dependency manifest or lockfile was found for the project. No independent scan was represented as passed. |
| Authentication/session/CSRF/lockout | **PASSED** | Local `worker/phase6-auth.test.mjs`: salted PBKDF2 hash verification, expiring hashed sessions, CSRF, password reset/revocation, lockout and role checks. Uses synthetic D1 fake; no penetration test. |
| Server-side RBAC and privilege boundaries | **PASSED** | Local `worker/phase6-api.test.mjs`: unauthenticated and bad-origin denial, CSRF-required mutation, admin-scoped governance, invitations/role assignment and synthetic workflow tests. |
| Tenant isolation | **PASSED** | Local API test confirms another organization cannot read a client; SQLite migration tests assert cross-organization foreign-key rejection and tenant-scoped uniqueness. Not run against Cloudflare D1. |
| Fail-closed operations gate | **PASSED** | Local `worker/deployment-security.test.mjs` and Phase 6 API tests confirm missing flags keep operations closed. Production flags remain unset. |
| Independent security approval / no-high-findings determination | **AWAITING EXTERNAL APPROVAL** | No independent assessment exists; no claim of zero critical/high vulnerabilities is made. |

## Test evidence

Focused command:

```text
node --test --test-reporter=spec worker/operations-analytics.test.mjs worker/phase6-auth.test.mjs worker/phase6-api.test.mjs worker/deployment-security.test.mjs subscription-management.test.js
```

Result: **28 passed, 0 failed** for focused security/API/deployment/analytics/legacy-auth/subscription tests. This run does not include dependency scanning, cryptographic certification, or a full penetration test.

## Required before any client-data operation

Candidate source is pinned by the release tag in `RELEASE_MANIFEST.json`; obtain provider/account evidence for encryption at rest; decide and verify key-management/rotation controls; confirm the RC4 CodeQL remediation run and run independent dependency/SAST scans; independently test authentication, privilege escalation and tenant isolation; resolve every critical/high finding; and record security/privacy approvals. Keep the existing Phase 6 gate closed until then.
