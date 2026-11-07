# Database migration report

Date: 2026-11-07  
Status: **Local tests passed; staging and production migrations blocked**

## Migration inventory

| Migration | Purpose | Current remote status |
|---|---|---|
| 0001 | Unanswered questions | Existing baseline |
| 0002 | Consent timestamp | Existing baseline |
| 0003 | EFRIS workspace | Existing baseline |
| 0004 | Legal source registry | Pending according to read-only remote listing |
| 0005 | Phase 6 operations | Pending according to read-only remote listing |
| 0006 | Daily aggregate analytics and commercial subscription/payment/invoice metadata | Pending; newly added locally |

Remote status was read with `wrangler d1 migrations list --remote`. No migration apply command was run.

## Local implementation and validation

- Migration 0006 is additive and uses checks, foreign keys, unique constraints and tenant-scoped indexes.
- Analytics schema stores an allowlisted aggregate count by organization, day and metric name; it has no actor/client/raw-question columns.
- Payment event schema stores provider/event IDs, event type and payload hash rather than raw webhook payload.
- Subscription plans/prices are not seeded; pricing and currency must be explicitly configured.
- `test_phase6_migration.py` validates application, constraints, tenant isolation, duplicate event rejection, and SQLite backup/restore.
- The restore test reinstates a pre-0006 local SQLite schema after applying 0006 in the disposable test database. It is not a D1 production rollback demonstration.

## Migration procedure and rollback policy

1. Maintain a distinct staging database and verify the binding/database ID before any apply.
2. Record current migration list and create/export a backup with integrity verification.
3. Apply migrations in staging using Wrangler's migration mechanism; confirm the recorded migration history and run database/API tests.
4. Demonstrate restore into an isolated staging database and reconcile row counts/foreign keys.
5. For schema rollback, use an additive forward corrective migration or restore a verified snapshot to a new database and switch only after authorization. Do not edit an applied migration or delete D1 migration-history rows.
6. Apply to production only after documented approval. **No production migration authorization is provided by this report.**

## Results / outstanding work

- Python migration suite: 9 passed.
- All Python tests: 16 passed.
- Staging migration, live transaction/concurrency tests, D1 backup/recovery integration, and production apply: **BLOCKED / NOT RUN**.
