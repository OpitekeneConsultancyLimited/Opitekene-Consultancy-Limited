# Phase 5 Task 4: Tax Question Classification and Intent Detection

## Scope

Added a deterministic question classifier for routing and fact gathering. It does not answer tax questions or determine legal treatment.

## Implemented

- Added `tax-question-classifier.js` and `tax-question-classifier.test.js`.
- Detected the required tax heads and topics: VAT, PAYE, corporate and individual income tax, rental, withholding, capital gains, capital allowances, industrial buildings, stamp duty, excise, customs/import taxes, transfer pricing, international taxation, DTAs, tax procedures/penalties, EFRIS, exemptions/incentives, and accounting/deductibility.
- Detected general-information, transaction, computation, historical-treatment, compliance, dispute, planning, and professional-advice intents; multiple intents can be returned.
- Supported multiple tax heads in one question and structured tax-head input.
- Parsed explicit financial years and transaction dates into Uganda financial years, with a configurable current year.
- Marked generic income-tax wording as a possible individual-income category rather than an asserted taxpayer classification.

## Guardrails and limitations

- Classification uses deterministic phrase patterns; it is not an AI model and may need later vocabulary expansion based on reviewed query examples.
- Head and intent matches are routing hints only. They are not factual findings or tax conclusions.
- Existing transaction classification in `multi-tax-analysis.js` remains unchanged.

## Verification

Command: `node --test tax-question-classifier.test.js`

Result: 6 tests passed, 0 failed.

## Files changed

- Added `tax-question-classifier.js`.
- Added `tax-question-classifier.test.js`.
- Updated `PROJECT_PROGRESS.md` and `CHANGELOG.md`.
