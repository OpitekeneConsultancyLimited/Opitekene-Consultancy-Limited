# Phase 5 Task 11: Security, Auditability, and Reliability Review

## Implemented safeguards

- The new advisor provider path requires explicit provider consent. Sharing user facts, computation results, and transaction outputs with that provider requires a separate opt-in.
- Advisor questions are limited to 1,600 characters; structured facts, transactions, calculator inputs, and provider context are bounded to 12,000 serialized characters; provider drafts are limited to 6,000 characters.
- Provider requests have a configurable timeout and abort signal. Provider failures or malformed drafts use the deterministic local fallback. Drafts are never returned as the user-facing answer.
- The advisor audit record contains a request ID, SHA-256 question hash, tax heads/period, and evidence IDs. It does not contain raw question text, client facts, or provider output; the module has no persistence layer.
- Source and case records require strict ISO dates and valid HTTPS source URLs. Retrieval questions are length-bounded.
- Citation and report layers resolve IDs against registries. Printable report content is HTML-escaped; CSV values are quoted and formula-prefixed cells are neutralized.
- Browser rendering uses text nodes/text content for user input, source data, and clarification messages.

## Existing Worker controls reviewed

- Gemini keys are read from the server-side `GEMINI_API_KEY` Worker secret; no key is placed in browser code or `wrangler.toml`.
- Worker requests are restricted to the configured site origin, rate-limited per IP, size-limited, and bounded for question/history length.
- Upstream calls have a timeout and limited transient retry. Retrieved web pages are treated as evidence, not instructions; prompts prohibit invented citations and legal claims.
- Provider errors are redacted before logging. Chat history is not persisted by default.
- The unanswered-question queue requires explicit consent, stores only the question with consent metadata, and expires records after 90 days.

## Remaining risks and limitations

- The shared admin dashboard token is not role-based access control. If the EFRIS/admin workspace is deployed for client records, add individual staff identities, per-client authorization, and reviewed retention/backup controls.
- The new Node advisor/report modules are not deployed behind a browser endpoint. The existing Worker chat remains a distinct provider path and does not yet invoke the new legal-source registry or answer composer.
- No verified primary legal-source corpus is populated. The app correctly reports that adequate verified authority is unavailable until reviewed source records are added.
- Human support attestation is required for substantive claims, but its identity is not cryptographically signed or connected to an organizational approval service.
- No live legal update monitor, automated return filing, or payment integration exists.

## Focused verification

- Advisor consent, fallback, size, timeout, and audit tests passed.
- Legal source/retrieval/case-law tests passed after strict URL/date validation.
- Report tests passed for registry provenance, HTML escaping, and CSV formula handling.
- Editor diagnostics reported no errors in the audited modules.

The full JavaScript/Python gate and Phase 5 final reports are reserved for Task 12.
