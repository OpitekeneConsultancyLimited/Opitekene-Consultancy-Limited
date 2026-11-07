# Phase 5 Task 2: Legal Knowledge Retrieval and Citation Engine

## Scope

Added deterministic retrieval over the registered legal-source records. Retrieval accepts a question, tax head, and tax period (or date), ranks primary authority ahead of secondary material, and preserves registry-backed citation metadata. It does not generate legal conclusions or add sources.

## Implemented

- Added `legal-retrieval.js` and `legal-retrieval.test.js`.
- Returned source ID, title, authority type, legal provision, effective dates, verification state, reviewer, URL, and document reference in traceable citation objects.
- Supported multiple records and provisions for a single question.
- Matched historical source records by declared tax period and effective date.
- Reported explicit conflict metadata, outdated/out-of-period records, incomplete citation metadata, pending-review/unverified records, and whether adequate verified primary authority was available.
- Limited conflict claims to records explicitly connected with `conflictGroup` or `conflictsWith`; differences between sources are not labeled a legal conflict by inference.
- Extended the source registry to preserve incomplete `pending-review` draft records for review. Draft records are never counted as period-applicable citations or adequate verified authority.

## Guardrails and limitations

- Retrieval is deterministic and provider-independent.
- A returned source is a candidate for research, not proof that its contents support a particular conclusion.
- Adequate verified authority requires at least one complete, verified, in-period primary record categorized as legislation, regulation, or judicial decision.
- The current project registry does not contain a populated corpus of verified legal sources, so normal production queries may correctly return that adequate authority is unavailable.
- No calculator, legal rule, or existing application behavior was changed.

## Verification

Command: `node --test legal-retrieval.test.js legal-source-registry.test.js`

Result: 11 tests passed, 0 failed.

## Files changed

- Added `legal-retrieval.js`.
- Added `legal-retrieval.test.js`.
- Updated `legal-source-registry.js` and `legal-source-registry.test.js` for incomplete pending-review drafts.
- Updated `PROJECT_PROGRESS.md` and `CHANGELOG.md`.
