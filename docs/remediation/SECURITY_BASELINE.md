# TaxComp security baseline

State on **14 November 2026**, measured rather than copied from older reports. Automated checks only. **This is not a penetration test** and doesn't certify that TaxComp is secure.

## Measured controls

| Area | Measurement | Result |
|---|---|---|
| Transport | Supabase SSL enforcement; Worker and Pages HTTPS only | On |
| Origin lock | `POST /chat` from a foreign origin | 403 |
| Authentication | `GET /api/challenge/cases` signed out | 401 |
| Database exposure | `anon` / `authenticated` USAGE on schema `taxcomp` | none |
| RLS | Tables without RLS | 0 of 66 (but see [architecture assessment](ARCHITECTURE_ASSESSMENT.md) A1) |
| Privileged functions | SECURITY DEFINER functions | 1 (`auth_user_id_by_email`): fixed search_path, worker-only |
| Function search paths | Supabase advisor 0011 | 1 warning (`legislation_log_change`). Fixed by migration `20261114000000` (applied after merge) |
| Public function execute | Functions executable by anon/authenticated | 1 (`phase6_audit_log_immutable`, harmless trigger). Revoked by the same migration |
| Storage | Buckets public | 0 of 2; no storage policies; Worker-only access |
| Code scanning | Open CodeQL alerts | 0 (alert #9 fixed 14 Nov, PR #34) |
| Secret scanning | Enabled / push protection / open alerts | On / on / 0 |
| Dependencies | `npm audit` (all) / Dependabot alerts | 0 / 0; Dependabot **security updates disabled** |
| Branch protection | `main` | **None** (finding N2) |
| Auth hardening | Leaked-password protection | Off (Free plan; finding M4) |
| Admin access | `/admin/*` | Shared bearer token, rate limited, fails closed (A3) |
| Uploads | Scanner deployed | No: uploads disabled until it is (fails safe) |
| Secrets at rest (owner PC) | Plaintext files in `%USERPROFILE%\TaxComp-secrets` (outside OneDrive) | 2 (backup passphrase hand-off, DB connection string). DPAPI copies now exist and are verified; plaintext deletion is the owner's step (H3, N7) |
| Security headers (Worker admin pages) | CSP, X-Frame-Options, nosniff, Referrer-Policy | Present |
| Security headers (app on Pages) | CSP | **None** (finding L2) |

## Not yet tested (planned)

- Cross-tenant access through every API route (Phase 3.2): user A reading or changing user B's cases, documents, profiles and payments; firm A against firm B.
- Reviewer and approver privilege boundaries (Phase 3.2).
- Webhook forgery, replay and idempotency (Phase 6 payments).
- Prompt injection through uploaded documents and retrieved pages (Phase 5).
- An independent penetration test (external, to be commissioned by management).
