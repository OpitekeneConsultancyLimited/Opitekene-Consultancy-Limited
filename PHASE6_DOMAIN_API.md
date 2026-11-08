# Phase 6 Domain API (Step 1)

Date: 2026-11-04  
Status: Domain contracts and local Worker/D1 API implemented. Remote migration, provider configuration, browser-to-Worker endpoint configuration, and production verification remain outstanding.

## Security Boundary

Domain records use `schemaVersion: 1` and carry organization/client ownership fields where applicable. The Worker authenticates an HttpOnly session, checks organization membership/role and client assignment server-side, applies CSRF checks to mutations, and performs organization-qualified D1 queries. The repository-injected client service itself remains a domain component, not an authorization boundary. The browser's `taxcomp-phase6-api` meta endpoint is intentionally empty and Phase 6 remains disabled unless `PHASE6_OPERATIONS_ENABLED=true` is explicitly configured after security review.

All tests use synthetic fixtures. The legacy `authentication.js` and `rbac.js` prototypes are not imported or used by this API. The authentication helper now uses secure UUIDs and requires bcrypt, failing closed when unavailable, but it is not a production identity integration. The production API, email, scanner, object storage, CORS origin, bootstrap secret, and D1 remote migration are not configured or deployed. Never enable the operations flag or use real data until the security gate is met.

## Shared Validators

`phase6-domain.js` exports:

- `SCHEMA_VERSION`
- `assertPlainObject(value, field)`
- `requireText(value, field, maxLength?)`
- `optionalText(value, field, maxLength?)`
- `requireIsoDate(value, field)` for `YYYY-MM-DD`
- `requireIsoInstant(value, field)` for canonical UTC ISO timestamps
- `requireTaxPeriod(value, field?, { nullable? })` for `YYYY/YY`
- `cloneJson(value, field)`
- `requireStringArray(value, field, options?)`

Validation provides shape and serialization checks, not legal or security approval.

## Client Records

`client-model.js` exports `createClientRecord(value, { now? })`, `validateClientRecord(value)`, entity/category/status constants, and existing type predicates. A record requires a client ID, practice ID, legal business name, entity type, taxpayer category, status, timestamps, and an archive timestamp consistent with its status. `schemaVersion` is fixed at 1.

`client-management.js` exports `createClientManagementService({ repository, createId, clock? })`. The injected repository must implement asynchronous `findById(practiceId, clientId)`, `findByTin(practiceId, tin)`, `listByPractice(practiceId)`, `insert(record)`, and `replace(record)` methods. The service exposes `create(authorizedPracticeId, input)`, `get(authorizedPracticeId, clientId)`, `list(authorizedPracticeId, filters?)`, `update(authorizedPracticeId, clientId, changes)`, and `archive(authorizedPracticeId, clientId)`. IDs, ownership, status, and timestamps are server-managed. TIN uniqueness is scoped to the passed practice; Step 2 must additionally enforce it transactionally in D1.

The `authorizedPracticeId` parameter name is a contract reminder only. The service cannot determine whether it came from an authenticated principal.

## Tax Profiles

`client-tax-profiles.js` exports `ClientTaxProfile` and `createClientTaxProfileRecord(value, { now? })`. Profiles require practice and client IDs and preserve explicit boolean `false` values. Dates, enumerations, arrays, notes, and timestamps are validated. A profile is a draft data contract, not verified evidence of a tax obligation or exemption.

## Compliance Entries

`compliance-calendar.js` exports `CalendarEntry`, `createCalendarEntryRecord`, `transitionComplianceEntry`, `filterComplianceEntries`, and `getPaidComplianceEntries`, plus status and obligation-type constants. Deadlines are ISO date strings and FY periods use `YYYY/YY`. Filing/payment status transitions are separate and append status history. `deadlineVerificationStatus` is always set to `unverified`; a caller cannot promote it. The module does not generate statutory deadlines or persist entries.

## Document Metadata and Analysis

`document-management.js` exports `createDocumentRecord`, `transitionDocumentRecord`, file type/size validators, file size limits, and document constants. Records require practice/client ownership, document type, basename, content type, size, and timestamps. New records always start `pending-review`; review transitions require a reviewer ID. The module validates metadata only: it does not inspect bytes, calculate the supplied SHA-256, store files, scan for malware, or create download URLs.

`document-to-tax-analysis.js` exports `createDocumentAnalysisProposal` and `reviewDocumentAnalysisProposal`. A proposal records a document/page, tax head, field, suggested value, and confidence. Creation always sets `proposed` and leaves `confirmedValue` null. Only an explicit accepted/corrected human review creates a confirmed value. This does not calculate tax or establish a legal conclusion; later endpoints must obtain reviewer identity from the authenticated server principal.

## Scenario, Report, and Audit Records

`phase6-records.js` exports `createScenarioRecord`, `transitionScenario`, `createClientReportRecord`, and `createAuditEvent`. Scenarios preserve input/result snapshots, tax period, rule/source IDs, assumptions, missing facts, and status history. Scenario statuses do not include an approved or filing-ready state. New client-report records are forced to `review-required` with `legalVerificationStatus: not-established`. Audit-event records require actor/resource metadata, but Step 1 does not persist them or establish that the actor is authentic.

These record contracts complement, rather than replace, `tax-research-report.js`; report rendering, citations, and exports remain subject to its existing escaping and citation reconstruction controls.

## Client Dashboard

`client-dashboards.js` exports `buildClientDashboard({ practiceId, clientId, client, obligations?, documents?, scenarios?, asOf? })`. It rejects records outside the requested scope and returns counts only; it does not authorize the caller, fetch records, or aggregate financial amounts.

## Local Verification

- Focused domain tests: 13 passed, 0 failed.
- Focused auth tests: 4 passed, 0 failed.
- Focused Worker API tests: 6 passed, 0 failed.
- SQLite migration, tenant/FK, role, immutable-audit, and backup/restore tests: 5 passed, 0 failed.
- Latest full regression gate before this documentation update: JavaScript/Worker 265 passed, 0 failed; Python 12 passed, 0 failed. Re-run before final handoff.
- Browser review: static workspace render/no-config state checked at desktop/mobile; no page errors or horizontal overflow. Authenticated browser-to-Worker workflow not tested because the endpoint is intentionally unconfigured.

## Worker API Routes

Base path: `/api/phase6`. All endpoints require the exact `ALLOWED_ORIGIN`, rate limiting, and D1 binding. Mutations after sign-in require the `X-CSRF-Token` returned by login. Session cookies are HttpOnly, Secure, SameSite=None, fixed-expiry, and are not readable by browser scripts. Responses are `Cache-Control: no-store, private`.

| Method | Route | Access/behavior |
| --- | --- | --- |
| POST | `/auth/bootstrap` | One-time first organization/admin; requires `X-Phase6-Bootstrap` matching server secret. |
| POST | `/auth/login` | Email/password + organization ID; PBKDF2-SHA256, lockout, creates session and CSRF token. |
| GET/POST | `/auth/me`, `/auth/logout` | Return principal or revoke current session; logout requires CSRF. |
| POST | `/auth/password-reset/request`, `/auth/password-reset/confirm` | Generic reset request; mail delivery requires configured HTTPS service binding. |
| GET/POST | `/users` | Organization-scoped user list/invitation. Invitation remains pending until reset link is used. |
| PATCH/PUT | `/users/{id}`, `/users/{id}/clients` | Role/membership update and client assignment replacement; protected by RBAC. |
| GET/POST | `/clients` | Organization/client-scoped search/list and client registration. |
| GET/PATCH/DELETE | `/clients/{id}` | Client read/edit/archive. DELETE archives; it does not erase audit history. |
| GET/PUT | `/clients/{id}/tax-profile` | Read or save structured client tax profile. |
| GET/POST | `/compliance` | List/filter and create obligations; caller-supplied deadlines remain unverified. |
| GET/PATCH | `/compliance/{id}` | Read and update permitted filing/payment transitions. |
| GET/POST | `/documents` | List metadata or upload multipart file. Upload returns 503 unless private R2 and malware-scanner bindings are present. |
| GET | `/documents/{id}`, `/documents/{id}/download` | Scoped metadata and attachment-only private download. |
| GET/POST | `/documents/{id}/versions` | List versions or submit a rescanned replacement version for review. |
| GET | `/documents/{id}/versions/{version}/download` | Scoped download of an immutable prior version. |
| POST | `/documents/{id}/review`, `/documents/{id}/proposals` | Human document review or create an unconfirmed extraction proposal. |
| PATCH | `/proposals/{id}` | Human accept/reject/correct extraction suggestion; never changes calculator output directly. |
| GET/POST/PATCH | `/scenarios`, `/scenarios/{id}` | Authorized list/create using the existing multi-tax engine and versioned review transitions. |
| GET/POST | `/reports` | List or generate a review-required report from an authorized scenario. |
| GET/POST | `/reports/{id}`, `/reports/{id}/review`, `/reports/{id}/download?format=html|csv` | Scoped read/export and reviewer approval/rejection; authors cannot approve their own reports. |
| GET/POST/PATCH | `/engagements`, `/engagements/{id}` | Organization/client-scoped engagement lifecycle and consultant assignment. |
| GET | `/dashboard?clientId=...` | Aggregates actual authorized database rows; deadline counts are explicitly user-entered/unverified. |

## Runtime Configuration Required

- `PHASE6_OPERATIONS_ENABLED=true` is deliberately absent; APIs return 503 by default.
- `PHASE6_BOOTSTRAP_SECRET` must be provisioned as a Worker secret before one-time setup. Never put it in static HTML or source control.
- `taxcomp-phase6-api` in `index.html` must point to an HTTPS Worker endpoint with a same-site/cookie-compatible production origin. It is intentionally empty; browser API workflows are not live.
- `PHASE6_EMAIL_SERVICE`, `PHASE6_EMAIL_ENDPOINT`, `PHASE6_EMAIL_API_KEY`, and `PHASE6_APP_ORIGIN` are required for invitations/password reset.
- `PHASE6_DOCUMENTS` private R2 and `PHASE6_MALWARE_SCANNER` service bindings are required for uploads/downloads. Without them, uploads fail closed.
- Apply and verify `0005_phase6_operations.sql` using a reviewed remote migration/backup procedure before enabling API operations. It has only been tested against local SQLite-compatible execution, not deployed D1.

## Explicitly Not Complete

Remote D1 migration/deployment, email delivery, private object storage, malware-scanner service, production identity/bootstrap configuration, automated backup and remote restore, data-retention policy, and a configured authenticated browser endpoint are not verified. Tax rules and legal sources remain unverified. Real client data must remain disabled until all security, operational, and legal review gates are evidenced.
