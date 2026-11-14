# Backup recovery runbook

For restoring TaxComp data after data loss or corruption. Read together with the [key management policy](BACKUP_KEY_MANAGEMENT_POLICY.md).

## What a backup contains

The full `taxcomp` schema: all 66 tables' rows, plus the list and checksums of the migrations it was taken against. **It does not contain** Supabase Auth users (sign-in accounts) or uploaded files in Storage (finding N6). Those must be recreated or restored separately until the backup is extended.

## Where backups are

- `%USERPROFILE%\TaxComp-backups\taxcomp-YYYY-MM-DD.tcbak` on the backup PC (latest 35)
- `OneDrive\TaxComp-backups\` (same files, off-site)

## Routine check (monthly, about 1 minute)

```
powershell -ExecutionPolicy Bypass -File scripts\backup-restore-drill.ps1
```

This restores the newest backup into an empty in-memory database, compares every table's row count with the backup's manifest, and writes `evidence\restore-drill-<date>.json`. It touches no live system. It must print `RESTORE DRILL PASS`.

## Restoring for real

1. **Decide the target.** Never restore over live data: the tool refuses if the target already has rows. Create a new Supabase project, or empty the affected project only with management approval and a fresh backup taken first.
2. Get the passphrase from the password manager. If the backup PC is lost, this is the only copy.
3. Get the target's connection string (Supabase › Connect › direct connection).
4. On any machine with Node 22 and a clone of the repository at the commit matching the backup's migrations:
   ```
   $env:DATABASE_URL = '<target connection string>'
   $env:BACKUP_PASSPHRASE = '<passphrase>'
   node scripts/taxcomp-backup.mjs restore --in <file.tcbak>
   Remove-Item Env:DATABASE_URL, Env:BACKUP_PASSPHRASE
   ```
5. If restoring into a new project: create the `taxcomp_worker` role (see `SUPABASE_MIGRATION.md`), point the Cloudflare Hyperdrive config `taxcomp-supabase` at it, set the Worker secrets again, and update `SUPABASE_URL` in `wrangler.toml`.
6. Verify with the cloud audit (`node scripts/cloud-audit.mjs`) and spot-check a case and a profile.
7. Record what happened, the data-loss window and the time taken in an incident record.

## Recovery objectives

Not yet set by management (finding G6). Achieved today: **RPO up to 24 hours** (nightly backup at 02:30). **RTO** about 1 hour for the database alone, measured by drill (restore takes seconds; project setup and configuration take most of the hour).
