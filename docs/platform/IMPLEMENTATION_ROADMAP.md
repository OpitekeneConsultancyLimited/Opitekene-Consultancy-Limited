# Implementation roadmap

This roadmap covers the platform-transformation brief. It is not limited to the website: each item says what changes in the engine (architecture, database, AI, calculators). Status as of 12 November 2026.

| # | Phase | Work | Engine change | Status |
| --- | --- | --- | --- | --- |
| R0 | 1 | Repository audit and its documents | — | **Done** |
| R1 | 2–3 | Separate the corporate site (`/`) from TaxComp (`/taxcomp/`); TaxComp sign-in and navigation; old-link forwarding; publish only site files; restore `styles.css` | Pages build allowlist; service worker covers both; payment return URL | **Done (this release)** |
| R2 | 6 | **Tax-year rule sets for every calculator.** A per-year registry (FY 2025/26, FY 2026/27) for every head, with each rule's source and status; a year selector on each calculator; effective-date lookup by transaction date | `tax-rules.js` registry; tests against independent references per year | Next |
| R3 | 6, 10 | **Central server calculation API.** `/api/calculate` runs the same engine; calculation records saved per user and organisation | New table `calculation_records`; the AI and saved assessments use server results | Next |
| R4 | 5 | **Knowledge ingestion pipeline.** Upload or fetch, extract, keep page and section references, structure, store metadata (title, type, dates, version, source URL, licence), validate, index, review, then use in answers | Builds on `knowledge_records` and `legislation_*`; adds `source_documents` and `knowledge_passages` with passage-level citations | Planned (official texts needed) |
| R5 | 4, 11 | **AI answer structure and quality suite.** A fixed 10-part answer (direct answer, simple explanation, legislation, provision, effective date, computation, implications, actions, sources, limits), labelled current, historical, proposed or not commenced; tests for beginner and professional answers, wrong premises, missing facts, citations and prompt injection | Answer schema in the advisor; `AI_QUALITY_TEST_REPORT.md` | Planned |
| R6 | 8 | **Tax Research view.** Question → research notes with primary and secondary sources side by side; compare editions (old against amended) | Uses the legislation compare API, the amendments register and case law | Planned |
| R7 | 6 | **Stamp duty and excise calculators.** Penalties and interest only once the rates are verified | Rates from the register; refused where the Bill and reported figures conflict | Planned (some figures blocked) |
| R8 | 7 | **Client workspace launch.** Already built with tenant isolation and roles | — | **Blocked:** Phase 6 sign-offs, scanner deployment |
| R9 | 9 | **Security hardening.** MFA for reviewers and approvers; a CSP meta tag after moving inline scripts out; error monitoring dashboard | Supabase MFA enforcement | Planned (MFA policy needs the owner) |
| R10 | 1 | **Debt items D1–D9** (single stylesheet with visual regression tests, split `index.mjs`, WebKit e2e) | — | Planned |

## External dependencies (blocked)

- **Gazetted 2026 Acts** and lawyer verification of the 701 sections, 53 amendment records and 43 knowledge drafts.
- **Secrets:** Anthropic key and Flutterwave keys; Phase 6 sign-offs; scanner deployment.
- **Git history rewrite** to remove the compendium PDF.
