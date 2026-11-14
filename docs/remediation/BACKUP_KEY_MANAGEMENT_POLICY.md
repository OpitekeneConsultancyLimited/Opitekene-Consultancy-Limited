# Backup key management policy (finding H3)

**Owner:** Opitekene Consultancy Limited, operations owner. **Applies to:** the TaxComp backup passphrase and the database connection string used by the backup job. This policy names secrets; it never contains them.

## Keys

| Key | Purpose | Where it may live | Where it must not live |
|---|---|---|---|
| Backup passphrase | Encrypts and decrypts every `.tcbak` backup (AES-256-GCM) | (1) the approved password manager, MFA on, shared only with custodians; (2) `backup-passphrase.dpapi` on the backup PC (readable only by that Windows user) | plaintext files, OneDrive, email, chat, git, screenshots, logs |
| Database connection string (`taxcomp_worker`) | Lets the backup job read the database | (1) the password manager; (2) `supabase-taxcomp-worker.dpapi` on the backup PC | as above |

**Why two places:** the DPAPI copy lets the nightly job run unattended, but it dies with the PC or the Windows profile. The password manager copy is the recovery route that does not depend on this PC.

## Custodians

At least **two** named people (the owner plus one deputy), each with their own password-manager account and MFA. Record their names in the password manager entry's notes, not in git.

## Rules

1. The plaintext hand-off files in `%USERPROFILE%\TaxComp-secrets` are deleted after the password manager entries are saved **and** a restore drill has passed using the procedure in the [recovery runbook](BACKUP_RECOVERY_RUNBOOK.md).
2. `TaxComp-secrets` stays outside OneDrive and any other sync folder. `scripts/protect-local-secrets.ps1` checks this.
3. Run the restore drill monthly and after any key change (`scripts/backup-restore-drill.ps1`), and keep the JSON evidence in `evidence/`.
4. **Rotation.** Rotate the passphrase if it may have been exposed, when a custodian leaves, or every 12 months. A new passphrase applies to new backups only, so keep the old passphrase (labelled with its date range) in the password manager for as long as backups made with it are kept (35 days locally and in OneDrive). Run `backup-setup.ps1` after deleting the old `.dpapi`, which creates a new key.
5. Rotate the database password if the connection string may have been exposed (Supabase › Database settings), then update the password manager and re-run `protect-local-secrets.ps1`.

## Exposure assessment (14 Nov 2026)

- The secrets folder is outside OneDrive. The backups copied to OneDrive are encrypted and reveal nothing without the passphrase.
- The plaintext files have existed since 9 Nov (connection string) and 11 Nov (passphrase) on one PC with one user profile. No evidence of access by anyone else was looked for or found. Windows does not keep file read history by default.
- Recommendation: no rotation needed unless the PC was shared or lost. Management to confirm.
