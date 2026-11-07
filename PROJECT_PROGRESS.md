# Project Progress

Project: Opitekene TaxComp 2.0  
Current scope: `TaxComp-Prototype/`  
Updated: 2026-11-04

## Phase Status

| Phase | Status | Summary |
| --- | --- | --- |
| 1. Project audit | Complete | Architecture, existing features, source-control/backup limits, and baseline tests documented in `PROJECT_AUDIT.md`. |
| 2. Tax rules foundation | Complete (verification pending) | Added typed rule records, date/status selection, approval transitions, source hierarchy, and legacy calculator adapters. No legal record is verified or filing-approved yet. |
| 3. Computation accuracy | Complete | Corporate income tax, fixed-asset capital allowances, industrial-building review, and capital-gains review modules are implemented as provisional, rule-gated first slices with explicit sign-off and historical-period controls. |
| 4. Multi-tax-head engine | Complete | The transaction analyser classifies scenario type, keeps tax heads separate, reports risks and missing facts, and avoids presenting a consolidated net payable. |
| 5. AI Tax Advisor and Case-Law Intelligence | Complete with documented limitations | Tasks 1-12 are implemented and verified at the module/workflow level. No verified legal corpus is populated and the new Node advisor/report API is not deployed behind the static chat UI. |
| 6. Business operations | In progress — local implementation tested; deployment/security gates blocked | D1-compatible schema and Worker APIs, local password/session auth, tenant/client scoping, client/compliance/document/scenario/report/engagement workflows, and browser screens are implemented. Remote migration, provider bindings, authenticated browser deployment, backup/restore, and security review are not verified; the operations gate is disabled. |
| 7. Security and commercialisation | Not started | General product-wide roles, tenant controls, and subscription architecture remain outstanding; paid billing is not active. |
| 8. Legal intelligence and tax accuracy | Started — catalog and historical-source resolver implemented; legal corpus remains unverified | Build the verified Ugandan tax knowledge system, legislation repository, government guidance records, case-law intelligence, and historical tax-period resolution without inventing legal content. |
| 9. Secure deployment and production readiness | Started — deployment gate helper and fail-closed checks added | Harden deployment, authenticated browser/API integration, D1/R2/email provider configuration, backups, monitoring, and fail-closed security controls. |
| 10. Scale, analytics and operations | Started — operations analytics service added behind a review gate | Add usage analytics, reporting, practice dashboards, and tenant-safe operational controls that remain within the verified legal and technical guardrails. |
| 11. Commercial launch and governance | Started — authenticated approval gate implemented; billing and external approvals not configured | Prepare legal/commercial controls, billing, support workflows, and a launch gate that requires independent review before live production use. |

### Phases 8-11 local implementation status

- **Phase 8:** A legislation title catalog and period resolver are implemented. Catalog entries intentionally have no invented dates, URLs, provisions, or verification status. The resolver reports matching registered sources and dated amendments, but marks corpus completeness as `not-established` and never approves filing. The authoritative legal text, verified amendment history, URA source ingestion, reviewed case corpus, and qualified reviewer approvals are still outstanding.
- **Phase 9:** The Phase 6 API deployment gate now validates required security flags and core bindings before allowing requests. Production deployment, remote D1 migration, configured R2/email/scanner services, backup/restore evidence, and independent security/privacy sign-off remain external blockers.
- **Phase 10:** Tenant-scoped dashboard counts feed a workload/review-queue summary. The analytics feature flag is explicitly false by default; enabling it still requires governance review. No telemetry export or cross-tenant analytics is enabled.
- **Phase 11:** `/api/phase6/governance/readiness` returns a sanitized launch-readiness checklist to authorized administrators and records an audit event. All approval flags default to false. The endpoint does not activate billing; no payment provider or live subscription workflow exists.
- Final local verification after these changes: JavaScript/Worker 280/280 passed and Python 12/12 passed. These tests do not satisfy external deployment, legal, privacy, security, or payment-provider acceptance gates.

## Phase 6 - Step 1 domain contracts

- Replaced the invalid document-management scaffold with metadata validation and explicit human-review transitions; this does not upload, inspect, scan, or persist file bytes.
- Added versioned client, client-profile, compliance, document-analysis, scenario, report, and audit-event record contracts, plus repository-injected client service methods and a client-scoped dashboard aggregator.
- Compliance deadlines are forced to `unverified`; new document-analysis proposals remain `proposed`; client reports remain `review-required` and `not-established` for legal verification.
- Added 13 synthetic domain tests. JavaScript/Worker suite: 255/255 passing (the existing 242 tests plus the 13 new tests). Python suite: 7/7 passing.
- API contract documentation: `PHASE6_DOMAIN_API.md`. All records/services are domain-only and are not wired into the browser or Worker.
- No D1 migrations, endpoints, authentication, sessions, RBAC, object storage, uploads, or real client data were introduced. The security acceptance gate remains unmet; real client data remains disabled.
- Step 2 remains blocked pending the approved server-side identity source, data/storage decisions, and data-governance prerequisites recorded in `PHASE6_IMPLEMENTATION_PLAN.md`. Phase 7 remains not started.

## Phase 6 Execution Status - 2026-11-04

- **Step 1 — PASSED:** versioned domain contracts, repaired modules, and 13 synthetic tests.
- **Step 2 — IMPLEMENTED — NOT VERIFIED:** additive D1 migration, Worker password/session/authentication middleware, six-role permission checks, organization/client scoping, CSRF, audit records, and a default-off operations flag. Migration tests use local SQLite; remote D1 is not migrated or verified.
- **Step 3 — TESTED — PENDING DEPLOYMENT:** client and tax-profile CRUD, search/filter, archive, assigned-user scopes, and user invite/role/assignment APIs. Email delivery and live API configuration are absent.
- **Step 4 — TESTED — PENDING DEPLOYMENT:** obligation creation/filter/status/payment transitions and evidence associations. Deadlines stay unverified and no returns/payments are submitted.
- **Step 5 — IMPLEMENTED — BLOCKED ON SERVICES:** private R2 upload/download, immutable versions, signature/size checks, scanner adapter, human review and audit. Uploads fail closed until private R2 and malware-scanner bindings are configured and reviewed.
- **Step 6 — IMPLEMENTED — LIMITED:** extraction proposals can be entered and require human confirmation/correction. No OCR/parser provider is installed; automatic extraction is not implemented.
- **Step 7 — TESTED LOCALLY:** scenarios invoke the existing multi-tax engine, preserve separate heads/no consolidated payable, store versions and document links, and generate citation-safe reports with a separate non-self-approvable review.
- **Step 8 — IMPLEMENTED — NOT LIVE:** dashboard and browser screens call real Phase 6 API routes when configured. The static endpoint meta is empty; browser checks cover the no-config state, not authenticated browser-to-Worker operation.
- **Step 9 — IN PROGRESS (re-verified 2026-11-04):** full local gates re-run — JavaScript/Worker 265/265 passed and Python 12/12 passed, including the Phase 6 API/auth suites at 9/9 and the migration suite at 5/5. A browser shell check on a local static server produced no console errors or failed requests, the practice workspace correctly reported "API not configured", and the calculator ran and rendered a results panel carrying rule IDs and the pending-review disclosure. Outstanding: remote D1 migration, R2/scanner/email bindings, backup-and-restore proven against real storage, a configured browser-to-API end-to-end run, live deploy, and security/legal sign-off.
- `PHASE6_OPERATIONS_ENABLED` is not set in `wrangler.toml`, so Phase 6 API operations are disabled by default. No real client data has been used.
- No tax calculator or tax-rule logic was changed. Rule/source verification remains outstanding; automated software tests do not establish tax-law accuracy.
- Phase 7 remains NOT STARTED. Production deployment was not performed.

## Phase 1 Deliverables

- Added `PROJECT_AUDIT.md` with the selected project boundary, architecture, feature inventory, gaps, test baseline, and limitations.
- Added `TAX_RULES_REGISTER.md`; existing registered rules remain pending primary-source verification and not approved for filing.
- Added `CHANGELOG.md`.
- Created and verified `../TaxComp-Prototype-phase1-backup.tar.gz` before adding audit documents. No Git branch could be created because Git metadata and the Git executable are unavailable in this environment.
- No application code, tax logic, database schema, or existing workflow was modified.

## Phase 2 Deliverables

- Added the status-aware registry and approval workflow in `tax-rules.js`.
- Connected existing calculator constants to the legacy estimate snapshot without changing public calculator signatures or intended arithmetic.
- Added date-selection, overlap, missing, pending, superseded-history, and approval-gate tests.
- Expanded the deployment workflow to run all 11 existing JavaScript test files, including the chat regression suite.
- Updated `TAX_RULES_REGISTER.md`, `tax-law-notes.md`, `APP_SETUP.md`, `MULTI_TAX_ANALYSIS.md`, and this progress report.
- No database schema change; the registry is version-controlled JavaScript data. No new tax calculators were started.
- All current registry records remain pending primary-source verification.

## Phase 3 - Corporate income tax, capital allowances, industrial-building, and capital gains

- Added `corporate-tax.js` with accounting-profit reconciliation, user-entered add-backs, exempt income, allowable deductions, loss relief, tax credits, provisional-tax reconciliation, and a detailed schedule.
- Added complete-period rule resolution. Gaps, overlaps, mid-period rule changes, unsupported taxpayer categories, and pending filing rules do not produce a filing liability.
- Simulation mode may apply a pending rule only after explicit selection and displays the required provisional warning, rule ID, and version. Development mode never applies a rate. Filing-ready results also require a recorded reviewer name and review date.
- Connected the company form with tax-period, taxpayer-category, reviewer, review-date, and calculation-mode controls. Existing calculation function signatures remain available.
- Added `capital-allowances.js` with fixed-asset register grouping, acquisition/first-use dates, expenditure, business use, opening tax value, disposals, accounting depreciation shown separately, and historical rule gating.
- Reused the wear-and-tear pool formula with registry-selected rates. Missing/pending rules, unconfirmed classification, requested initial allowances, disposals needing balancing review, gaps, overlaps, mid-period rule changes, and missing reviewer sign-off prevent filing-ready output.
- Added `industrial-building.js` with construction-period review, qualifying-cost reconciliation, use-ratio assumptions, explicit simulation inputs, disposal/change-of-use blocking, and historical-period-only filing rules.
- Added `capital-gains.js` with acquisition/disposal reconciliation, cost base, net proceeds, exemptions, reliefs, chargeable-gain calculation, explicit simulation rate handling, classification review, and independent-review filing guardrails.
- Connected all four calculators to the website form, added responsive asset rows and form controls, and expanded PWA caching and deployment-gate coverage.
- No statutory rate, exemption, or provision was added or verified. The legacy FY 2026/27 values remain pending legal review; provisional outputs are intentionally marked not approved for filing.
- Focused results: registry/period tests 13/13; corporate tests 9/9; capital allowance tests 10/10; industrial-building tests 6/6; capital-gains tests 7/7; existing calculator tests 33/33.
- Full deployment-gate JavaScript suite: 171/171 passed. Python suite: 7/7 passed.
- All forms and modules are connected and PWA-cached. Filing mode shows no final liability/allowance unless applicable rules cover the full period, reviewer sign-off is recorded, and unresolved conditions are absent.

## Phase 4 - Multi-tax-head, scenario and reporting engine

- Delivered the transaction analysis classification API and the assessment-report generator so the analyser can assign a scenario model, scope and summary without inventing a consolidated tax payable.
- Kept all tax heads separate in the assessment report and explicit UI output; no aggregated net payable is shown under any scenario.
- Preserved risk flags, missing-facts requests and temporary-register handling while reinforcing the rule that legal approval is not implied by the calculation engine.
- Added targeted tests covering classification and report generation to protect the no-double-counting workflow.
- Full deployment-gate verification remains required before any filing-facing or commercial release.

## Phase 5 - AI Tax Advisor and Case-Law Intelligence plan

- Documented the Phase 5 architecture in `PHASE5_IMPLEMENTATION_PLAN.md`.
- Confirmed that the legal-advisory work must remain separate from the deterministic calculator engine and the rule registry.
- Defined the required source taxonomy, history-aware retrieval, calculation-explanation boundary, clarification logic, source-trace requirements, and testing gates.
- Explicitly preserved the non-filing and non-approval constraints: no automated return filing, no legal-source invention, no calculator rewrite, and no approved tax advice from AI output.
- Phase 5 Tasks 1-12 are complete with documented limitations: source/case registries, deterministic routing/clarification, advisor orchestration, citation controls, computation explanations, chat enhancements, report generation, security review, and final verification are implemented. The browser does not yet invoke the new Node orchestrator or expose its report action because no adapter endpoint is deployed. No verified legal corpus or approved legal advice is supplied.

## Phase 5 Task 1 - Legal source registry

- Added the legal-source registry to store title, authority, source type, issuance, dates, tax-head linkage, legal reference, review metadata, and primary-vs-secondary authority without inventing law or creating filing approval.
- Added source-type normalization, document-reference validation, secure-URL checks, and historical date resolution so only verified, in-scope records are treated as active authority.
- Kept all calculator rule records and tax logic untouched; only the source governance layer was added.
- Defer the AI adviser and case-law summarisation features until the registry and validation gates are accepted.

## Phase 5 Task 2 - Legal knowledge retrieval and citation engine

- Added `legal-retrieval.js`, a deterministic retrieval engine over registered sources, with question, tax-head, and tax-period inputs; primary-authority ranking; historical-period filtering; and traceable citation metadata.
- Added explicit diagnostics for conflicts (only where conflict metadata is registered), out-of-period or superseded sources, incomplete citations, unverified records, and the absence of adequate verified primary authority.
- Corrected a Task 1 registry limitation: `pending-review` drafts may be stored even when metadata is incomplete, but they cannot be treated as period-applicable citations or adequate verified authority.
- No legal source content, legal conclusions, rules, or calculations were added or invented.
- Task verification: `node --test legal-retrieval.test.js legal-source-registry.test.js` passed 11/11, 0 failed.

## Phase 5 Task 3 - Case-law intelligence registry

- Added `case-law-registry.js` with structured case, court, jurisdiction, judgment date, tax head, issues, facts, decision, reasoning, paragraphs, principle, source document, verification, and cross-link metadata.
- Existing curated case summaries are imported unchanged as unverified references; missing decision details, legal principles, and reviewer conclusions remain explicitly absent.
- Verified case records require complete source and review metadata plus an explicit binding, persuasive, or other-jurisdiction classification. Non-Uganda decisions cannot be classified as Uganda-binding.
- Added retrieval by question, tax head, jurisdiction, and authority class, plus a gated verification operation and links to legal-source, rule, and advisory IDs.
- Task verification: `node --test case-law-registry.test.js` passed 6/6, 0 failed.

## Phase 5 Task 4 - Tax question classification and intent detection

- Added `tax-question-classifier.js` with topic detection for the requested Uganda tax heads and cross-cutting subjects, including EFRIS, procedures, incentives, and deductibility.
- Added multi-head classification and intent detection for general information, specific transactions, computation, historical treatment, compliance, disputes, planning, and professional-advice requests.
- Tax periods can be read from explicit financial-year text or supplied dates; the current financial year is configurable. Generic income-tax wording is marked possible rather than asserted as a specific taxpayer category.
- Classification is deterministic routing metadata only and does not provide legal conclusions.
- Task verification: `node --test tax-question-classifier.test.js` passed 6/6, 0 failed.

## Phase 5 Task 5 - Missing-fact and clarification engine

- Added `tax-clarification.js` with tax-head and intent-specific clarification prompts for transaction date/period, amount and price basis, VAT registration, withholding-agent status, residence, supply/payment nature, related parties, contracts, asset classification/use, customs origin/value, supporting documents, and other relevant facts.
- Deduplicated shared questions in multi-head scenarios and attached the affected tax heads and reasons to each question.
- Preserved false and zero values as confirmed inputs; explicit assumptions remain separate from confirmed facts.
- General tax-information questions do not trigger irrelevant transaction fact requests. Fact completeness never marks a legal conclusion ready; source verification remains separate.
- Task verification: `node --test tax-clarification.test.js` passed 7/7, 0 failed.

## Phase 5 Task 6 - AI tax advisor engine

- Added `ai-tax-advisor.js` as a provider-independent orchestration service integrating classification, clarification, legal-source retrieval, case-law records, rule metadata, local guidance/chat, existing calculators, and the Phase 4 transaction analyser.
- Calculator invocation requires a named existing `calculate*` method and structured input; question text alone never triggers arithmetic. Transaction assessments remain separate and do not produce a consolidated payable.
- An optional provider interface can produce only an untrusted draft. Provider failures fall back to a deterministic response; drafts are not returned as the user-facing answer pending Task 7 citation controls.
- Added a privacy-minimized audit record containing a request ID, question hash, selected heads/period, and evidence IDs, not the raw question or client facts.
- No external API or credentials are configured or required for local retrieval and computation.
- Task verification: `node --test ai-tax-advisor.test.js` passed 6/6, 0 failed; editor diagnostics reported no errors.

## Phase 5 Task 7 - Tax answer generation and citation controls

- Added `tax-answer.js` with the requested structured response fields for direct answer, tax head, taxpayer/transaction, period, legal basis, statutory sources, URA guidance, case law, treatment, computation, assumptions, missing information, verification, compliance implications, limitations, citations, and audit trace.
- Citations are reconstructed from registered source/case records. Claims are included only when a reviewer, review date, rationale, and verified in-period primary source or verified Uganda case are supplied; unsupported claims are rejected with reasons.
- Retrieved or unverified material can appear only as clearly labeled reference metadata and cannot independently support a tax conclusion. Calculator results are passed through without recalculation.
- Integrated the structured composer as the advisor's canonical response path. Provider drafts remain outside the user-facing answer.
- Task verification: `node --test ai-tax-advisor.test.js tax-answer.test.js` passed 11/11, 0 failed.

## Phase 5 Task 8 - Computation explanation and transaction advisory

- Added `tax-computation-explanation.js` to explain existing calculator output fields, bases, rates, breakdowns, responsibility, and rule-verification state without repeating or altering arithmetic.
- Kept supplier output VAT and purchaser input VAT distinct; separated employer PAYE and employee/employer NSSF; and reported payer withholding separately from any conditional recipient credit.
- Added transaction assessment explanations that preserve each tax head, responsible party, status, risks, and required information while forcing aggregate payable to `null` and marking no-double-counting.
- Integrated both explanation paths into the advisor's structured response.
- Task verification: `node --test tax-computation-explanation.test.js ai-tax-advisor.test.js tax-answer.test.js` passed 16/16, 0 failed.

## Phase 5 Task 9 - Tax advisor user interface

- Extended the existing chat with explicit tax-period selection, visible tax-head/intent classification, relevant missing-fact prompts, and copy/download transcript actions.
- Sent the selected period through the existing Worker endpoint, validated the period server-side, and scoped local/Gemini research to that period. Unrepresented historical periods continue to return a no-current-law fallback.
- Kept existing chat history, source indicators, legal-reference details, calculator links, consent behavior, and server-side provider-key handling intact.
- Added browser-global access only for the classifier and clarification modules; added a same-page VM regression for script load collisions and updated PWA caching.
- Browser check on the canonical Prototype preview: no page errors; 390px mobile layout had no horizontal overflow; period, detected heads, clarification prompts, chat sources, and copy/download controls rendered.
- Task verification: `node --test tax-advisor-ui.test.js tax-chat.test.js worker/index.test.mjs` passed 47/47, 0 failed.
- Limitation: the page uses the existing Worker/local chat response flow. The new Node orchestration service is not independently deployed or called by the browser because no adapter endpoint is configured.

## Phase 5 Task 10 - Professional tax research reports

- Added `tax-research-report.js` with report sections for client details, question/scope, facts, assumptions, issues, legal research, case law, analysis, calculator results, transaction risks, recommendations, period, report date, citations, and limitations.
- Reports rebuild citations from the source and case registries; unknown IDs are rejected. Recommendations are only copied from caller-provided content and are marked review-required.
- Added printable HTML suitable for browser print-to-PDF and an Excel-compatible CSV citation register. HTML is escaped, links are HTTPS-only, and CSV cells neutralize spreadsheet formula prefixes.
- Exposed report generation through the advisor service.
- Task verification: `node --test tax-research-report.test.js ai-tax-advisor.test.js` passed 12/12, 0 failed.
- Limitation: the static chat cannot offer a report download until the browser is connected to the Node advisor/report adapter; the report API itself is implemented and tested.

## Phase 5 Task 11 - Security, auditability, and reliability review

- Added explicit provider consent for the new advisor service, a separate opt-in before sharing client facts, a bounded provider timeout/abort, maximum question/context sizes, and a 6,000-character provider draft limit. Provider drafts remain non-user-facing.
- Audit records contain a request ID, SHA-256 question hash, selected tax heads/period, and evidence IDs; raw question, facts, client details, and provider response are not persisted by the advisor module.
- Hardened legal source and case input validation for strict ISO dates and parseable HTTPS URLs; bounded retrieval question length. HTML report content is escaped and CSV formulas are neutralized.
- The existing Worker keeps Gemini keys in server secrets, restricts CORS, applies per-IP rate limits, uses bounded request/history sizes and an upstream timeout, treats retrieved sources as untrusted evidence, and redacts provider logs. Chat history is session-only unless a user explicitly opts into the 90-day unanswered-question queue.
- Existing operational limit: the shared admin dashboard token is not role-based access control; individual permissions and client authorization remain necessary before production client-record use. The new Node advisor/report modules are not deployed behind a browser endpoint.
- Task verification: source/retrieval/case, advisor, report, and classifier/UI security suites passed in focused runs; editor diagnostics showed no errors. The complete Task 12 JavaScript and Python gates also passed.

## Phase 5 Task 12 - Complete verification and reports

- Full JavaScript gate, including Worker `.mjs` suites: `node --test --test-reporter=spec *.test.js worker/*.test.mjs` passed 233/233, 0 failed.
- Full Python gate: `py -m unittest discover -s . -q` passed 7/7, 0 failed.
- Browser review on the Prototype preview confirmed period selection, multi-head classification, clarification prompts, citation/source indicators, transcript actions, and a 390px mobile layout without horizontal overflow or page errors.
- Added `PHASE5_IMPLEMENTATION_REPORT.md` and `PHASE5_ACCURACY_REVIEW.md`; updated this progress file, `CHANGELOG.md`, and `TAX_RULES_REGISTER.md`.
- Phase 5 is complete at the implementation/test level, but not a legal-source release: the verified authority corpus is empty, the Worker chat is not wired to the new Node orchestration/report modules, and no reviewer-verified legal claims were added.

## Verification

- 2026-11-04 baseline re-verification: from `TaxComp-Prototype/`, `node --test *.test.js worker/*.test.mjs` passed 265/265 with 0 failed, and `py -m unittest discover -s . -q` passed 12/12 with 0 failed. Focused Phase 6 Worker suites (`phase6-auth.test.mjs` plus `phase6-api.test.mjs`) passed 9/9. These suites resolve sibling modules against the process working directory, so they must be run from `TaxComp-Prototype/`; invoking them from the parent directory fails with `ENOENT` on `tax-question-classifier.js` rather than indicating a real defect.
- 2026-11-04 follow-up: fixed Worker legal-source draft updates; full JavaScript/Worker gate passed 242/242 and Python gate passed 7/7. GitHub Pages CI now discovers all root and Worker JavaScript tests and runs Python unittest discovery.
- `TaxComp-Prototype/`: `node --test multi-tax-analysis.test.js` passed 15/15, 0 failed.
- `TaxComp-Prototype/`: `node --test --test-reporter=spec *.test.js worker/*.test.mjs` passed 233/233, 0 failed.
- `TaxComp-Prototype/`: `node --test legal-source-registry.test.js` passed 5/5, 0 failed.
- `TaxComp-Prototype/`: `py -m unittest discover -s . -q` passed 7/7, 0 failed.
- `TaxComp/` sibling baseline: `node --test` reported 265 passing; Python unittest reported 4 passing.
- The Phase 1 chat retrieval regression is recorded in `PROJECT_AUDIT.md` and was fixed during this follow-up by adding the missing query synonym.
- Phase 2 focused suites: `tax-rules.test.js` 10 passed; `tax-calculator.test.js` 32 passed.
- Phase 3 focused suites: corporate, capital allowances, industrial building and capital-gains checks all passed; the full deployment suite remained green.
- Phase 4 review of `multi-tax-analysis.js` and `multi-tax-analysis.test.js` confirmed: purchase/sale scenario handling, independent tax-head reporting, supplier/purchaser separation, missing-facts warnings, historical-period safeguards, and no aggregate filing liability.

## Phase 4 defects found and corrected

- Confirmed defect: the transaction classification and assessment-report API was missing, which caused the new Phase 4 regression tests to fail with `TypeError`.
- Corrective action: implemented `classifyTransactionInput` and `buildAssessmentReport` without altering the validated tax-head logic or the no-double-counting design principle.
- Regression protection: added focused tests for classification and report generation.
- Final status after correction: the Phase 4 tests and the full prototype suite both passed.

## Known Limits

- The workspace contains multiple similar project copies and no Git metadata. Phase 2 and later work should remain scoped to `TaxComp-Prototype/` unless the project owner selects a different canonical source.
- The published URL is documented by the project but was not checked live.
- Legal sources and tax treatments remain unverified. The registry's 39 migrated records are pending review and all legacy estimate outputs remain unapproved for filing.
- Historical rule selection is implemented, but no verified historical Uganda rule records are populated; transactions outside the configured legacy estimate period must not be presented as computed under verified historical law.
