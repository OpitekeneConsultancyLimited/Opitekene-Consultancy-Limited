# Phase 2c completion report: access controls, launch gates, upload scanning, CSP, email and infrastructure

**Date:** 14 November 2026. **Authorised by:** the owner's instruction to start Phase 2c after the Phase 2b report. **Delivered in:** PR #38 (merged as `62fc662`). **Live:** migration `20261114000200` applied after a backup (92,488 bytes) and a dry run; Worker `8360931b`; site cache v51.

> Nothing in this phase approves a launch gate, a legal record or a tax calculation. All eight launch gates start as **Not started**, with no responsible person named.

## 1. What was done

| Finding | Delivered | Evidence |
|---|---|---|
| **N8** shared admin token | Named administrators (`taxcomp.admin_users`, which the Worker can only read). Every admin page (`/admin`, legal sources, EFRIS, gates) signs in with email, password and two-step code; per-permission access; the shared token is logged on every use, refused for gates and can be switched off | `access-controls.test.mjs` (4 tests); e2e: browser sign-in against Supabase Auth, wrong code refused |
| **M4** interim auth controls | Two-step sign-in (TOTP) in Account; reviewers and admins must use it (`aal2`), otherwise staff screens stay closed and the refusal is logged; reset links cannot skip it; "sign out on all devices"; security event log (append-only, no secrets or IPs); password policy and rate limits declared | `challenge-api.test.mjs` M4; e2e setup with QR and wrong and right codes; `config diff` |
| **M2** launch sign-offs | Launch-gate register for 8 gates. The database refuses unevidenced approvals, self-approval and public launch before the other seven; reviews lapse after 12 months at most; hash-chained history; launch needs the deploy flags **and** the gates | `access-controls.test.mjs` (3 tests), `commercial-governance.test.mjs`; e2e gates page |
| **N17** (new, High) unscanned uploads | Challenge an Assessment uploads are scanned in memory before storage and fail closed. Download and AI reading need `scan_status = 'clean'`. Scanner image hardened against archive bombs, encrypted files and macros | `challenge-api.test.mjs` (2 tests) |
| **L2** CSP | Enforced meta CSP on both public pages after a source inventory. No unsafe-inline or unsafe-eval; checked in CI; admin pages use nonce CSP and security headers | `site-csp.test.mjs` (7 tests); e2e: 0 violations on the corporate page, app and admin pages |
| **M3** email | Provider-neutral guide (SPF, DKIM, DMARC, bounces, complaints, monitoring, 9-step test plan); 10 branded templates incl. security notifications; config validated by `config diff` | Template keys accepted by the CLI |
| **L4** infrastructure | Recommendation: Free for the pilot, Pro ($25 a month) before launch, PITR (about $100 a month) only with an RPO under 24 h | Supabase pricing pages, 14 Nov 2026 |

Tests: **490/490** unit (was 472). Browser e2e **154/154** locally in Edge (was 138). TypeScript clean.

## 2. Effects on the live service once deployed

* **Staff need two-step sign-in.** The only reviewer account must turn it on (Account → Two-step sign-in) before the review queue and verification register open again.
* **Challenge uploads are switched off** until the malware scanner is deployed. People can still type or paste their notice. No documents had been uploaded (0 in production).
* **Admin pages offer personal sign-in.** The shared token still works (logged) until it is switched off.
* **The CSP is enforced** on the next Pages deploy.

## 3. Not done, and why

| Item | Reason | Who |
|---|---|---|
| Server-side password policy (`config push`: minimum 6 → 12, letters and digits) | Previewed with `config diff` (only these 2 changes), but the push was **blocked by the session's permission system** | Owner runs `npx supabase@2.121.0 config push` |
| Add administrators; switch the shared token off | Adding production identities needs the owner's decision | Owner (SQL in ACCESS_CONTROLS.md) |
| Scanner deployment | Needs a Fly.io account and payment | Owner |
| Custom SMTP | Needs a provider and DNS | Owner |
| Leaked-password protection, session time-outs, PITR | Paid plan features | Management decision |
| Header-based protection (frame-ancestors, HSTS) | GitHub Pages cannot send headers | Management (custom domain via Cloudflare) |
| Report-only CSP phase | Not possible with a meta policy. Replaced by enforced testing in the browser suite | — |

## 4. Verdict

Phase 2c is **implemented, tested and deployed**. Live checks: 74 tables with RLS, 8 gates not started, 0 admins; admin and gate APIs refuse unsigned calls (401) and the refusal is logged; both public pages serve the CSP with 0 violations in a real browser (real supabase-js, fonts). M2, M3, M4 and L4 remain open on owner and management actions. N8 and N17 are closed in code, but N8 stays open in operation until administrators are added and the shared token is off. H1 (legal content) is unchanged: 0 legal records are verified.
