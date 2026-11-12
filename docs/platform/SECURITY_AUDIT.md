# Security audit

Date: 12 November 2026. Each finding was checked against the repository and the live system.

| # | Finding | Severity | Status and evidence |
| --- | --- | --- | --- |
| S1 | **The whole repository was published on the website** (`upload-pages-artifact path: .`). That included the copyrighted compendium PDF, the verification spreadsheet, the Worker source, migrations and internal documents. Checked live: `HEAD …/Compendium…pdf` and `…/wrangler.toml` both returned 200. | Critical | **Fixed.** Pages is now built from an allowlist (`scripts/build-pages.mjs`): only files the two pages, the service worker and the manifest reference. PDFs, spreadsheets, source, SQL, TOML and the docs, worker, supabase and scripts folders are refused even if linked. CI checks the allowlist on every push. |
| S2 | **The copyrighted compendium PDF is in the public GitHub repository** and its history. The owner chose "structure only" for this book. | High | **Removed from `main`.** It stays in **git history** until the history is rewritten (a force push). That is irreversible and changes every commit id, so it needs the owner's decision; the commands are in `PRODUCTION_DEPLOYMENT_CHECKLIST.md`. The local copy is untouched. |
| S3 | **Committed secrets.** Scanned all tracked files for Anthropic, Gemini, Supabase secret and service-role keys, Flutterwave keys, private keys and connection strings with passwords. | — | **None found.** The matches are format checks in code and synthetic test fixtures. The Supabase *publishable* key in the page is public by design. Secrets live in Cloudflare (`wrangler secret`) and in the owner's local secrets folder. |
| S4 | **Database access.** | — | **OK.** RLS is on for all 66 tables, with a Worker-only policy and no grants to anon or authenticated. Append-only tables (audit logs, history) have no UPDATE or DELETE. Checked by `worker/supabase-postgres.test.mjs`. |
| S5 | **Authorisation.** | — | **OK.** Every private route verifies the Supabase JWT on the server. Rows are filtered by user id or organisation membership. Cross-tenant access answers 404 (tested). Reviewer and approver roles come from the database, never from the client. |
| S6 | **Input validation and rate limits.** | — | **OK.** JSON size limits, enumerated values, the `facts` allowlist on `/api/impact`, an origin lock (403 for other sites, checked live), and 8 requests per minute per IP. |
| S7 | **AI safety.** | Medium | **Partly done.** User text goes into fixed evidence slots; only enumerated profile values reach the model; citations are checked against retrieved records; figures come from the deterministic engine. **No dedicated prompt-injection test suite yet** (roadmap R5). |
| S8 | **No Content Security Policy.** GitHub Pages cannot send headers. | Medium | Open. A `<meta http-equiv="Content-Security-Policy">` can be added once the inline scripts are moved out (roadmap R9). |
| S9 | **No MFA for reviewer and approver accounts**, who can mark law as verified. | Medium | Open. Supabase Auth supports TOTP MFA; enforce it for `challenge_reviewers` (roadmap R9). |
| S10 | **Backups.** | Medium | Encrypted daily export with a restore drill that passed. The **scheduled run has not completed yet** (task "TaxComp daily backup" shows "never run"). Manual backups are taken before every production change. |
| S11 | **Uploads.** | — | Phase 6 uploads stay off until the ClamAV scanner is deployed. Challenge uploads are limited by type and size and kept in a private bucket. |
| S12 | **Unrelated files tracked** (`__pycache__`, a personal Python exercise folder). | Low | No longer published (S1). Clean-up proposed in `TECHNICAL_DEBT_REGISTER.md`. |

## Owner decisions needed

1. Rewrite git history to remove the compendium PDF (S2).
2. Set MFA as required for reviewer and approver accounts (S9).
3. Set the Anthropic and Flutterwave secrets, deploy the scanner, and collect the Phase 6 sign-offs.
