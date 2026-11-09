# Backup and restore drill (Supabase): blockers BCP-1, BCP-2, DB-2

Goal: prove that TaxComp's Supabase data can be restored completely, and record how
long it takes and how much data could be lost. `PHASE6_BACKUP_RESTORE_VERIFIED`
may be set to `"true"` only after this drill passes and is signed off below.

## 0. Decide the targets (owner)
| Target | Meaning | Value (fill in) |
|---|---|---|
| RPO | Most data you could lose (time since the last backup) | e.g. 24 h with daily backups, minutes with PITR |
| RTO | Longest acceptable time to be back online | e.g. 4 h |

## 1. Backups exist (BCP-1)
State on 2026-11-09 (`npx supabase@2.121.0 backups list --project-ref xbooviddjkikcbccfcnw`):
WAL-G enabled, **PITR off, no backups listed yet** (the project was created that day).
* Check the plan under Supabase Dashboard → Organization → Billing. The Free plan
  does not provide restorable daily backups; Pro does (7 days), and PITR is an add-on.
* For RPO under 24 h, enable PITR (Dashboard → Database → Backups).
* Record the backup schedule and retention in the sign-off table below.

## 2. Restore into an isolated project (BCP-2 / DB-2)
Never restore over production.
1. Create a separate project, e.g. `taxcomp-restore-drill` (same region, eu-west-1).
2. Restore production's latest backup into it. Use Dashboard → Database → Backups →
   "Restore to new project" when the plan allows; otherwise use a logical dump:
   ```powershell
   npx supabase@2.121.0 db dump --linked --schema taxcomp -f taxcomp-schema.sql
   npx supabase@2.121.0 db dump --linked --schema taxcomp --data-only -f taxcomp-data.sql
   ```
   Then run both files in the drill project's SQL editor. **These files contain
   client data:** keep them out of OneDrive/Git and delete them after the drill.
3. Note the start and end times. The elapsed time is your measured RTO for this method.

## 3. Verify the restore
From `TaxComp-Prototype`, with connection strings for a role that can read
`taxcomp` (e.g. `postgres`) on each project. Set them as variables; never type
them into a file:
```powershell
$env:SOURCE_DATABASE_URL   = "<production connection string>"
$env:RESTORED_DATABASE_URL = "<drill project connection string>"
node scripts/verify-restore.mjs --out restore-evidence-YYYY-MM-DD.json
Remove-Item Env:SOURCE_DATABASE_URL, Env:RESTORED_DATABASE_URL
```
The verdict must be **MATCH**. The report holds per-table row counts and content
hashes, schema, constraint, index, RLS, policy and grant fingerprints, and no row
contents or passwords. Production changes during a slow drill can cause row
differences; re-run the drill in a quiet window or explain the difference.

The verifier is tested in `worker/supabase-restore-verify.test.mjs` (a match plus
data, RLS, grant and index drift) and was run against live production on
2026-11-09: 32 tables, 32 policies, MATCH (production compared with itself).

## 4. Concurrency and tenancy on the restored copy (DB-2)
Point the preview Worker at the drill project (a separate Hyperdrive config) and
run the Phase 6 smoke steps, or run
`node --test worker/supabase-phase6-e2e.test.mjs`, which covers tenant isolation
on the same schema.

## 5. Clean up and sign off
Delete the dump files and pause or delete the drill project.

| Item | Evidence | Done by | Date | Approved by |
|---|---|---|---|---|
| Plan, backup schedule and retention (BCP-1) | | | | |
| RPO / RTO agreed | | | | |
| Restore completed, measured RTO | | | | |
| `verify-restore` verdict MATCH | report file name | | | |
| Drill project and dumps removed | | | | |
