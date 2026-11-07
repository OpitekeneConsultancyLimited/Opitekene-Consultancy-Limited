# Phase 5 Task 1: Legal Knowledge and Source Registry

## Scope

This task implemented the first incremental layer of the Phase 5 legal-advisory architecture without creating an AI chatbot or legal opinion engine. The registry stores source metadata, tracks historical versions, reserves primary vs secondary authority, and prevents unverified material from being treated as final legal authority.

## Implemented behaviour

- Added `legal-source-registry.js`.
- Supported source categories: legislation, regulation, URA guidance, judicial decision, and secondary commentary.
- Enforced validation for:
  - source type normalization
  - required citations and document references
  - secure HTTPS official URLs
  - effective date and end-date ordering
  - source verification metadata for verified sources
  - primary authority classification
- Added historical period resolution so a source is only active when its effective dates and tax-period markers match the query.
- Kept all source records separate from the rule registry. Rule IDs can be linked to sources, but the source registry does not invent law, override tax calculations, or imply filing approval.
- Deferred the AI advisor and case-law summarisation work until after the registry is accepted.

## Guardrails

- No rule logic was rewritten.
- No new statutory text or case law was fabricated.
- Verified records require a reviewer and a valid review date.
- Source records with invalid URLs or missing citations are rejected.
- Pending or unverified records are not treated as authoritative sources for live advisory output.

## Verification

- `node --test legal-source-registry.test.js` passed: 5 tests passing, 0 failing.
- The broader prototype verification remained green after the change: the full JavaScript suite and Python suite passed as part of the standard project gate.

## Files added

- `legal-source-registry.js`
- `legal-source-registry.test.js`
