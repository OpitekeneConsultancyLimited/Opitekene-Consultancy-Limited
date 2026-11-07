# Phase 1: Project Audit

Audit date: 2026-11-03  
Audit scope: `TaxComp-Prototype/` and its deployment configuration. No application source or tax calculations were changed during this audit.

## Project Selection

The workspace contains several related but distinct copies:

- `TaxComp-Prototype/` is the audit target. Its setup guide documents the published GitHub Pages URL, and it contains the multi-tax analysis prototype, EFRIS Worker, and CI deployment workflow.
- `TaxComp/` is a smaller local app copy with its own local runner and Worker. Its baseline tests pass, but it does not contain the prototype's multi-tax analysis or EFRIS workspace.
- `TaxComp-EFRIS-Deploy/` contains a separate Worker deployment tree.
- The active editor file at the workspace root, `get_taxcomp.py`, downloads a public GitHub archive into memory and serves it; it is not the local app source tree.

No `.git` metadata was found in the workspace root or these three folders, and Git is unavailable in the current environment. Branch status and source-control history could not be inspected. The existing `TaxComp.tar` is an 18-entry partial archive of the sibling `TaxComp/` folder, not a backup of this target. A pre-change target backup was created and verified at `../TaxComp-Prototype-phase1-backup.tar.gz` (77 entries; includes `.github` and the multi-tax module).

## Architecture

- **Frontend:** static responsive HTML, CSS, and browser JavaScript; calculator and guidance logic is client-side. The page is installable as a PWA and uses a service worker for cached assets.
- **Local development:** `py run_taxcomp.py` serves the project with Python's standard library at `http://127.0.0.1:8000/`.
- **Tax calculations:** deterministic JavaScript functions. The current rules object is loaded by the calculator, but many additional rate and threshold inputs remain outside the central rules object.
- **Tax guidance:** curated local notes, case summaries, source links, and a local keyword-scored answer matcher. `tax-chat.js` can call a configured endpoint; the page's `tax-chat-endpoint` metadata is blank in this copy.
- **Backend:** optional Cloudflare Worker (`worker/index.mjs`) for chat and protected administrative features. Cloudflare D1 is configured for unanswered-question records and the EFRIS workspace. This is not a PostgreSQL-backed general client-management system.
- **EFRIS workspace:** Worker-backed, client-scoped internal invoice drafts, imports, and reconciliation. The interface explicitly says it is not connected to URA EFRIS and does not submit or fiscalise invoices.
- **Deployment:** the setup guide documents `https://opitekeneconsultancylimited.github.io/Opitekene-Consultancy-Limited/`. `.github/workflows/deploy-pages.yml` deploys to GitHub Pages after a selected Node test command passes. The deployed URL was not live-checked during this local audit.

## Files and Folders

- **Website shell:** `index.html`, `styles.css`, `app.js`, `app-install.js`, `service-worker.js`, `manifest.webmanifest`, and `icons/`.
- **Tax and guidance modules:** `tax-rules.js`, `tax-calculator.js`, `tax-advisory.js`, `tax-chat.js`, `tax-worked-examples.js`, `international-tax.js`, `audit-health.js`, and `multi-tax-analysis.js`. Test files cover the main calculator, guidance, chat, worked-example, audit-health, international-tax, install, and multi-tax behaviors; not every UI/runtime file has a direct test.
- **Worker/backend:** `worker/index.mjs`, `worker/efris.mjs`, `worker/knowledge.mjs`, their `.test.mjs` files, and `worker/migrations/` (`0001_unanswered_questions.sql`, `0002_add_consent_timestamp.sql`, `0003_efris_workspace.sql`). `wrangler.toml` configures Cloudflare deployment and D1.
- **Project and deployment documentation:** `APP_SETUP.md`, `CHATBOT_SETUP.md`, `MULTI_TAX_ANALYSIS.md`, `tax-law-notes.md`, `docs/` (a small documentation site), and `.github/` (Pages workflow and skills).
- **Python utilities and tests:** `run_taxcomp.py`, `capture_compendium.py`, `enhanced_tax_researcher.py`, `opitekene_tax_consultancy.py`, `tax law.py`, `test_capture_compendium.py`, and `test_opitekene_tax_consultancy.py`.
- **Other project-root materials:** two tax-law/budget PDFs, `Taxcomp.ug`, `py`, `get_taxcomp.py`, `free code camp python in 100 days/`, and generated `__pycache__/`. These are not part of the browser app's normal runtime path. The learning-material folder contains a `report card printer` entry.

## Existing Functionality

- Calculator exports in `tax-calculator.js`: individual income tax and smart summary; company tax base and company income tax; PAYE and secondary-employment withholding estimate; wear-and-tear; VAT; rental income; withholding tax; presumptive tax using a user-entered rate; and import/export customs estimates using supplied tariff inputs.
- Company adjustment, payment-credit, rental, and VAT apportionment inputs are estimates; the code does not determine legal deductibility, exemptions, asset classification, treaty eligibility, or input-credit evidence.
- There are no dedicated statutory calculators exported for capital gains, industrial-building deductions, or stamp duty. The multi-tax analyser can flag relevant facts for review, and worked examples include supplied historical figures, but these do not constitute a general computation module.
- Multi-tax transaction screening that keeps tax heads distinct, identifies missing facts, and reuses supported existing calculators. Its stated design is in-memory and preliminary, not a durable approved assessment.
- International-tax arithmetic scenarios, curated advisory guidance, selected tax-case summaries, worked examples, and local tax chat.
- Audit-readiness and tax-health checklists saved in browser storage.
- PWA installation and offline asset caching.
- EFRIS CSV import/reconciliation and internal draft workflows in the Worker; no URA submission or fiscalisation.

## Bugs and Calculation Weaknesses

- **Confirmed functional regression:** the full prototype Node suite fails one chat retrieval test. The answer matcher scores guidance and returns only the top three; the assessment/objection records question does not return the expected `business-tax-audit` note. No repair was made during this audit.
- **Regression-gate gap:** `.github/workflows/deploy-pages.yml` does not run `tax-chat.test.js` or all discovered tests, so the confirmed failure is not caught by the current deployment test command.
- **Not date-selectable for most calculations:** `tax-calculator.js` binds its registered rules to the single current financial year when the module loads. It has no general transaction-date or historical-version argument. Multi-tax analysis can flag unsupported periods, but that does not provide historical computations.
- **Registry coverage is partial:** the central object contains individual/PAYE, standard company, and wear-and-tear rules for FY 2026/27. Other tax-head rates and thresholds are implemented in calculator code or supplied by the user, without a shared per-rule effective date and approval record.
- **Calculation inputs rely on user classification:** company adjustments, deductions, tax credits, VAT treatment/apportionment, rental expenses, withholding category, presumptive rate, and customs rates depend on entered facts or selections. The software validates arithmetic and input shape in many cases, but does not establish that the tax treatment or evidence is legally correct.
- **Requested computation coverage is incomplete:** capital gains, industrial-building deductions, and stamp duty are not standalone interactive calculators in this target. Asset-disposal and building questions are screened or flagged for review rather than computed using a complete historical legal basis.
- **No numeric calculation failure was observed in the baseline tests.** The calculator tests passing is evidence of tested arithmetic paths only, not independent verification of tax law, source accuracy, or real-world liabilities.

## Features to Preserve

- The documented GitHub Pages URL, existing page anchors/navigation, calculator form identifiers and result flows.
- Deterministic calculations kept separate from AI/chat responses; current caveats that estimates are not filing approval or legal advice.
- Current local advisory, case summaries, source links, verification warnings, and historical-year guard behavior.
- The multi-tax analyser's separation of tax heads, explicit missing-fact/risk statuses, and refusal to sum unlike tax amounts into a single liability.
- EFRIS client scoping, Cloudflare Access protections, D1 audit records, CSV import/reconciliation, and the explicit non-fiscalising internal-draft boundary.
- PWA installation/offline shell, local audit/health checklist behavior, and existing Python tools.
- All existing tests and the deployment workflow, while expanding the gate to include the full suite and the currently failing chat regression test.

## Gaps Against the Requested Platform

1. The rules registry covers only FY 2026/27 and explicitly sets `approvedForFiling: false`. Its principal source references are secondary summaries; rule-specific statutory provisions, primary-source verification, reviewer, and per-rule review history are not present for the registered values.
2. Rates and thresholds for additional tax heads remain in calculator code or user-entered inputs rather than a single date-aware registry. Historical rule versions are not maintained; unconfigured years fail rather than use an archived ruleset.
3. The Phase 1 baseline exposed a tax-chat retrieval failure, fixed by adding the missing `objection` keyword to the relevant guidance record. The deployment workflow now runs all 11 JavaScript test files, including `tax-chat.test.js`.
4. The multi-tax analyser is explicitly a non-persistent prototype. EFRIS client records do not amount to a complete client/compliance workspace with filing calendar, returns, payments, PRNs, and correspondence.
5. No general tax computation PDF/Excel/CSV report workflow, document extraction/reconciliation workspace, law-update monitoring process, or subscription/billing implementation was found in the audited app. EFRIS has CSV import/export only.
6. Authentication and client scoping exist for selected Worker workspaces, but a general role-based, multi-entity customer product is not established by this architecture.
7. Tax calculations and source-linked content have automated arithmetic/behavior tests, but tests do not independently establish that rates, legal interpretations, or historical treatments are legally correct.

## Baseline Verification

Commands were run from each app folder before adding these audit documents.

| Project | JavaScript tests | Python tests |
| --- | --- | --- |
| `TaxComp/` | 265 passed, 0 failed | 4 passed, 0 failed |
| `TaxComp-Prototype/` | 127 passed, 1 failed (128 total) | 7 passed, 0 failed |

The Phase 1 prototype failure was `tax-chat.test.js` at the test for records to keep for a tax assessment or objection. It expected the `business-tax-audit` note, which was absent from the returned top-three matches. The retrieval relevance issue was fixed in the Phase 2 follow-up; this remains the historical Phase 1 baseline result.

At the Phase 1 baseline, CI ran a selected test subset. The Phase 2 follow-up expanded the deployment workflow to run all 11 existing JavaScript test files. The audit ran the full local suites.

## Recommended Implementation Sequence

1. **Close the source-of-truth gap:** confirm the canonical repository and establish Git history/branch protection; keep the verified backup until the source tree is under version control.
2. **Build the rules foundation:** add a structured rule register with primary-source URLs and provisions, taxpayer/jurisdiction scope, effective dates, reviewer, review history, versioning, and explicit verification state. Do not mark the current rates filing-ready without review.
3. **Connect existing calculations safely:** move currently hardcoded/user-supplied rate tables into date-aware rule records through adapters, preserving current UI and calculation outputs until each migration is verified. Add historical selection and fail closed for unsupported periods.
4. **Audit and complete computation coverage:** independently reconcile existing outputs to law and examples; add missing capital allowances/industrial-building, CGT, and stamp-duty modules only with sourced methodology, reviewed edge cases, and focused regression tests.
5. **Stabilize multi-tax analysis:** fix the chat regression separately, broaden CI to all relevant tests, then evolve transaction screening with explicit data, review, and approval boundaries before persistence.
6. **Build verified tax intelligence:** improve source retrieval, citations, case-law provenance, and human-approved law-change monitoring; AI remains explanatory and does not determine final liabilities.
7. **Add business operations and production controls:** client/compliance workflows, document review, scenario reports and exports, role/tenant controls, privacy/retention, backups, and subscription preparation. Do not enable billing or automatic filing/payment without approval.

Each step should be delivered and reported as a separate phase with source-backed acceptance criteria and passing regression tests before proceeding.

## Phase 1 Outcome

- Existing features preserved: all application source and configuration files were left unchanged.
- Database changes: none; existing Cloudflare D1 schemas were not modified.
- Files added: `PROJECT_AUDIT.md`, `PROJECT_PROGRESS.md`, `TAX_RULES_REGISTER.md`, and `CHANGELOG.md`.
- Backup: `../TaxComp-Prototype-phase1-backup.tar.gz`, verified readable before these documents were added.
- Tax-law verification: not performed as part of this software audit. No tax rule is upgraded to verified or approved for filing.
- Next phase: not started. Phase 2 should first centralize rule metadata, primary-source citations, effective dates, and verification state while retaining existing calculator behavior behind adapters.

## Phase 2 Update

- Added a strict registry API in `tax-rules.js` for record metadata, date-based resolution, overlap detection, lifecycle statuses, historical superseded records, and review transitions.
- The source priority is legislation, Gazette, URA, then relevant official judicial decisions. Secondary sources remain context only and cannot satisfy verification.
- Migrated 39 existing FY 2026/27 values into explicit `pending-review` records. No official URL, provision, reviewer, or legal verification was fabricated. The strict selector returns no pending rule as applicable.
- Kept existing calculators operational through `getLegacyEstimateRulesForFinancialYear` and the unchanged `getRulesForFinancialYear` API. Estimates remain tagged pending-review and `approvedForFiling: false`.
- No tax calculators were added; no database or migration changes were made.
- Tests after Phase 2 and the acceptance follow-up: focused rules 10/10; calculator 32/32; Python 7/7; complete Node suite 135/135. The chat retrieval regression is fixed, and its test is included in the deployment workflow.
- Legal verification remains outstanding for every migrated rule, and there are no actual verified historical rules in the registry yet.

## Acceptance Checklist

| Area | Current status |
| --- | --- |
| Legal accuracy | No rule is marked verified or active by the strict selector. All 39 legacy records remain pending because official source, provision, effective-date verification, and reviewer evidence are incomplete. |
| Effective dates | Date selection, gaps, and overlaps are handled by the registry. No verified historical Uganda rules are populated; correct real historical computations are therefore not yet available. |
| Rule management | Pending and withdrawn rules are not returned as applicable. Superseded records are historical-only. Legacy calculators still produce estimates, visibly tagged pending and not approved for filing. |
| Integration | Existing calculator signatures and arithmetic regression tests remain intact; rule-backed values are supplied through the compatibility adapter. |
| Testing | Full Node suite and the deployment workflow's 11-file gate pass 135/135; Python tests pass 7/7 locally. |

## Phase 3 Update - Corporate tax, capital allowances, industrial-building, and capital gains

- Added a modular corporate computation engine and company form period/mode controls. The engine reuses the existing company tax-base calculation rather than replacing its formula.
- Corporate tax periods resolve rules by both boundaries and block missing coverage, overlaps, and mid-period rule changes. Filing output also requires a recorded reviewer name and review date.
- Pending legacy rules are used only in explicitly selected simulation mode; filing mode returns no liability unless a verified rule covers the full period and sign-off is captured.
- The corporate schedule returns the taxable-income reconciliation, rate/rule provenance, assumptions, missing information, credits, and payable/refundable result.
- Added a fixed-asset register-based wear-and-tear schedule with acquisition/first-use dates, class, business use, qualifying expenditure, opening tax value, disposals, accounting-depreciation separation, and historical rule gating.
- Historical superseded rules can support only the closed periods they covered. Unresolved initial-allowance/disposal adjustments and missing review sign-off block filing-ready allowance output.
- Added an industrial-building review engine for qualifying-cost reconciliation, construction dates, use percentage assumptions, explicit simulation parameters, and disposal/change-of-use blocking. Filing-ready status is allowed only for verified periods with reviewer sign-off.
- Added a capital-gains engine for acquisition/disposal reconciliation, adjusted cost base, exemptions, reliefs, chargeable-gain calculation, explicit simulation rates, classification review, and reviewer-gated filing output.
- No rates were legally verified. The legacy FY 2026/27 values remain pending review and are intentionally not approved for filing.
- Verification: focused registry/period tests 13/13; corporate tests 9/9; capital allowance tests 10/10; industrial-building tests 6/6; capital-gains tests 7/7; existing calculator tests 33/33; full Node suite 171/171; Python suite 7/7.
