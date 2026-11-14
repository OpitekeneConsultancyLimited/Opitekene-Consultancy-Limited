# Legal verification register (Phase 2b)

Technical documentation for the legal verification register, independent two-person review, emergency withdrawal and the protected legal audit trail. Built on 14 November 2026 (audit finding H1). For reviewer instructions, see [REVIEWER_GUIDE_VERIFICATION.md](REVIEWER_GUIDE_VERIFICATION.md).

> **The system does not certify the law.** It records who checked which record against which authoritative source, and stops unchecked, disputed or withdrawn material being presented as verified law. Whether a record is legally correct is decided by qualified people.

## 1. What is governed

| Record type (`entity_type`) | Table | Id format | "Verified" means |
|---|---|---|---|
| `law_version` | `legislation_law_versions` | `ug-rev-2024/ita` | `verification_status = 'verified'` |
| `section` | `legislation_sections` | `ug-rev-2024/vata/s16` | as above |
| `schedule` | `legislation_schedules` | schedule id | as above |
| `amendment` | `legislation_amendments` | `vat-2026-s7-registration-threshold` | as above |
| `knowledge` | `knowledge_records` | `intl.foreign-tax-credit` | `status = 'verified'` |
| `holiday` | `public_holidays` | `2026-12-25\|Christmas Day` | `verified_by` set |
| `rule_set` | `procedure_rule_sets` | `objections-2026.v1` | `approved_for_computation = 1` |
| `provision` | `law_provision_versions` | `tpca.interest.2026` | `approved_for_computation = 1` |
| `case_law` | `tax_case_law` | case id | summary approved or appeal status confirmed |
| `calculator_rules` | none (rule sets in `tax-rules.js`) | `UG-FY2026-27-v1`, or `UG-FY2026-27-v1#paye` for one calculator | withdraw and reinstate only; verification belongs to Phase 4 |

## 2. Workflow

| Stage (brief) | In TaxComp |
|---|---|
| Draft | Every imported or entered record starts unverified (shown as **Pending verification**). |
| Research | A reviewer marks it "under review" (one person; this only lowers trust). |
| Verification | A reviewer **submits a verification request**: law or instrument, number, source type, provision, publication, assent, Gazette and commencement dates, effective period, tax year, an https source link or a document reference, and an evidence note. |
| Legal review | A **different** legal approver examines the request in the Verification register. |
| Approval | The approver approves (or rejects with a reason). |
| Publication | On approval, in the same transaction, the record becomes verified, a new register version is written and the action is chained into the audit log. Users see it at once. |

Superseding (marking law as replaced) follows the same two-person path. Marking a record **disputed** is open to any reviewer, because it only lowers trust: a verified record is demoted at once.

## 3. Independence rules (enforced, not just displayed)

| Rule | API (`register.mts`) | Database |
|---|---|---|
| Only reviewers prepare; only legal approvers decide | 403 | — |
| The preparer cannot decide their own request | 403 | `CHECK legal_request_two_person (decided_by <> prepared_by)` |
| The author of the content cannot approve it (knowledge creator or editors, holiday added_by, provision text entered by) | 403 | — |
| A record can only become verified through an approved request whose approver is the recorded verifier | — | Trigger `legal_require_two_person` on all 9 tables, checking `taxcomp.legal_request` set in the same transaction |
| A Bill, budget speech or press report never verifies law | 400 | `CHECK legal_request_not_proposed_law` |
| "Verified law" needs two different people and a primary source | — | `CHECK legal_register_verified_law` |
| A submitted request's evidence cannot be edited; decided requests are frozen | — | Trigger `legal_requests_protect` |
| One pending request per record | 409 | Unique partial index |

The old one-step routes (legislation status "verified" or "superseded", knowledge "verify" and "outdated", holiday "confirm", deadline-rule and provision approval, case-law approval) now **create a request and return 202**. Nothing in the code base can verify a record in one step: the database refuses it.

**Restore exception:** restoring a backup re-inserts verified records. The trigger allows that only when `taxcomp.restore = 'on'` is set **and** the role is not `taxcomp_worker` (the restore script runs as the database owner). This is tested: the Worker role cannot use it.

## 4. Legal classes shown to users

| Class | Label | When |
|---|---|---|
| `verified_law` | Verified law | Two-person verified against an Act, statutory instrument, Gazette notice, commencement instrument or (for case law) the decision |
| `pending_verification` | Pending verification | Not yet verified |
| `disputed` | Disputed legal position | Marked disputed, or an amendment whose Bill and reported figures differ and is not verified |
| `superseded` | Superseded law | Superseded through two-person review (knowledge: "outdated") |
| `withdrawn` | Withdrawn | Emergency withdrawal (never served publicly) |
| `professional_commentary` | Professional commentary | A verified knowledge note: it summarises the law, it is not the law |
| `proposed_legislation` | Proposed legislation | An amendment found only in a published Bill |
| `administrative_guidance` | Administrative guidance (URA) | Verified against a URA publication. **Added beyond the brief's seven**, because URA guidance is neither law nor commentary |

`legalClass` and `legalClassLabel` are on every law, section, schedule and amendment in `/api/legislation/*`, and on every knowledge record users see. The AI evidence gives each provision's legal status, and the prompt rules forbid calling anything verified law unless its status says so.

## 5. Emergency withdrawal

One legal approver withdraws with a reason (`POST /api/challenge/review/register/withdrawals`). In one transaction: the withdrawal is recorded, the record's `withdrawn` flag is set, any verified status is removed, pending verifications of it are cancelled, a "withdrawn" register version is written, and the audit log is chained.

| Surface | Effect | Where |
|---|---|---|
| Public legislation API | Direct requests get **410** with the reason; lists, search and related provisions leave it out; a withdrawn law hides all its sections | `legislation.mts` |
| AI assistant | Retrieval never returns withdrawn sections or amendments; the prompt says withdrawn material is never included | `retrieveLegislation`, `retrieveAmendments` |
| Amendments register, dashboard "Changed in 2026", impact sources | Excluded | `listAmendments` (default), `personalise.mts`, `impact.mts` |
| Knowledge base | Excluded for users | `loadKnowledge` |
| Holidays | Excluded, so a withdrawn holiday cannot move a deadline | `loadHolidays` |
| Deadline rules | **No dates are computed**: the case shows a notice to seek advice. The built-in seed rules are not used instead | `loadRuleSet`, `computeDeadlines` |
| Provisions and case law used in a case | Excluded | `loadVersions`, `loadCaseLaw` |
| Calculators (browser) | The result shows the reviewers' reason and no figures | `legal-status.js` (reads `/api/legislation/withdrawals` on load, every 5 minutes and when the page becomes visible) and `app.js` |
| Impact assessment and the assistant's calculations | Status `withdrawn`, no figures; the model is told not to calculate | `assessImpact`, `index.mjs` |
| Caches | All legislation responses are `Cache-Control: no-store` (were `max-age=300`); the service worker never caches Worker responses; the Knowledge Centre's in-page cache now expires after 5 minutes | `legislation.mts`, `law-index.js` |

**Limit:** a browser that has already displayed a page keeps showing it until the next refresh or calculation. Calculators re-check at least every 5 minutes, and immediately when the tab becomes visible again.

**Reinstating** needs a two-person `reinstate` request. Afterwards the record returns as **pending verification**, never straight back to verified.

## 6. History and audit

- `legal_register`: every approved, disputed or withdrawn state is a new version with its evidence fields and effective period. Older versions get `superseded_at` and are otherwise immutable; nothing can be deleted (trigger `legal_register_protect`). The existing `legislation_history` and `knowledge_record_events` keep recording field-level changes.
- `legal_audit_log`: append-only. The Worker role has INSERT and SELECT only, and a trigger refuses UPDATE and DELETE for everyone. Each row's `hash` is SHA-256 over the previous row's hash and its own content, so changing or removing any row breaks the chain from that point. `GET /api/challenge/review/register/audit` and the register screen recompute it; the test suite proves an edit made with the protection switched off is detected.
- Backups export the audit log in sequence order, so a restore reproduces the same hashes.

## 7. API (reviewers; signed in)

| Method and path | Who | Purpose |
|---|---|---|
| `GET /api/challenge/review/register` | reviewers | Counts, pending requests (with `preparedByMe`, `canDecide`), conflicts, disputes, withdrawals, recent decisions, audit status |
| `GET /api/challenge/review/register/entry?type=&id=` | reviewers | One record's versions, requests, withdrawals and audit entries |
| `POST /api/challenge/review/register/requests` | reviewers | Submit verify, supersede or reinstate |
| `POST …/requests/{id}/decision` | legal approvers, not the preparer or author | `{decision: approve\|reject, note}` |
| `POST …/requests/{id}/cancel` | the preparer | Cancel your own pending request |
| `POST /api/challenge/review/register/withdrawals` | legal approvers | Emergency withdrawal |
| `POST /api/challenge/review/register/disputes` | reviewers | Mark disputed |
| `GET /api/challenge/review/register/audit` | reviewers | Recompute the hash chain |
| `GET /api/legislation/withdrawals` | public (origin-locked) | Active withdrawals: type, id, reason and date only, no reviewer identities |

## 8. Tests

- `worker/legal-register.test.mjs`: 6 tests covering permissions, database enforcement, legal classes, history, withdrawal propagation and reinstatement, and the audit chain with tamper detection.
- Reworked for two-person review: `legislation.test.mjs`, `knowledge.test.mjs`, `challenge-api.test.mjs`, `supabase-postgres.test.mjs` (now 70 tables, `legal_audit_log` append-only).
- `scripts/challenge-e2e.mjs` (browser): register screen, self-approval refused, approval applied, withdrawal through the UI, PAYE calculator blocked, 410 after a section is withdrawn, axe-core and 360 px layout.
