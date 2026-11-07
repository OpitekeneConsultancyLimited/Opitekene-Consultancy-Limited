# Analytics verification

Date: 2026-11-07  
Status: local privacy-minimized service tests added; production analytics remain disabled.

## Local implementation and test evidence

- `worker/operations-analytics.mjs` now provides a disabled-by-default D1 repository contract for allowlisted daily aggregate metrics.
- The write contract accepts only organization ID, an allowlisted metric name, and a positive count; it stores only organization/date/metric/count/timestamp. Extra client IDs or tax payload fields are ignored.
- The retention operation requires an explicit 1–3650 day window and deletes only rows older than the cutoff for the supplied organization.
- `worker/operations-analytics.test.mjs` tests successful aggregation arguments, rejection of non-allowlisted events, disabled-mode no-write behavior, and organization-scoped retention deletion.
- `test_phase6_migration.py` exercises SQLite aggregate upsert and tenant-scoped expiry deletion against the actual 0006 schema.
- These tests use a D1 fake. The repository is not wired to API/calculator/advisor event sources, a scheduled retention job, or an analytics administration endpoint.

## Requirement status

| Requirement | Status | Evidence / limitation |
|---|---|---|
| Event-ingestion service contract | **PASSED** | Allowlisted aggregate insert/upsert contract tested against a fake D1 binding. |
| Production event ingestion | **BLOCKED** | No event source integration or deployed D1 execution. |
| Data minimization | **PASSED** | Schema/service accepts only aggregate metric fields; test confirms client/tax payload does not enter bound values. This is local contract evidence, not production collection. |
| Retention/deletion logic | **PASSED** | Tenant-scoped expiry deletion is unit-tested. No approved retention period or scheduler exists, so production enforcement remains blocked. |
| Analytics RBAC | **BLOCKED** | No analytics ingestion/reporting API exists. Existing dashboard authorization is client/organization scoped, but this is not proof of a separate analytics-admin surface. |
| Isolation from confidential tax data | **PASSED** | No client IDs, tax facts, question text, or request bodies in the analytics schema. No end-to-end production data-flow test exists. |
| Independent enable/disable control | **PASSED** | `PHASE10_OPERATIONS_ANALYTICS_ENABLED` remains `"false"`; no production ingestion is enabled. |
| Privacy approval | **AWAITING EXTERNAL APPROVAL** | Define retention, role access, notice/consent and operational ownership before enabling. |
