# Backup and restore evidence

Date: 2026-11-07  
Status: local SQLite recovery test passed; production backup and disaster recovery remain blocked.

## Evidence performed

- Tests use disposable in-memory SQLite databases and synthetic organization/client rows.
- A local SQLite backup was taken, a client row was removed from the working database, and restore to a separate database recovered the row.
- A pre-0006 schema snapshot was restored after applying 0006 to the test database; the recovered schema excludes the new 0006 tables and preserves seeded synthetic data.
- Restore checks include `PRAGMA integrity_check` and `PRAGMA foreign_key_check`.
- The test fixture also covers cross-organization constraints. No production data was read or modified.

Reference: `test_phase6_migration.py`, tests `test_schema_backup_and_restore_preserves_phase6_records` and `test_restore_to_pre_migration_backup_recovers_prior_schema`.

## Requirement status

| Requirement | Status | Evidence / limitation |
|---|---|---|
| Automated production backup configuration | **BLOCKED** | No D1 backup schedule/provider configuration was available or changed. |
| Retention policy and enforcement | **BLOCKED** | No approved D1 backup retention value or cleanup job is configured. |
| Backup integrity | **PASSED** | Local SQLite restored snapshot passes integrity and foreign-key checks. This does not verify a Cloudflare D1 export or remote backup. |
| Full isolated restore | **PASSED** | Restored the synthetic SQLite snapshot into a separate in-memory database. Not a production-sized D1 restore. |
| Failure/recovery exercise | **PASSED** | Locally simulated loss of a seeded client row and recovered it from the snapshot. No provider outage or remote recovery was simulated. |
| Recovery point objective (RPO) | **AWAITING EXTERNAL APPROVAL** | Business owner must define acceptable data-loss window and confirm provider backup cadence. |
| Recovery time objective (RTO) | **AWAITING EXTERNAL APPROVAL** | Business owner must define acceptable recovery time; no production timing was measured. |

## Remaining work

Configure least-privilege automated backups for the correct environment, approve retention and RPO/RTO, verify provider-side integrity, restore into an isolated staging database, record elapsed restore/reconciliation time and test the application against the restored instance. Do not treat this local test as evidence of production recovery.
