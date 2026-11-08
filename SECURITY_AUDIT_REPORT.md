# Security audit report

Date: 2026-11-08  
Scope: `TaxComp-Prototype/` source, Phase 6 Worker/authentication, deployment configuration and current production gate.  
Status: **PARTIAL REVIEW — independent audit and automated scans pending**

## Controls observed

- Password credentials use salted PBKDF2-HMAC-SHA-256 (310,000 iterations) via Web Crypto; stored session/reset tokens are hashed.
- Sessions use expiring/revocable cookies with HttpOnly, Secure and SameSite attributes; mutations validate CSRF.
- Five-failure account lockout and role/permission checks exist.
- Phase 6 API validates exact CORS origin, request body size/content type, rate-limit binding, D1 binding and four fail-closed security flags.
- Database reads and mutations use parameterized SQL and organization-qualified records; composite foreign keys and audit immutability are present in schema.
- Worker responses include content-security policy, nosniff, frame denial and referrer policy in reviewed paths. Live Pages HEAD response included HSTS.
- Gemini/Admin keys are configured as Worker secrets; they are not stored in `wrangler.toml`.
- Phase 6 production API currently returns 503 because approval flags are unset.
- Candidate CodeQL run 42452241675 completed for RC3 and found two high and two medium alerts; candidate fixes are present in RC4 but not yet retested.

## Findings and blockers

| # | Severity | Finding | Status |
|---|---|---|---|
| 1 | HIGH | At-rest encryption strategy, application/key ownership, key rotation and evidence are not established for sensitive client records. | BLOCKED before client data |
| 2 | HIGH | Production D1 backup schedule, retention, integrity verification and real restore exercise are absent. | BLOCKED before client data |
| 3 | HIGH | Independent assessment and dependency scan remain unavailable. RC3 CodeQL found two high and two medium alerts; RC4 remediations await retest. | BLOCKED for security sign-off |
| 4 | MEDIUM | Phase 6 has no configured production bootstrap/email/R2/scanner service bindings and its API is disabled. | Intentionally fail-closed |
| 5 | MEDIUM | Phase 10 telemetry ingestion/retention/access flow is incomplete and analytics remains disabled. | Not active |
| 6 | MEDIUM | Billing endpoints/provider verification/replay protection and entitlement enforcement are not implemented. | Not active |

These are readiness findings, not a claim that the listed conditions are remotely exploitable. No complete penetration test or exhaustive vulnerability review was conducted; no “zero critical/high” assertion is made.

## Tests and scans

- Auth/API/migration-related tests included in complete suite: JS/Worker 301 passed, Python 17 passed.
- CodeQL: RC3 run completed with four findings; RC4 fixes require re-analysis.
- Dependabot: API reports alerts disabled for the repository.
- Code scanning: CodeQL RC3 run available; no clean RC4 result yet.
- At-rest encryption and production restore: not verified.

## Required actions

Keep all operations and analytics gates closed. Configure staging, run CodeQL and provider-appropriate dependency scanning, obtain independent penetration/security and privacy review, implement/verify encryption and key rotation, and demonstrate backup/restore before any client data or production operations are enabled.
