# Upload security and malware scanning

Audit finding **M2** (scanner not deployed) and new finding **N17** (Challenge an Assessment uploads were not scanned).

## What was wrong (N17)

Since the storage key was set on 11 Nov 2026, Challenge an Assessment accepted uploads:
- They were type-checked but **not malware-scanned**.
- They went straight to Supabase Storage.
- Reviewers could download them, and they could be sent to the AI reader.

Production held **0** uploaded documents when this was found (14 Nov 2026), so no unscanned file was ever stored. The Phase 6 workspace upload path already required the scanner.

## The workflow now

Upload → validation → in-memory quarantine → malware scan → accept or reject → private storage.

| Step | Control | Where |
|---|---|---|
| Validation | Allowed types only: PDF, JPEG, PNG, WebP, DOCX, XLSX, TXT, CSV. The file's first bytes must match its declared type. 10 MB limit (checked before and after reading). Executables, macro-enabled Office files and archives are not accepted. | `worker/challenge/api.mts` |
| File names | Characters reduced to `[A-Za-z0-9 _.()-]`, 120 characters at most. Storage paths are built by the Worker (`owner/case/uuid`), never from the file name, so path traversal is impossible. | same |
| Quarantine | The file exists only in Worker memory until the scan answers. | same |
| Scan | ClamAV (`scanner/`). Only an explicit `{"clean": true}` counts as clean. | `worker/malware-scanner.mjs` `scanUpload` |
| Fail safe | No scanner, an error, a timeout or any other answer means nothing is stored, and the person is told plainly. With no scanner configured, uploads show as switched off. | same |
| Archives and evasion | The scanner image refuses anything it cannot fully inspect: over-size or over-deep archives, encrypted archives or documents, OLE2 macros, broken executables. | `scanner/Dockerfile` |
| Record | `challenge_documents.scan_status = 'clean'`, `scanned_at` and `sha256`. Downloads and AI reading refuse any document not marked clean. | migration `20261114000200` |
| Logging | Rejections go to `challenge_audit_log` (`document.rejected`) and `security_events` (`upload.scan`), with type, size and SHA-256 only. File contents are never logged. | same |
| Access | The private bucket `assessment-documents` is reached only through the Worker. Owners see their own files; assigned reviewers (with two-step sign-in) see their cases' files. | existing |

**Effect in production until the scanner is deployed:** document uploads in Challenge an Assessment are **switched off**, and the site shows "paused until malware scanning is switched on". People can still type or paste their notice. This is the fail-safe the brief requires.

## Deploying the scanner (owner)

Follow `scanner/README.md`:
1. Use Fly.io, a 2 GB VM in Amsterdam (`ams`), about US$10–15 a month at the time of writing; check current Fly.io pricing.
2. Create a random token and set it on both sides (`SCANNER_TOKEN` and `MALWARE_SCANNER_TOKEN`).
3. Set `MALWARE_SCANNER_URL` and deploy the Worker.
4. Run the EICAR test.

Record Fly.io as a data processor (privacy gate).

The hardened `clamd.conf` settings could not be built here (Docker is not installed on this PC). The first `fly deploy` is the build test. If clamd refuses an option, remove that line and note it in the security gate's evidence.

## Tests

- `worker/challenge-api.test.mjs`:
  - "N17: every upload is malware-scanned before storage…" covers clean, infected, scanner down, scanner error, and an unscanned record refused for download and AI reading.
  - "N17: with storage but no scanner, uploads stay switched off".
- `worker/malware-scanner.test.mjs`: the scanner service itself (EICAR, authentication, size limit, fail-closed).
