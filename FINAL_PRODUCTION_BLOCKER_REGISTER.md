# Final production blocker register

Date: 2026-11-07  
Overall: **NOT PRODUCTION-READY. Do not enable client-data operations or commercial billing.**

| ID | Requirement | Status | Evidence / closure criteria |
|---|---|---|---|
| SEC-1 | At-rest encryption and key management | **BLOCKED** | Obtain provider/account evidence, approved key ownership/rotation design and test evidence. The readiness flag alone is insufficient. |
| SEC-2 | CodeQL and independent vulnerability/dependency scan | **BLOCKED** | Run scans against the exact source-controlled candidate; resolve or disposition findings and preserve reports. Local scanners unavailable and no project lockfiles found. |
| SEC-3 | Independent security/privacy approval | **AWAITING EXTERNAL APPROVAL** | Perform independent security assessment, review tenant boundaries and data protection controls; record approvals. |
| BCP-1 | Automated backups and retention | **BLOCKED** | Configure approved provider schedule/retention and integrity monitoring. |
| BCP-2 | Isolated production-equivalent restore; RPO/RTO | **AWAITING EXTERNAL APPROVAL** | Define RPO/RTO with owner and demonstrate a D1 restore/reconciliation in isolated staging. Local SQLite restore is not enough. |
| DB-1 | Migrations 0004–0006 staging compatibility | **BLOCKED** | Provision distinct staging D1 and apply/test there. No remote migrations were applied. |
| DB-2 | D1 rollback/recovery and concurrency | **BLOCKED** | Demonstrate backup restore/forward-recovery, concurrent workloads, and cross-tenant access tests on staging. |
| ANA-1 | Analytics ingestion and retention | **BLOCKED** | Local allowlisted aggregate repository/retention contract tests pass, but no production event source or scheduled retention task is wired. |
| ANA-2 | Analytics RBAC and privacy approval | **BLOCKED** | Build/report access boundary, verify role controls and obtain privacy approval for retention/notice before enabling. Feature flag remains false. |
| PAY-1 | Provider selection, sandbox and lifecycle | **BLOCKED** | Supply provider and sandbox credentials; implement and test success/failure, authenticated/replayed callbacks, lifecycle and cancellation. |
| PAY-2 | Invoices/refunds and live billing approval | **BLOCKED** | Validate invoice requirements, complete sandbox refunds/cancellations, obtain commercial/legal authorization. No live billing is active. |
| LEG-1 | Uganda primary legal sources and provisions | **BLOCKED** | `LEGAL_REVIEW_REGISTER.md` lists all 43 current rule records; official source/provision/amendments and qualified reviewer are missing for every row. |
| LEG-2 | Tax-year and computation approval | **AWAITING EXTERNAL APPROVAL** | Qualified Ugandan reviewer must verify each rule's period, applicability, amendments, methodology and approval history. |
| REL-1 | Source-controlled release candidate | **BLOCKED** | Workspace has no Git metadata; create/review a source-controlled immutable revision and independently reproduce test/build evidence. |
| REL-2 | Production deployment and launch approval | **BLOCKED** | Keep deployment gates closed until all mandatory security, operations, legal and commercial criteria pass. |

## Closed locally (not production acceptance)

- Authentication/session/CSRF/RBAC test suite and synthetic cross-tenant API tests.
- SQLite migration constraints and local backup/restore with integrity/foreign-key checks.
- Privacy-minimized analytics service contract tests; analytics remain disabled.
- Configurable subscription helper and schema idempotency constraints; no payment provider or live transactions.

These local results do not override the blocked requirements above.
