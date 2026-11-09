# TaxComp malware scanner (ClamAV), blocker SEC-4

Client documents are scanned before they are stored. This service is the
official ClamAV image (1.4 LTS) plus a small Node front (`server.mjs`, no
dependencies). The Worker sends each upload to `POST /scan` and stores the file
only if the answer is `{"clean": true}`; any error blocks the upload.

* File contents are streamed to clamd in memory and are never written to disk or logged.
* Access requires a bearer token; uploads over 16 MB are refused.
* Signatures update automatically (freshclam inside the image).
* Tests: `worker/malware-scanner.test.mjs` (fake clamd speaking INSTREAM, EICAR
  detection, auth, size limit, fail-closed, full Worker upload path).

## Deploy on Fly.io (about US$10–15/month: ClamAV needs a 2 GB VM)
Run these yourself, in a terminal, from `TaxComp-Prototype\scanner`:

1. Install flyctl and sign in: <https://fly.io/docs/flyctl/install/>, then `fly auth login`.
2. Create the app from this folder's config (pick a unique name if asked):
   ```powershell
   fly launch --copy-config --no-deploy
   ```
3. Create a random token and give it to both the scanner and the Worker,
   without displaying it:
   ```powershell
   $b = New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
   $t = [Convert]::ToBase64String($b)
   fly secrets set SCANNER_TOKEN=$t
   cd ..; $t | npx wrangler@4.158.0 secret put MALWARE_SCANNER_TOKEN; cd scanner
   Remove-Variable t, b
   ```
4. Deploy, and wait for the health check (clamd needs about a minute to load signatures):
   ```powershell
   fly deploy
   fly status
   ```
5. In `wrangler.toml` `[vars]`, set `MALWARE_SCANNER_URL = "https://<your-app>.fly.dev"`,
   then deploy the Worker (`npx wrangler@4.158.0 deploy`).
6. Check it with the harmless EICAR test file. A **non-PDF** test is enough here,
   because the scanner itself does not check file types:
   ```powershell
   $eicar = 'X5O!P%@AP[4\PZX54(P^)7CC)7}$' + 'EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*'
   Invoke-RestMethod https://<your-app>.fly.dev/scan -Method Post -Headers @{ Authorization = "Bearer <token>" } -Body $eicar
   ```
   Expected: `clean = False`, `signature = Eicar-Test-Signature` (or similar).

Privacy: documents go only to your own Fly.io machine (region `ams`, Amsterdam)
and are not kept. Record Fly.io as a data processor in your privacy notes.
