# Phase 5 implementation plan

## Objective

Phase 5 introduces the AI Tax Advisor and Case-Law Intelligence layer for TaxComp 2.0 without altering the working calculator logic, rule registry or filing workflow. The design is intentionally incremental and conservative: it supports factual advisory answers with source traceability, legal distinction, clarification prompts and historical-period review, but it does not create a filing or legal-approval workflow and does not enable automated return filing.

This plan is a design-only phase. No production implementation work begins before the plan is reviewed and approved.

## Existing architecture baseline

The current prototype has a layered architecture that should be preserved:

- Static browser app shell and UI in `index.html`, `app.js`, `styles.css` and the installed PWA assets.
- Deterministic tax calculators in `tax-calculator.js` and specialist modules such as `corporate-tax.js`, `capital-allowances.js`, `industrial-building.js`, `capital-gains.js`, `international-tax.js`, and `multi-tax-analysis.js`.
- Rule registry and source governance in `tax-rules.js`, supported by `TAX_RULES_REGISTER.md` and the registry tests.
- Curated guidance and case-law references in `tax-advisory.js` and `tax-chat.js`.
- Local retrieval and answer-scoring logic in `tax-chat.js` and the worker knowledge layer in `worker/knowledge.mjs` and `worker/index.mjs`.
- Documented constraints in `PROJECT_AUDIT.md`, `PROJECT_PROGRESS.md`, `tax-law-notes.md`, `MULTI_TAX_ANALYSIS.md`, and `CHATBOT_SETUP.md`.

This architecture is intentionally split between deterministic tax arithmetic and non-deterministic advisory interpretation. That separation must remain intact for Phase 5.

## Core design principles for the AI advisory layer

1. Use the existing deterministic calculators as the source of arithmetic explanation, not as a substitute for legal review.
2. Attach every substantive conclusion to a traceable source record.
3. Distinguish legal sources from administrative guidance, secondary commentary and AI-generated reasoning.
4. Respect the rule registry's effective period, historical-period and pending-review semantics.
5. Ask clarifying questions whenever the taxpayer, transaction, year, jurisdiction, tax head or relevant law cannot be safely determined.
6. Never invent a provision, rate, URA procedure, court decision, effective date or filing rule.
7. Never present AI output as a filing-approved calculation or legal opinion.
8. Keep all answers provisional and reviewable.

## Proposed Phase 5 system architecture

### 1. Advisory front end

Planned files or interfaces:

- `tax-chat.js` remains the browser-side conversational entry point and answer rendering layer.
- `app.js` continues to manage page-level UI state and actions, but the AI chat remains a separate assisted workflow.
- `index.html` retains the advisor panel, question form and citation display without changing the existing calculator and form flows.

Responsibilities:

- Capture the user's question and relevant facts.
- Identify the likely tax head, period, taxpayer type and jurisdiction.
- Route to the correct retrieval path: rule-based guidance, legal-source retrieval, case-law retrieval, or clarification flow.
- Display confidence, source labels and warning metadata without implying legal approval.

### 2. Retrieval and source registry

Planned files or interfaces:

- Extend or evolve `tax-advisory.js` into a source-aware advisory catalog with explicit source type labels (`legislation`, `ura_guidance`, `judicial_decision`, `secondary_summary`, `professional_interpretation`, `ai_generated`).
- Keep `tax-rules.js` as the authoritative metadata layer for effective periods and verification states.
- Maintain a legal-source index separate from the rule values used by the calculator engine.
- Add a source-citation registry and evidence object for every answer component.

Required metadata for every answer:

- source type
- title and URL
- legislation / provision / schedule / section reference
- jurisdiction and applicable period
- reviewer or verification date
- whether it is official, advisory, case law or secondary commentary
- citation confidence and any known limitations

### 3. Decision and question-routing layer

Planned logic:

- Detect the likely tax topic from structured fields, question text and the tax-rule context.
- Check whether the issue is a calculator-explained question or a legal-source question.
- Determine whether the user has sufficient facts to answer safely.
- Require clarification for missing facts such as transaction type, period, residency, business-use classification, or whether the issue concerns a filing, appeal or an estimate.

This layer should not call or modify the calculators directly for legal conclusions; it should only explain the existing deterministic engine output when the user asks for calculation explanation.

### 4. Calculation-explanation path

Planned integration:

- Reuse existing calculator outputs from `tax-calculator.js` and the specialist modules, including the rule metadata and assumptions already produced by the calculators.
- Explain results in plain language without re-deriving the underlying legal rate in the AI layer.
- Show a clear distinction between:
  - arithmetic result
  - rule assumptions used
  - pending-review or unverified status
  - legal conclusion that still needs human review

This must remain read-only and must never silently convert an estimate into a filing-approved result.

### 5. Historical-period and legal validity checks

Planned governance:

- The advisor must resolve the relevant period before citing official law.
- Historical questions must use the effective law for that specific year or transaction period.
- If no verified law exists for the requested period, the advisor must state that the legal position cannot be confirmed and ask for the period details or a source to review.
- Historical-note filtering must be aligned with the rule registry and current-year guidance separation already used by `tax-rules.js` and the worker knowledge layer.

### 6. Safety controls and legal guardrails

The Phase 5 architecture must implement these constraints:

- No auto-generated rate, tax provision or case citation without a verified source record.
- No use of AI output as a filing decision or return preparation result.
- No use of unsupported source types as legal authority.
- Any answer with stale, conflicting, or incomplete source metadata must be labeled explicitly.
- Legal conclusions must be traceable to a citation record stored alongside the answer.

### 7. Data flow and module boundaries

Proposed flow:

1. User asks a question in the advisor UI.
2. `tax-chat.js` or new advisor front-end logic retrieves the question and context.
3. A routing layer identifies the likely tax head, period, and factual completeness.
4. A source retrieval layer queries the curated guidance and case-law index plus the rule registry metadata.
5. A legal verification layer filters out unverified, outdated or conflicting material.
6. A response composer builds a conservative answer with:
   - answer summary
   - legal basis
   - rule assumptions
   - calculator explanation (if applicable)
   - missing facts
   - warnings and source list
7. The answer is rendered in the UI with citation links and legal-source status badges.

## Required files and integration points

### Existing files to preserve and extend

- `tax-rules.js` — source of period-aware rule metadata and legal verification status
- `tax-calculator.js` — deterministic arithmetic engine for explanation and inputs
- `multi-tax-analysis.js` — transaction scoping and multi-head classification support
- `tax-advisory.js` — local legal and guidance catalog
- `tax-chat.js` — current answer-extraction and UI integration layer
- `worker/knowledge.mjs` and `worker/index.mjs` — retrieved guidance and scoring metadata
- `index.html` and `app.js` — advisor UI placement and page wiring
- `TAX_RULES_REGISTER.md`, `tax-law-notes.md`, `CHATBOT_SETUP.md`, and `PROJECT_AUDIT.md` — project guardrails and source constraints

### New files to plan for later implementation

- `ai-advisor.js` or equivalent logic module for strict policy/composition
- `advisor-source-registry.js` or `advisor-sources.json` for source type and citation metadata
- `advisor-evidence.js` for traceable answer provenance and legal validation
- `advisor-clarification.js` for fact-gathering and question completeness checks
- `advisor-tests.js` or separate adviser test files with source-trace and safety assertions

## Risks and constraints

### Legal-risk risks

- Unverified legal citations or stale advice may appear authoritative if not clearly labeled.
- Secondary summaries may be mistaken for enacted law.
- Historical questions may be answered using current-period rule assumptions.
- AI-generated explanations may appear to be legal advice or filing advice.

### Functional risks

- Changing `tax-rules.js` or the calculators without evidence could break the verified Phase 3 and Phase 4 results.
- Reusing incomplete legal metadata across modules could create mismatched responses and source claims.
- Overly aggressive matching could surface stale guidance or law for the wrong period.

### Operational risks

- UI clutter could reduce clarity if every answer includes too much citation metadata.
- Source lists may become inconsistent if source categories are not standardized.
- The plan must remain incremental and avoid a broad AI rollout before the source pipeline is stable.

## Testing requirements

Phase 5 should add testing only after the architecture is approved. Required test coverage should include:

1. Source classification tests
   - legislation vs URA guidance vs case law vs secondary commentary vs AI-generated text
   - correct labeling of stale or unverified sources

2. Historical-period tests
   - correct rule selection for the relevant financial year
   - fail-safe behavior when the period is unsupported

3. Clarification tests
   - missing facts trigger a conversational clarification step
   - no unsupported legal conclusion is generated without required facts

4. Calculator explanation tests
   - calculation explanation is derived only from existing engine outputs
   - no direct re-rating or independent tax computation is performed by the AI layer

5. Source-trace tests
   - every substantive legal conclusion has at least one source record
   - citation metadata is complete and correctly classified

6. Regression tests
   - the existing tax calculator and multi-tax tests remain green
   - the advisor layer does not alter or rewrite calculation logic

7. Guardrail tests
   - no invented provision, rate, filing advice, URA procedure or decision is returned
   - unverified, outdated or conflicting information is clearly labeled

## Incremental delivery plan

### Phase 5A. Source governance and architecture gate

- define the advisor source taxonomy
- map legal vs guidance vs case law vs AI-generated content
- define citation metadata objects
- confirm no calculator logic is rewritten

### Phase 5B. Clarification and question routing

- add missing-fact detection
- add year and tax-head routing logic
- keep the answer conservative and evidence-first

### Phase 5C. Calculation explanation integration

- integrate deterministic engine outputs into explanation templates
- add “arithmetic result” vs “legal conclusion” separation
- retain warnings that calculation output is not legal advice

### Phase 5D. Case-law and legal-source retrieval

- add retrieval of official and reviewable materials
- require citations for every legal conclusion
- ensure conflicts, outdated information and unverified sources are marked clearly

### Phase 5E. QA and release gates

- run all existing JavaScript and Python suites
- add advisor-specific tests for source traceability and guardrails
- review all UI copy to ensure it never implies formal approval or filing advice

## Proposed guardrail wording for the UI and answer layer

- “This is a reviewed explanation, not a filing determination.”
- “This answer is based on the information available and may still require verification against the governing law.”
- “The source record for this conclusion is listed below; if the year, facts or law differ, the answer may change.”
- “No legal rate, provision or filing conclusion has been approved by this tool.”

## Final implementation gate

Phase 5 implementation should not start until the following are approved:

- source taxonomy
- citation metadata model
- period resolution and historical-year checks
- missing-facts and clarification flow
- regression and guardrail test plan
- no-file-filing and no-approval policy

At that point, the implementation can proceed incrementally and safely without altering the verified calculator and rules foundation.
