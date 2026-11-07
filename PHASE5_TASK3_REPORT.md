# Phase 5 Task 3: Case-Law Intelligence Registry

## Scope

Added a structured registry for case-law records while preserving the existing curated case search and summaries. No case was promoted to verified status and no binding or persuasive principle was inferred from a summary.

## Implemented

- Added `case-law-registry.js` and `case-law-registry.test.js`.
- Structured case name/citation, court, jurisdiction, judgment date, tax heads, issues, material facts, decision, reasoning, relevant paragraphs, legal principle, document source, and verification/review fields.
- Added explicit classifications: binding, persuasive, other-jurisdiction, and unverified.
- Added source, tax-rule, and advisory-record links using stable IDs.
- Imported the two existing curated records from `tax-advisory.js` as unverified. Their citations and source URLs are preserved; unrecorded holdings and principles remain null.
- Required full structured content, a source document, reviewer, review date, and an explicit authority class before a case can be verified.
- Added search filters for query, tax head, jurisdiction, and authority class.

## Guardrails and limitations

- Verified case classification is a review assertion, not an automated inference from court name.
- Decisions outside Uganda must be marked `other-jurisdiction`; they cannot be classified as Uganda-binding.
- Imported legacy records remain unverified until a reviewer supplies all required supporting material.
- The registry can store stable cross-links but does not yet verify that linked IDs exist in their respective registries.

## Verification

Command: `node --test case-law-registry.test.js`

Result: 6 tests passed, 0 failed.

## Files changed

- Added `case-law-registry.js`.
- Added `case-law-registry.test.js`.
- Updated `PROJECT_PROGRESS.md` and `CHANGELOG.md`.
