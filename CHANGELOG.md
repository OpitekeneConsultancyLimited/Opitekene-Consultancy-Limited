# Changelog

## 2026-11-12 - International tax knowledge base and guided reasoning

- **Knowledge records** (migration `20261112000100`, `worker/challenge/knowledge.mts`): international principles and Uganda domestic law, each with source kind, organisation, reference, chapter, period, effective and publication dates, licence, verification status and last-reviewed date; history in `knowledge_record_events`. Users only see verified records; verified current law ranks first, then the source hierarchy (legislation → regulations → cases → guidance → treaties → international standards → textbooks → general AI knowledge).
- **Copyright**: *International Tax Primer* (4th ed.) is used as a conceptual framework only — metadata record, chapter references, TaxComp's own notes. No book text or page numbers are stored; restricted sources cannot hold excerpts, long quotations are rejected, and the database enforces the licence rules too. The 23 topic notes are AI-written drafts awaiting legal review.
- **Review**: Law and cases admin → Knowledge base. Reviewers add or edit (always back to draft); legal approvers verify (AI notes need a note of what they were checked against), reject, mark outdated with the replacing record, or reopen.
- **Guided question** on the International tax page (`intl-tax-reasoning.js`): asks for missing facts (residence, payment type, country, period, foreign tax, presence, related parties), then answers in order — understanding, short answer, rules (labelled international principle or Uganda law), plain explanation, example, calculation, actions, sources, assumptions — with the 12 reasoning steps. Evasion is refused; avoidance is explained with the anti-avoidance rules. No rates are stated.
- **Calculations with working**: taxable income, foreign tax credit, double tax relief (credit/exemption/deduction compared), withholding with gross-up, transfer pricing adjustment, two-structure comparison. Each shows figures, rule, formula, steps and assumptions, and needs the user's rate with its source.
- Contrast fixes on the International tax page (WCAG AA). Service worker `taxcomp-app-v38`. See `docs/knowledge-base.md`.

## 2026-11-11 - Legislative watch (Master Directive phase 7)

- `worker/challenge/lawwatch.mts`: every morning (the existing 02:15 cron) the Worker reads Parliament of Uganda's Bill Tracker (bills.parliament.ug), picks out tax Bills, reads each Bill's stage page and records the stage (introduced, debated, passed, assented, withdrawn), its dates and the Acts it amends (e.g. "Cap. 336").
- Proposed and enacted law stay apart: the watch never changes the law register. A "passed" Bill is shown as not yet law; an "assented" Bill is flagged for a reviewer to confirm in the Gazette and then update the register by hand.
- Polite reading: robots.txt is checked first (the tracker has none), requests identify TaxComp and are spaced 1.5 s apart, at most 25 Bills a run (about 150 tax Bills covered within a week; assented and withdrawn Bills are re-read monthly).
- Law and cases admin → **Legislative watch**: Bills with changes to review first, stage in plain words, dates, a link to the tracker, "Mark as reviewed" / "Not relevant", and "Check now" for legal approvers. Changes, reviews and runs are logged (`law_watch_events`, `law_watch_runs`, audit log).
- Migration `20261111000400`: `law_watch_bills`, `law_watch_events`, `law_watch_runs` (RLS, Worker-only, events and runs append-only). `scripts/law-watch-check.mjs` checks the parser against the live tracker without a database.

## 2026-11-11 - Knowledge search, chat history, Excise Duty in the law register

- **Knowledge Centre search** (`kb-search.js`): one box across guides, laws, case law, updates and compliance resources, including the law and case registers once loaded. Every word must match; headings rank first. Choosing a result scrolls to it and highlights it. Nothing is sent anywhere.
- **AI chat history**: the conversation is kept in this browser (localStorage), separately per signed-in user, and comes back after a reload. Clear removes it, and signing out deletes it from the device. Only the message text, https source links and calculator buttons are stored.
- **Law register**: Excise Duty Act and Excise Duty (Amendment) Act 2026 (migration `20261111000300`), named in the Master Development Directive. No dates were given, so the amendment is held as a bill and never applied until a legal reviewer confirms it (todo-verify B8, B9). The Knowledge Centre now shows bill status in plain words.

## 2026-11-11 - Reviewed pack payments and calendar reminders

- **Reviewed pack, UGX 250,000 per case.** Bought from the case's pack step through Flutterwave (mobile money or card). A verified payment grants that case the reviewed tier (not a subscription), writes an audit entry, and sends the case for review; the full pack unlocks on sign-off. Without Flutterwave keys the button opens WhatsApp instead.
- **Managed dispute** is quoted per case: "Ask for a quote on WhatsApp", with the case reference.
- Legal approvers can record payments taken by hand (Law and cases admin → Record a payment for a case), by the 8-character case reference; the case is assigned for review straight away.
- A Reviewed pack or Managed dispute always requires a reviewer's sign-off (review reason `paid-review`).
- Migration `20261111000200`: `billing_plans.kind` (`subscription` / `per_case`), `billing_payments.case_id` (kept as NULL if the case is deleted), and the `challenge-reviewed-case` plan. Per-case plans are not listed on the Account page.
- **Calendar reminders:** "Add to my calendar" on the objection and Tribunal deadline banners downloads a calendar file (`challenge-calendar.js`) with alerts 7 days and 2 days before and on the day. No email service needed.

## 2026-11-11 - PAYE and withholding tax assessments

- Challenge an Assessment now takes PAYE and withholding tax (WHT) notices as well as income tax and VAT.
- Reader: the text reader recognises PAYE and WHT notices (an income tax notice that only lists WHT credits stays income tax). The AI prompt is now `assessment-extraction.v2` with the two new tax heads.
- Two new kinds of disputed item, each with plain questions and an evidence list: a payment to staff URA treats as taxable pay (PAYE), and a payment the business made without withholding tax (WHT). The records step offers the items that fit the tax.
- Migration `20261111000100`: allows the new tax heads and item kinds, and adds 8 Income Tax Act provision rows for PAYE and WHT. All are TODO_VERIFY placeholders; nothing is approved for computation.
- Case search: new issue tags `paye` and `withholding`.

## 2026-11-11 - Public holidays in deadlines; accessibility scan

- Migration `20261111000000`: `public_holidays` table (RLS, Worker-only), seeded **unverified** with the fixed-date holidays and Easter for 2026-2028. Eid dates are added by reviewers each year.
- Deadline banners: when the last day falls on a weekend or a listed holiday, users are told to lodge by the working day before. Only reviewer-confirmed holidays can move a deadline later, and only under an approved `next_business_day` rule (todo-verify A3, F).
- Law and cases admin: list, add and confirm holidays (confirming needs approver rights and a source link; both actions are audited).
- The end-to-end test runs axe-core (WCAG 2.1 AA) on six screens and fails on serious problems. Fixed the two it found: low-contrast table headers, and a scrolling table keyboard users could not reach.

## 2026-11-10 - Tidy-up after release

- Migration `20261110000200`: indexes every foreign key in the `taxcomp` schema (41 flagged by the Supabase performance advisor).
- `manifest.webmanifest` theme colour now matches the page (`#0a1f3c`).
- The Challenge an Assessment end-to-end test runs in CI on Chrome.
- Dependabot vulnerability alerts turned on for the repository.
- On phones, the site header now fits 360 px screens even with wider system fonts (Android, Linux).
- Anything scrolled into view or focused stays clear of the sticky header and the "Install TaxComp" banner (WCAG 2.4.11).

## 2026-11-10 - Challenge an Assessment (v1)

- New `#challenge` feature for URA income tax and VAT assessments:
  - read the notice (PDF, photo, Word or pasted text) and confirm every figure;
  - deadline banners counted from the date of service;
  - reconcile URA's figures with the taxpayer's records;
  - one outcome per disputed item;
  - law for the tax period and Tax Appeals Tribunal decisions;
  - a draft response pack (Word, or PDF through print).
- Plain English and Professional views of the same case record. Reviewer queue and sign-off for high-risk cases.
- Server: a strict-TypeScript Worker API (`/api/challenge/*`) and migration `20261110000000` (13 tables, RLS, a private bucket, an append-only audit log). Production RLS audit in `docs/challenge-assessment/rls-audit.md`.
- Every legal rule and statute is seeded `TODO_VERIFY` and unapproved. Deadlines show "Provisional: rules pending legal review".
- Tests: 388 Node tests, 44 Edge end-to-end checks, EXT-1 text harness 20/20.
- Full report: `docs/challenge-assessment/REPORT.md`.

## 2026-11-10 - Public front page in the owner's design

- The signed-out front page now follows the owner's sample (`opitekene_tax_calculator_services_portal.html`):
  - Header: Tax Calculator, Our Services, Coverage, Contact Us, plus WhatsApp, Book Advisory and Sign in.
  - Hero with a service-coverage card.
  - Four-tab quick calculator: PAYE, VAT, WHT and CIT.
  - The four service groups: tax compliance, advisory and disputes, accounting software, training.
  - A "Sign in for the full TaxComp toolkit" section, then contact details, the advisory request form and the footer.
- The quick calculator runs on the real FY 2026/27 engine (`front-page.js` calls `window.ugandaTax`). The sample's hard-coded rates were not used: its PAYE brackets disagreed with the engine (UGX 502,000 vs 488,250 on a UGX 2,000,000 salary). A new test fails if rates are hard-coded into the front page.
- The advisory form opens WhatsApp (+256 782 092 825) with the request typed in, and tells the visitor to press Send. The sample only displayed a thank-you message and sent nothing.
- All existing app features stay behind Sign in, unchanged.
- Daily audit scripts added: `scripts/daily-audit.ps1`, `daily-audit-browser.mjs`, `daily-audit-setup.ps1`.
- Service worker cache moved to v30.

## 2026-11-09 - Site redesign: navy, white and teal; six page views

- New look: navy, white and teal palette, one sans-serif type scale, a single content width, and quieter notice boxes. `design.css` sits on top of `styles.css`; `scripts/recolor-css.mjs` moved the old greens to navy and teal at the same lightness, so contrast is unchanged.
- Signed-out visitors now see a landing page organised like the owner's sample:
  - Top bar: Features, How it works, Plans, FAQ, plus Sign in and Get started.
  - Split hero: the pitch and three trust points on the left, the sign-in card on the right.
  - Then a 2×2 features grid, three steps, the real plans, the FAQ, a call-to-action band and a column footer.
  - "Sign in" and "Get started" buttons open the matching tab on the sign-in card.
  - The tools, AI assistant and workspace still stay behind sign-in.
- The one long page became six views (`site-router.js`):
  - Home, laid out like a product landing page:
    - Split hero: the pitch on the left, three trust points, and a live "Quick PAYE check" card on the right. The card calls the real `calculatePaye`, so its figures match the full calculator.
    - Then a 2×2 services grid, three steps, Why Opitekene, the three real plans (Free account, Individual Premium, Firm), a two-column FAQ, and the call to action.
    - "How it works" moved here from About, so it isn't repeated.
  - Tax Tools: a searchable, filterable catalogue. Each tool opens on its own.
  - Tax Knowledge: guides, laws and regulations, case law, updates and compliance, with filters.
  - AI Tax Assistant.
  - Business Workspace: sidebar with Overview, Business assets, Reports, Financial records and Settings.
  - About Us: contact, payments, install guide, privacy policy, terms placeholder, disclaimer.
- New header with dropdown menus and a phone menu. New footer with link columns: Tax Tools, Knowledge, Company, Legal.
- Old anchors (`#estimator`, `#account`, `#contact`, …) and Supabase sign-in link fragments still work.
- Unchanged: every calculator, formula and rate, the AI, accounts, billing and workspace code. No script lost an element; `scripts/check-dom-contract.mjs` checks this and now runs in `npm test` (`site-views.test.js`).
- Verified in Microsoft Edge:
  - All 11 calculator tabs give identical results before and after.
  - Navigation, filters, chat (mocked), workspace panes and legacy links work.
  - No sideways scrolling on a 390 px phone.
  - No console errors.
- Tests: JavaScript/Worker 347/347, Python 17/17. Service worker cache moved to v28.

## 2026-11-09 - Supabase: database, storage and authentication

- Phase 1, database: Supabase Postgres through Cloudflare Hyperdrive, using a D1-compatible adapter (`worker/db.mjs`). Schema in the private `taxcomp` schema with RLS on, a least-privilege `taxcomp_worker` role and append-only audit trails. D1 stays the fallback while `[[hyperdrive]]` is not bound.
- Phase 2, storage: Phase 6 client documents go to the private Supabase Storage bucket `phase6-documents` (`worker/supabase-storage.mjs`), with versioned keys that are never overwritten. Downloads still pass through Worker authorization.
- Phase 3, authentication: Phase 6 identity uses Supabase Auth. Tokens are verified locally against the project's ES256 signing keys (`worker/supabase-auth.mjs`); memberships, roles and client access stay in TaxComp tables and are re-checked on every request. The custom PBKDF2 passwords, session cookies, CSRF tokens, lockout and reset tokens were removed; `/auth/login` and `/auth/password-reset/*` now return 410. Invitations use Supabase invites, and existing accounts are linked through `taxcomp.auth_user_id_by_email`. `phase6-app.js` signs in with supabase-js 2.118.0, loaded only when configured.
- Fixes: a duplicate client TIN, or a repeated bootstrap, returned 500 instead of 409. The D1 export script failed on Windows because cmd.exe treated `<>` in SQL as a redirect.
- Tests: Phase 6 API, auth and end-to-end suites now run on real Postgres (PGlite) with real ES256 tokens and a fake Supabase HTTP API, replacing the hand-written D1 fake. Every static Worker query is compile-checked against the Supabase schema. JavaScript/Worker 322/322, Python 17/17.
- Verified against the live Supabase project: Worker role privileges, real signing keys, and a Storage round trip.
- Cutover: merged to `main` (PR #2). The preview Worker (version `b6f2bf4b`) and then the production Worker (version `c787b592`) were deployed with Hyperdrive, so production data now lives in Supabase. Production D1 held no data, so nothing needed copying. A live consented-question write was verified in Supabase and deleted. Rollback target: `7c86d391`. Still open: the Worker service-key secret, Supabase Auth URL settings and SMTP, all needed only for the dormant Phase 6 workspace.

## 2026-11-08 - Candidate security remediation

- RC4 CodeQL closed the two JavaScript findings but reported additional Python findings. Replaced path-derived MIME values with a static allowlist in RC5; RC7 CodeQL passed for both languages with zero open alerts.
- Added candidate-branch validation and CodeQL workflows without changing the Pages deployment trigger.
- Addressed the four RC3 CodeQL findings: cryptographic user IDs and bcrypt-only fail-closed password helpers in the legacy prototype, safe dashboard-script syntax checking, and validated MIME response headers in both Python launcher variants.
- Local regression now passes: JavaScript/Worker 301/301, Python 17/17, focused security/API/analytics/subscription 28/28, migration/restore 9/9. RC7 candidate CI and CodeQL passed; RC8 contains evidence-only updates and reruns the same checks.
- No production deployment, remote migration, analytics activation, or billing activation occurred.

## 2026-11-07 - Production blocker verification

- Added allowlisted aggregate analytics ingestion and tenant-scoped expiry deletion contracts, both disabled unless explicitly enabled; no production event source or retention job is wired.
- Strengthened local migration verification for migrations 0004–0006 and added SQLite integrity/foreign-key checks to backup restoration tests.
- Added security, backup/restore, migration, analytics, payment-sandbox, legal-rule, release-candidate and final blocker evidence documents.
- Final local regression: JavaScript/Worker 299/299, Python 16/16; focused security/deployment/API/analytics/subscription tests 26/26; migration tests 9/9; Wrangler dry-run passed.
- CodeQL, independent scans, at-rest encryption/key rotation, remote D1 staging/recovery and payment sandbox remain blocked. Production was not deployed or migrated; analytics and billing remain disabled.

## 2026-11-07 - Production readiness foundations and reports

- Added the additive Phase 9 migration for aggregate analytics and commercial metadata. It is not applied remotely.
- Added configurable subscription-plan/entitlement helpers and a payment-provider contract; no provider, live billing, or API lifecycle is configured.
- Added a CodeQL workflow; it has not run because the local changes have not been pushed.
- Added Phase 8-12 implementation/readiness reports, database migration report, complete local test results, and updated deployment/recovery guide.
- Reconciled the project progress taxonomy to the current Phase 8-12 scope; prior Phase 8-11 documents are now explicitly historical.
- Full local tests passed (284 JavaScript/Worker, 14 Python). Worker dry-run succeeded; duplicate object keys reported by the bundler were removed. No deployment, production migration, analytics enablement, or billing activation was performed.

## 2026-11-07 - Phases 8-11 local foundations

- Added a metadata-empty legislation title catalog and date-bounded historical source resolver. Unknown dates, URLs, provisions, and legal statuses are not invented; the resolver explicitly does not establish corpus completeness or filing approval.
- Updated `legal-source-registry.js` to reject invalid resolution dates and exclude sources without verified effective-date metadata from date-based resolution.
- Added the fail-closed Phase 9 deployment gate and tests; production service configuration and independent sign-off remain required.
- Added Phase 10 operations queue analytics to the authorized dashboard response. Its feature flag is false by default; cross-tenant analytics are not enabled.
- Added an authenticated, admin-scoped, audited Phase 11 launch-readiness endpoint. Approval flags default to false, and readiness does not implement or activate billing.
- Expanded `PHASE8_11_IMPLEMENTATION_PLAN.md`, `PHASE8_11_IMPLEMENTATION_REPORT.md`, and `PROJECT_PROGRESS.md` with completed local foundations and remaining external/legal acceptance blockers.

## 2026-11-03 - Phase 1 project audit

- Added `PROJECT_AUDIT.md` documenting the selected project scope, architecture, existing features, gaps, baseline test results, and environment limitations.
- Expanded the audit with a categorized file/folder inventory, an explicit features-to-preserve list, calculation limitations, and a gated implementation sequence. Clarified that CGT, industrial-building deductions, and stamp duty are review flags or referenced material, not dedicated calculators in this target.
- Added `PROJECT_PROGRESS.md` to track the seven execution phases.
- Added `TAX_RULES_REGISTER.md` to record the existing ruleset's verification state and central-registry gaps.
- Created a verified pre-documentation backup at `../TaxComp-Prototype-phase1-backup.tar.gz`.
- No existing application code, tax calculations, database migrations, or deployment workflow was changed.
- Baseline: prototype Node tests 127 passed / 1 failed; prototype Python tests 7 passed. The retrieval failure is documented for follow-up.

## 2026-11-03 - Phase 2 tax rules registry

- Expanded `tax-rules.js` into a date-aware, status-aware registry with source hierarchy, metadata validation, historical selection, overlap detection, and immutable approval/status transitions.
- Migrated existing FY 2026/27 calculator values into pending-review records; no official legal sources or provisions were invented, and no record was marked verified.
- Preserved `getRulesForFinancialYear` and added an explicitly named legacy estimate adapter. Existing calculations continue to run and expose pending, not-approved rule metadata.
- Connected VAT, withholding, rental, presumptive, payroll contribution, and import VAT constants to the registry snapshot without adding tax calculators.
- Added historical, overlap, missing, unverified, superseded, approval, and calculator-adapter tests.
- Expanded `.github/workflows/deploy-pages.yml` to run all 11 existing JavaScript test files, including the previously omitted tax-chat suite.
- Updated the tax rules register, tax-law notes, app setup, multi-tax analysis notes, and project progress.
- Verification: focused registry tests 10/10; calculator tests 32/32; Python tests 7/7. The initial Phase 2 full run exposed the documented tax-chat retrieval regression; adding the missing `objection` synonym fixed it. Final full Node suite: 135/135 passing.

## 2026-11-03 - Phase 3 complete provisional tax modules

- Added `corporate-tax.js` and tests for accounting-to-tax reconciliation, add-backs, exempt income, deductions, losses, credits, refunds, and rule provenance.
- Added `capital-allowances.js` and tests for asset-register grouping, tax-pool roll-forward, business-use apportionment, accounting-depreciation separation, disposal review, and historical rule selection.
- Added `industrial-building.js` and tests for construction-period review, qualifying-cost reconciliation, use-ratio assumptions, explicit simulation inputs, disposal/change-of-use blocking, and historical-period-only filing rules.
- Added `capital-gains.js` and tests for acquisition/disposal reconciliation, cost-base adjustments, net proceeds, exemptions, reliefs, chargeable gain, explicit simulation rate handling, classification review, and independent-review filing guardrails.
- Added whole-period rule selection to `tax-rules.js`; periods with no coverage, overlaps, or multiple effective versions fail closed.
- Wired company, asset-register, industrial-building, and asset-disposal interfaces with period, taxpayer category, reviewer, review-date, explicit simulation/filing mode, assumptions, and rule provenance.
- Added all new modules to PWA caching and CI test execution.
- Focused results: registry/period tests 13/13; corporate tests 9/9; capital allowance tests 10/10; industrial-building tests 6/6; capital-gains tests 7/7; existing calculator tests 33/33.
- Full deployment-gate JavaScript suite: 171/171 passed. Python tests: 7/7 passed.
- No legal rates or statutory provisions were invented or verified. All migrated legacy rules remain pending legal review; all outputs remain explicitly provisional and not approved for filing.

## 2026-11-03 - Phase 4 multi-tax-head analysis

- Completed the transaction analysis engine by exposing a scenario-classification API and a report-generation helper that keeps every tax head separate.
- Added Phase 4 regression coverage for classification and report generation to ensure the analyser does not imply a consolidated payable or hide a double-counting risk.
- Preserved the completed UI flow: temporary register, risk flags, missing-fact actions, and separate calculator outputs remain in place while the analysis summary clearly states that no final tax payable is shown.
- Verification: `node --test multi-tax-analysis.test.js` passed 15/15, and the full prototype deployment suite remained green.

## 2026-11-03 - Phase 5 Task 1 legal source registry

- Added `legal-source-registry.js` with validation for source type, authority, document reference, effective dates, revision history, and primary-versus-secondary authority without inventing any law or case citation.
- Added `legal-source-registry.test.js` to cover source classification, historical selection, verification gating, citation integrity, and the separation between rule metadata and source metadata.
- Kept the deterministic calculator, rule registry, and tax logic completely unchanged while adding a conservative source-governance layer that rejects unverified authority and prevents the AI advisor from being mistaken for legal approval.
- Verification: `node --test legal-source-registry.test.js` passed 5/5. The full prototype Node and Python suites were re-run after the patch and remained green.

## 2026-11-03 - Phase 5 Task 2 legal knowledge retrieval

- Added `legal-retrieval.js` to search registered authorities by question, tax head, and period; rank primary sources; select historical records; and emit citations that preserve registry source IDs and document references.
- Added diagnostics for explicitly recorded conflicts, period mismatch, superseded or withdrawn records, incomplete citation metadata, pending-review sources, and the lack of adequate verified primary authority.
- Extended the legal-source registry to preserve incomplete `pending-review` drafts while keeping them out of applicable citations and verified-authority determinations.
- Added `legal-retrieval.test.js`; focused retrieval and registry suites passed 11/11 with no failures.

## 2026-11-03 - Phase 5 Task 3 case-law registry

- Added `case-law-registry.js` for structured case records, controlled verification, authority classification, retrieval, and links to registered legislation, rules, and advisory items.
- Imported the existing curated case entries as unverified records, preserving their source URLs and citations without asserting holdings or legal principles that are not in the structured source data.
- Added `case-law-registry.test.js` for legacy import safety, reviewed record fields and links, foreign jurisdiction handling, unverified references, and search filtering.
- Verification: `node --test case-law-registry.test.js` passed 6/6.

## 2026-11-03 - Phase 5 Task 4 question classification

- Added `tax-question-classifier.js` for deterministic topic/tax-head detection, multi-head recognition, Uganda financial-year parsing, and question-intent classification.
- Added coverage for VAT, PAYE, corporate and individual income tax, rental, withholding, capital gains/allowances, industrial buildings, stamp duty, excise, customs, transfer pricing, international tax/DTAs, procedures, EFRIS, exemptions, accounting, and the required intent categories.
- Generic income-tax wording remains a tentative category; classifier output is routing metadata and does not make an advisory determination.
- Verification: `node --test tax-question-classifier.test.js` passed 6/6.

## 2026-11-03 - Phase 5 Task 5 missing-fact clarification

- Added `tax-clarification.js` with relevant fact prompts selected from detected tax heads and intents; shared requirements are deduplicated and carry their reasons and affected tax heads.
- Preserved supplied false and zero values as facts, separated assumptions, and ensured fact sufficiency never makes a legal conclusion ready.
- Added `tax-clarification.test.js` for VAT, withholding, cross-border transfer pricing, general questions, multi-head deduplication, supplied facts, and malformed inputs.
- Verification: `node --test tax-clarification.test.js` passed 7/7.

## 2026-11-03 - Phase 5 Task 6 advisor orchestration

- Added `ai-tax-advisor.js` to orchestrate classification, clarification, registered source and case retrieval, rules metadata, existing local guidance, optional deterministic calculator calls, and structured Phase 4 transaction analysis.
- Calculator calls require explicit structured inputs. Optional provider output is retained only as an untrusted draft and never replaces the safe local response; provider failures use the deterministic fallback.
- Added a privacy-minimized request audit record and tests for retrieval integration, calculator gating, independent tax-head output, and provider fallback.
- No API provider or credentials are configured. Verification: `node --test ai-tax-advisor.test.js` passed 6/6.

## 2026-11-03 - Phase 5 Task 7 answer and citation controls

- Added `tax-answer.js` with a structured advisory response and canonical citations reconstructed only from legal-source and case-law registry records.
- Required explicit reviewer support attestations and verified, in-period primary legal sources or verified Uganda cases before substantive claims can be emitted; unsupported claims are rejected and diagnosed.
- Routed advisor responses through the structured composer. Unverified references are labeled, calculator output is passed through, and provider drafts remain non-user-facing.
- Verification: `node --test ai-tax-advisor.test.js tax-answer.test.js` passed 11/11.

## 2026-11-03 - Phase 5 Task 8 computation and transaction explanations

- Added `tax-computation-explanation.js` to report existing calculator bases, rates, breakdowns, rule state, and responsible-party roles without independently recalculating.
- Preserved separate VAT, PAYE/NSSF, withholding/recipient-credit, and multi-tax-head views; transaction explanations always suppress aggregate payable.
- Integrated computation and transaction explanations with the advisor's structured response.
- Verification: `node --test tax-computation-explanation.test.js ai-tax-advisor.test.js tax-answer.test.js` passed 16/16.

## 2026-11-03 - Phase 5 Task 9 advisor UI

- Added tax-period selection, client-side topic/intent review, relevant missing-fact prompts, and copy/download conversation actions to the existing chat.
- Passed tax period through the existing Worker request, added server-side period validation and historical retrieval scoping, and added Worker regression coverage.
- Exposed the classifier and clarification scripts to the browser with a same-page scope test; added the new scripts to PWA caching.
- Browser check on a clean Prototype preview succeeded with no page errors or mobile horizontal overflow. Focused UI/chat/Worker tests passed 47/47.
- The existing Worker remains the live provider endpoint; the new Node advisor orchestrator still needs a deployed adapter before the browser can use that API directly.

## 2026-11-03 - Phase 5 Task 10 research reports

- Added `tax-research-report.js` to generate structured reports from citation-controlled advisor output, rebuilding all source/case citations from registries and rejecting unknown IDs.
- Added printable HTML for browser print-to-PDF and Excel-compatible CSV source registers; escaped HTML and neutralized spreadsheet formula prefixes.
- Added advisor integration and tests for report fields, provenance, unsafe content, and export behavior. Verification: 12/12 passed.
- Chat report-download UI remains pending a deployed browser-to-advisor adapter.

## 2026-11-03 - Phase 5 Task 11 security and reliability

- Added explicit provider consent, separate client-fact sharing consent, provider timeout/abort, bounded question/context/draft sizes, and non-user-facing provider drafts to the advisor service.
- Replaced Node-only hashing with Web Crypto, retaining only a request ID and question hash in the audit record; raw questions and client facts are not persisted by the service.
- Tightened date and HTTPS URL validation, bounded retrieval inputs, escaped report HTML, and neutralized spreadsheet formula prefixes.
- Reviewed existing Worker controls: server-side API key, CORS allowlist, rate limits, request/history caps, upstream timeout/retry, untrusted-source instructions, redacted logs, and opt-in retention. Documented the shared-admin-token limitation.
- Focused security/advisor/report tests and editor diagnostics passed; full project gate remains Task 12.

## 2026-11-03 - Phase 5 Task 12 final verification

- Ran every root JavaScript test and Worker `.mjs` suite: 233 passed, 0 failed. Python unittest: 7 passed, 0 failed.
- Added `PHASE5_IMPLEMENTATION_REPORT.md` and `PHASE5_ACCURACY_REVIEW.md` and updated `PROJECT_PROGRESS.md` and `TAX_RULES_REGISTER.md`.
- Phase 5 implementation is complete with explicit limits: no verified legal-source corpus is populated, no new legal provisions/cases were added, and the static chat does not yet call the new Node advisor/report API.

## 2026-11-04 - Verification and CI corrections

- Fixed the Worker legal-source draft update handler to consume the source object returned by the workflow, restoring authenticated pending-draft edits.
- Expanded GitHub Pages CI to discover all root and Worker JavaScript tests and run Python unittest discovery.
- Current verification: JavaScript/Worker 242/242 passed; Python 7/7 passed.
- At this point Phase 6 had not started; Phase 7 remains not started. Legal-source verification and filing approval remain outstanding; no production or legal-readiness claim is made.

## 2026-11-04 - Phase 6 Step 1 domain contracts

- Added versioned synthetic domain contracts for clients, tax profiles, compliance entries, document metadata/review, extraction proposals, scenarios, reports, audit events, and client dashboard aggregation.
- Replaced the syntax-invalid document-management scaffold. File metadata validation is implemented; uploads, byte inspection, scanning, persistence, and UI integration are not.
- Added 13 focused tests. Full JavaScript/Worker suite: 255 passed, 0 failed. Python suite: 7 passed, 0 failed.
- No authentication, session, RBAC, database migration, endpoint, object-storage binding, or real client data was introduced. Step 2 prerequisites remain open; Phase 7 remains out of scope.

## 2026-11-04 - Phase 6 Step 2 server-side identity and tenancy

- Added `worker/phase6-auth.mjs`: PBKDF2-SHA256 password hashing (310,000 iterations, 16-byte salt), 32-byte session tokens in a `__Host-` prefixed cookie with an 8-hour lifetime, CSRF tokens bound to the session, a 5-attempt failed-login lockout for 15 minutes, and 30-minute single-use password-reset tokens.
- Added the six-role permission matrix (`system-admin`, `practice-admin`, `tax-consultant`, `accountant`, `reviewer`, `client`) with explicit per-action grants and deny-by-default checks.
- Bootstrap is one-time; user invitations remain pending until the invited user sets a password, and role/client assignments are scoped to the organization.
- Password reset deliberately returns a generic response and does not disclose whether an account exists. Reset delivery over email only occurs when `PHASE6_EMAIL_SERVICE`, `PHASE6_EMAIL_API_KEY`, `PHASE6_EMAIL_ENDPOINT`, and `PHASE6_APP_ORIGIN` are all configured; otherwise the token is generated and discarded without mail.
- Added `worker/phase6-auth.test.mjs` (4 tests). Verification: 4/4 passed.

## 2026-11-04 - Phase 6 Step 3 tenant-scoped API, persistence and workspace UI

- Added `worker/phase6-api.mjs`, routed from `worker/index.mjs` at `/api/phase6`, with an `ALLOWED_ORIGIN` check and the existing `CHAT_LIMITER` rate limit applied to authenticated endpoints.
- Implemented organization-scoped client CRUD, client tax profiles, compliance obligations, document metadata with review transitions, document-to-tax extraction proposals, scenarios, client reports, and an append-only audit log. Every record write is attributed to the authenticated actor and written to the audit log.
- Added `worker/migrations/0005_phase6_operations.sql` with organization, user, membership, client, obligation, and audit-log tables plus composite foreign keys and database triggers that reject updates and deletes on the audit log. Client TIN uniqueness is scoped per organization.
- Scenarios reuse the existing deterministic multi-tax analysis; reports are created as `review-required` and never assert an established legal position.
- Document uploads go to private object storage (`PHASE6_DOCUMENTS`) only after a mandatory malware-scanner call (`PHASE6_MALWARE_SCANNER`) reports the file clean; magic-byte content sniffing per extension, a 15 MB ceiling, SHA-256 hashing, immutable versioning, human review, and audit records apply. Only metadata is returned to the browser — the object key is stripped from every response. With either binding absent the upload endpoint fails closed with 503 rather than storing unvalidated bytes.
- The entire `/api/phase6` surface is behind a four-flag security gate (`PHASE6_OPERATIONS_ENABLED`, `PHASE6_SECURITY_REVIEWED`, `PHASE6_DATA_AT_REST_REVIEWED`, `PHASE6_BACKUP_RESTORE_VERIFIED`), each of which must be the literal string `true`; otherwise every request returns 503. First-run bootstrap additionally requires the `PHASE6_BOOTSTRAP_SECRET` value in the `X-Phase6-Bootstrap` header.
- Added `phase6-app.js` and the practice-workspace section in `index.html`, gated by the `taxcomp-phase6-api` meta tag. With no endpoint configured the workspace renders "API not configured" and performs no request; there is no mock or browser-local client data.
- Added `worker/phase6-api.test.mjs` (5 tests) and `test_phase6_migration.py` (5 tests covering migration idempotency, per-organization TIN uniqueness, cross-tenant foreign-key rejection, role constraints, audit-log immutability, and backup/restore).
- Verification: focused Phase 6 suites 9/9; full JavaScript/Worker suite 265 passed, 0 failed; Python suite 12 passed, 0 failed.
- Browser check on a local static server: no console errors or failed requests, the practice workspace degraded to "API not configured", and the calculator ran and rendered a results panel with rule IDs and the pending-review disclosure.
- Operational limitations: none of the four security flags is declared in `wrangler.toml`, so the deployed Worker answers every `/api/phase6` request with 503 until they are set after a real security, at-rest, and backup/restore review. The `PHASE6_DOCUMENTS` (R2), `PHASE6_MALWARE_SCANNER`, and `PHASE6_BOOTSTRAP_SECRET` bindings are also undeclared, and no GitHub Actions step sets the Phase 6 API endpoint, so the published static site always shows "API not configured". The Phase 6 tables share the `UNANSWERED_QUESTIONS` D1 database, and email-based password reset is inert until the email bindings and `PHASE6_APP_ORIGIN` are declared. No remote D1 migration was run, no real client data is enabled, and Phase 7 remains not started.
