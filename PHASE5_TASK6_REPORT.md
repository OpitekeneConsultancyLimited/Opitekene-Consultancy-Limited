# Phase 5 Task 6: AI Tax Advisor Engine

## Scope

Added a local, provider-independent orchestration service. It composes existing deterministic and registered components but does not independently generate a legal conclusion.

## Integrated components

- `tax-question-classifier.js` and `tax-clarification.js`
- `legal-source-registry.js` and `legal-retrieval.js`
- `case-law-registry.js`
- `tax-rules.js` registry metadata
- Existing `tax-advisory.js` and `tax-chat.js` as supplemental local material
- Existing `tax-calculator.js` methods
- Existing `multi-tax-analysis.js` transaction assessment

## Guardrails

- A calculator is invoked only when the caller provides a named existing `calculate*` method and structured input. The engine does not parse numbers from question text into calculator inputs.
- Transaction analysis is returned per tax head; no consolidated payable is composed.
- Optional provider output is labeled an untrusted draft and is not placed in the displayed `answer`. Provider errors fall back to a deterministic response.
- Local summaries are explicitly labeled supplemental and not represented as registry-verified primary authority.
- The audit record stores a request ID and question hash plus source/case IDs, not raw question text or client facts.

## Limitations

- No AI provider is configured; no API key or subscription is assumed. The local service remains usable for classification, clarification, retrieval, and existing deterministic calculations.
- Final provider draft citation validation and user-facing response structure are Task 7.
- Browser UI integration is Task 9.

## Verification

Command: `node --test ai-tax-advisor.test.js`

Result: 6 tests passed, 0 failed. Editor diagnostics reported no errors in the new service and tests.

## Files changed

- Added `ai-tax-advisor.js`.
- Added `ai-tax-advisor.test.js`.
- Updated `PROJECT_PROGRESS.md` and `CHANGELOG.md`.
