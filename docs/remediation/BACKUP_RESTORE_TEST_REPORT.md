# Backup restore test report

## Test BR-2026-11-14-01: restore without the plaintext passphrase

| Field | Value |
|---|---|
| Date | 14 Nov 2026, 05:15 UTC |
| Objective | Show that the newest backup restores completely into an empty database using only the controlled (DPAPI) key copy, not the plaintext hand-off file |
| Backup | `taxcomp-2026-11-14.tcbak`, 92,075 bytes, SHA-256 `1ce0bbfa8093c976f69dd93e1a70c4e39a760d6198337c03e20054108a73940f`, created 03:46 UTC, 19 migrations |
| Target | New, empty in-memory Postgres (PGlite) with Supabase role/schema stubs. No cloud resource touched |
| Procedure | `scripts/backup-restore-drill.ps1` |
| Expected | Every table's row count equals the manifest; 66 tables present |
| Actual | 1,974 of 1,974 rows across 27 non-empty tables; 66 tables; 2.1 s |
| Result | **PASS** |
| Evidence | `evidence/restore-drill-2026-11-14.json` |

## Test BR-2026-11-14-02: backup through the protected connection string

| Field | Value |
|---|---|
| Objective | Show that the backup job works with the DPAPI copy of the connection string, so the plaintext file can be deleted |
| Procedure | Export with the connection string read from `supabase-taxcomp-worker.dpapi`, then restore drill on that file; scratch file deleted afterwards |
| Actual | Export 92,142 bytes; drill 1,974 of 1,974 rows; 1.7 s |
| Result | **PASS** |

## Not yet covered

- Restoring into a real new Supabase project (last done 9 Nov 2026: `evidence/restore-drill-2026-11-09.json`).
- Sign-in accounts and Storage objects (not in the backup; finding N6).
- A recovery using the password-manager copy on a different machine. To be done by a custodian once the passphrase is in the password manager; this is the acceptance test for H3.
