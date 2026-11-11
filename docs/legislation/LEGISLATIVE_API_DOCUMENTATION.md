# Legislation API

Base URL: the Worker (`https://taxcomp-uganda-chat.<account>.workers.dev`), for example `GET /api/legislation`.

## Public read API: `/api/legislation/*`

- **Read-only.** Only `GET` (and `OPTIONS`) is accepted; anything else returns 405. No admin operations are exposed here.
- **No sign-in.** Legislative structure is public law.
- **Origin.** The `Origin` header must be the site (`ALLOWED_ORIGIN`); otherwise the API returns 403.
- **Rate limit.** Requests share the per-IP limiter (`CHAT_LIMITER`, key `legislation:<ip>`) and return 429 when over the limit.
- **Database.** These endpoints need the Supabase database (`DATABASE_PROVIDER=supabase`); otherwise they return 503.
- **Caching.** Successful responses carry `Cache-Control: public, max-age=300`.

### Common query parameters

| Parameter | Meaning | Validation |
| --- | --- | --- |
| `jurisdiction` | Country code (default `UG`). | Two letters. |
| `edition` | Edition id, e.g. `ug-rev-2024`. | `^[a-z0-9][a-z0-9-]{2,59}$`. 404 if unknown. |
| `onDate` | Date the law is wanted for. The edition covering it is used; otherwise the latest earlier edition, with a warning. | `YYYY-MM-DD`. |
| `page`, `pageSize` | Pagination. | Whole numbers. `pageSize` maximum is per endpoint. |

Every response includes `edition` with these fields:

- `id`, `label`, `effectiveFrom`, `effectiveTo`, `verificationStatus`;
- `match`: one of `requested`, `covers-date`, `latest-before-date` or `latest-captured`;
- `warning`: for example, "may not reflect the law in force on 2026-11-12".

### Endpoints

| Method and path | Returns |
| --- | --- |
| `GET /api/legislation` | Laws in the edition: id, short and official title, chapter, category, tax category, commencement, enabling provision, SI, section and schedule counts, verification status and label, `lastUpdated`, `sourceReference`, and `laterAmendments` (amendment Acts in the Law Register that apply after the edition). Optional filters: `category` (act, regulations, order, rules) and `taxCategory`. `pageSize` maximum is 100 (default 50). |
| `GET /api/legislation/editions` | The editions, coverage gaps and status labels. |
| `GET /api/legislation/search?q=` | Sections whose headings match every word, falling back to any word (`mode`: `all-words` or `any-word`). `s.80`, `section 80` or `80` searches by number, with the named Act first. Optional `law`. `pageSize` maximum is 50 (default 20). Results are ranked by relevance, then Acts before regulations. |
| `GET /api/legislation/{law}` | The law, its Parts (with section counts), schedules and relations. |
| `GET /api/legislation/{law}/sections` | Sections in printed order. Optional `part` (a Roman numeral). `pageSize` maximum is 200 (default 100). |
| `GET /api/legislation/{law}/sections/{number}` | One section and its relations. |
| `GET /api/legislation/{law}/schedules` | Schedules. |
| `GET /api/legislation/{law}/related` | Relations, each `confirmed` or `inferred`. |
| `GET /api/legislation/{law}/verification` | The law's status and its sections by status. |
| `GET /api/legislation/amendments` | The 2026 amendments register (see `AMENDMENTS_2026.md`): `acts` (each amending Act or Bill with its register dates and counts of `changes` and `conflicts`), `amendments` and the evidence and status labels. Optional filters: `law` (e.g. `vata`), `act` (e.g. `eda-amendment-2026`) and `differ=1` (only records where the Bill and the reported enactment differ). Each record has `provision`, `summary`, `previousFigure`, `billFigure`, `reportedFigure`, `figuresDiffer`, `effectiveFrom`, `evidence` (`bill_only`, `bill_and_report` or `report_only`), `billReference`, `billUrl`, `secondarySources`, `note` and its verification status. |

**Section object fields:**

- `id`, `lawId`, `lawTitle`, `chapter`, `category`, `editionId`;
- `sectionNumber`, `citation` (e.g. `Income Tax Act (Cap. 338), s.80`), `heading`;
- `part {number, title}`, `division`, `position`, `flags` (e.g. `numbering-check`);
- `wording` (null unless held), `wordingStatus`;
- `verificationStatus`, `verificationLabel`;
- `evidenceLevel` (`verified_wording`, `unverified_wording`, `verified_structure` or `unverified_structure`) and `evidenceLabel`;
- `officialSourceUrl`, `verifiedAt`.

**Errors** use the shape `{ "error": "message" }`:

| Status | Meaning |
| --- | --- |
| 400 | Invalid parameter. |
| 403 | Origin not allowed. |
| 404 | Unknown law, section or edition. |
| 405 | Not a GET request. |
| 429 | Over the rate limit. |
| 500 | Unexpected error (logged without the request details). |
| 503 | Database not available. |

Examples (the integration test checks these against the real database):

- `search?q=foreign tax credit` → Income Tax Act s.80, Foreign tax credit.
- `search?q=international payments` → Income Tax Act s.82, Tax on international payments (s.137 follows).
- `search?q=place of supply of services` → VAT Act s.16, Place of supply of services.

## Reviewer API: `/api/challenge/review/legislation/*`

These endpoints use the existing Challenge API conventions:

- a Supabase sign-in token and the site Origin;
- reviewer access only (403 for everyone else);
- every write recorded in `challenge_audit_log`, and in `legislation_history` by trigger.

| Method and path | Who | Does |
| --- | --- | --- |
| `GET /api/challenge/review/legislation?edition=&law=&status=&flagged=1&page=&pageSize=` | Reviewers | Editions, all law versions in the edition, matching sections, status labels and `canApprove`. |
| `POST …/{edition}/{law}/status` with body `{status, note, officialSourceUrl, chapter?, commencementDate?}` | Reviewers can set `under_review`, `unverified` or `requires_amendment_review`. Approvers can also set `verified` and `superseded`, and correct `chapter` and `commencementDate`. | `verified` needs `officialSourceUrl` (https) and a note of at least 10 characters. |
| `POST …/{edition}/{law}/sections/{number}/status` with body `{status, note, officialSourceUrl, heading?, wording?, wordingSourceUrl?, wordingVerified?}` | As above. Only approvers can change `heading` or enter `wording`, and wording needs the official source link. | |
| `GET …/compare?law=&from=&to=` | Reviewers | Sections added, removed and changed between two editions. |
| `GET …/history?id=` | Reviewers | The change history of an edition, law version, section, schedule or amendment record. |
| `POST …/amendments/{id}/status` with body `{status, note, officialSourceUrl}` | As for law versions: only approvers can set `verified` (with the enacted Act's link and a note) or `superseded`. | Sets the status of one record in the 2026 amendments register. The `GET` above also returns `amendments`. |

## Chat and advisor (`POST /chat`, `POST /advisor`)

Both responses now include a `legislation` field with these keys:

- `edition`;
- `provisions`, each with `ref`, `citation`, `heading`, `evidenceLevel`, `evidenceLabel`, `verificationStatus`, `flags`, `relatedTo` and `relationBasis`;
- `laterAmendments`;
- `gaps`;
- `citationCheck.unmatched`: section numbers the answer cited that were not retrieved.

A source indicator, `legislation_database`, is added as well. See `TAXCOMP_AI_RETRIEVAL_ARCHITECTURE.md`.
