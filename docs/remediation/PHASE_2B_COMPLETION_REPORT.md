# Phase 2b completion report: legal verification register, two-person review, emergency withdrawal

**Date:** 14 November 2026. **Authorised by:** management instruction "AUTHORISATION: BEGIN TAXCOMP PHASE 2B". **Delivered in:** PR #36 (merged as `f1def5b`). **Live:** database migration `20261114000100` applied; Worker version `64d54d96`; site cache v50.

> **No Ugandan law has been verified by this work.** Production holds **0** verified legal records of any kind, as it did before. Phase 2b builds and enforces the controls; the verifying itself needs a qualified legal reviewer and a second approver.

## 1. Requirements and evidence

| Mandatory requirement | Implementation | Test evidence | Production evidence |
|---|---|---|---|
| Structured register with authoritative sources | `legal_verification_requests` and the versioned `legal_register`: instrument, number, source type, provision, jurisdiction, publication/assent/Gazette/commencement dates, effective period, tax year, source URL or document reference, status, preparer, approver | `legal-register.test.mjs` "history" | 4 tables present, RLS on |
| Genuinely independent two-person review | API refuses the preparer and content authors; database CHECK refuses `decided_by = prepared_by`; trigger refuses any record becoming verified without an approved request naming the verifier | "permissions", "database enforcement"; reworked legislation, knowledge and challenge tests; e2e "you cannot approve a request you prepared" | Trigger present on all 9 tables. A direct write probe was blocked by the session's permission system, so the refusal is proven in tests, not in production |
| Preparers cannot approve their own submissions | as above | 403 cases in 4 test files | — |
| Pending, disputed, rejected and withdrawn material never shown as verified law | Legal class on every output; disputes demote; withdrawal removes; AI prompt rules | "legal classes", "emergency withdrawal" | Live: 40 pending, 8 proposed legislation, 5 disputed amendments; section 16 "Pending verification" |
| Historical versions and effective dates kept | New version per state; old versions immutable (`superseded_at` only); effective period on each | "history" (UPDATE and DELETE refused) | — |
| Emergency withdrawal | One legal approver; immediate | "emergency withdrawal"; e2e withdrawal through the UI | Endpoint live (none withdrawn) |
| Withdrawal reaches public pages, calculators, AI retrieval and caches | See LEGAL_VERIFICATION_REGISTER.md §5: 410 + reason, search, lists, AI retrieval, amendments, dashboard, knowledge, holidays, deadlines (no dates), case law, impact and assistant (no figures), browser calculators; `no-store` | Unit: each surface; e2e: PAYE calculator blocked, section 410 | Legislation and withdrawals responses `Cache-Control: no-store` (checked live) |
| Protected audit records | Append-only hash-chained `legal_audit_log`; Worker role INSERT/SELECT only; protection triggers | "audit trail": UPDATE/DELETE refused; tampering detected | Worker cannot DELETE (checked live) |
| Administrator visibility | Verification register tab: counts, waiting reviews, conflicts and disputes, withdrawn material, history look-up, audit-chain status | e2e register checks, axe, 360 px | Signed-out access refused (401) |
| Automated tests | 6 new tests, 4 files reworked, e2e extended | 472/472 unit; e2e 138/138 locally (Edge) and in CI (Chrome) | CI green on PR #36 |
| Least privilege, RLS kept, no service-role exposure | Worker-only policies; no anon/authenticated grants; public withdrawals list has no reviewer identities | `supabase-postgres.test.mjs` (70 tables, RLS everywhere, append-only audit tables) | Checked live |
| New migrations only; nothing destructive | One additive migration; backup taken first (92,212 bytes); dry run before push | CI migration-immutability check | Applied |

Also: the old single-step routes now return **202 Pending**. Backups include the new tables, export the audit log in order, and can restore verified records only as the database owner.

## 2. The classes users see

Verified law · Pending verification · Disputed legal position · Superseded law · Withdrawn · Professional commentary · Proposed legislation, plus **Administrative guidance (URA)**. That eighth class was added because URA publications are neither law nor commentary. A verified knowledge note is always commentary or guidance, never "verified law".

## 3. Human legal review still outstanding

| Item | Status | Needs |
|---|---|---|
| 18 laws, 701 section headings, 41 schedules | 0 verified | Comparison with the official ULRC revised edition; two people per record |
| 53 amendments for 2026 | 0 verified | Enacted Acts and Gazette commencement notices (not found online so far) |
| **5 conflicts** (shown to users as disputed): VAT Act s.7(2) registration threshold, Bill UGX 250m against reported 300m; Excise Duty Act Sch. 2 item 7 (cement), UGX 1,000 against 750 per 50 kg; item 9 (sugar), UGX 300 against 200 per kg; Stamp Duty Act Sch. 2 item 67 (motorcycles), UGX 50,000 against 30,000; Tax Procedures Code s.47D waiver date, 30 June 2027 against 30 June 2026 | Unresolved. **No figure has been chosen.** | The gazetted 2026 Acts. This phase did not research them; the conflict evidence pack is the next H1 task |
| Objection, decision and appeal time limits (45/90/30 days) and their counting rules | Unapproved | Tax Procedures Code and Tax Appeals Tribunal Act text; counting method; extensions |
| 36 public holidays | Unconfirmed | Gazette and Public Holidays Act |
| 62 knowledge notes | Drafts | Review against the cited chapters |
| Calculator rule sets (FY 2026/27, FY 2025/26) | Pending | Phase 4 tax calculation assurance |

## 4. Dependencies on management or professionals

1. **Appoint at least two legal reviewers**, one with approver rights, each with their own account (only one reviewer account exists). Two-person review cannot happen with one person.
2. Obtain the **gazetted 2026 amendment Acts** and commencement instruments.
3. Decide who may hold **emergency-withdrawal** rights (all legal approvers can today).

## 5. Findings raised during Phase 2b

- **N14:** a backup restore uses `ON CONFLICT DO NOTHING`, so a restore into a project already seeded by migrations keeps the seed version of reviewed records (for example a verified section reverts to unverified). Safe in direction (it never invents verification) but lossy. Fix in Phase 3.5 (DR).
- **N15:** an explicit question such as "section 16 of the VAT Act" retrieves section 16 of other Acts: the Act named is ignored when a section number is given. Phase 5 (AI).
- **N16:** the local `index.html` (corporate home page) was edited outside this work on 14 Nov, around 08:21 Kampala time. It states "the annual VAT registration threshold is UGX 300 million" as fact, which is one side of an unresolved conflict, and contains character-encoding damage (`Ugandaâ€™s` where `Uganda’s` was meant). **Not committed.** The owner should review it before it is published.

## 6. Verdict

Phase 2b is **implemented, tested, deployed and verified as a system**. H1 stays **open** until qualified reviewers verify the legal content through this register.
