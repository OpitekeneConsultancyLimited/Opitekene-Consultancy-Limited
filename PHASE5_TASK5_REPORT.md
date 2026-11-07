# Phase 5 Task 5: Missing-Fact and Clarification Engine

## Scope

Added an evidence-focused clarification engine. It identifies relevant missing facts and asks concise follow-up questions without producing a tax conclusion.

## Implemented

- Added `tax-clarification.js` and `tax-clarification.test.js`.
- Mapped requirements for VAT registration/pricing/supply/use, withholding-agent and recipient facts, tax period/date, amounts, residence, rental, asset allowances, related-party arrangements, customs value/origin, stamp duty, excise, EFRIS, exemptions, and supporting evidence.
- Used Task 4 classification to select relevant prompts, deduplicate shared facts across multiple tax heads, and state why each fact matters.
- Kept supplied facts separate from explicitly supplied assumptions; false and zero values count as supplied facts.
- General information questions do not trigger transaction-only questions.

## Guardrails and limitations

- The engine reports `factsSufficient` but always keeps `conclusionReady` false; legal authority and source verification remain separate.
- The fact requirements are deterministic prompts and should be reviewed as the registered legal corpus and question flows expand.
- No client facts are saved or transmitted by this module.

## Verification

Command: `node --test tax-clarification.test.js`

Result: 7 tests passed, 0 failed.

## Files changed

- Added `tax-clarification.js`.
- Added `tax-clarification.test.js`.
- Updated `PROJECT_PROGRESS.md` and `CHANGELOG.md`.
