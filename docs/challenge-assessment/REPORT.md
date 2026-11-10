# Challenge an Assessment v1: final report (Checkpoint D)

| | |
|---|---|
| Branch | `feature/challenge-assessment` |
| Built on | PR #10 (`front-page-sample`) |
| Date | 2026-11-10 |
| Status | Open PR. Not merged, not deployed, no production migration run, no DNS change. |

## 1. What was built

| Module | What it does | Main files |
|---|---|---|
| **F1** Assessment reader | Accepts a PDF, phone photo, Word (.docx) file or pasted text. Claude `claude-opus-5-5` reads it with a strict JSON schema (`prompts/assessment-extraction.v1.json`); then Gemini, only on a confirmed paid tier; then TaxComp's built-in text reader. One validator checks every result, and malformed output is discarded and never shown. Every field is shown to the user to confirm, correct or mark "can't confirm"; only confirmed values reach the case. | `worker/challenge/ai.mts`, `extract.mts`, `challenge-app.js`, `challenge-docx.js` |
| **F2** Deadline engine | Works from versioned rule data (`procedure_rule_sets` / `procedure_rules`). Counts from the date of service and asks how the notice was served; never uses the issue date. States: on track, urgent (10 days or fewer), possibly lapsed, unknown. Each banner names the rule behind it. Also: URA's 90-day decision watch, the 30-day Tribunal countdown, the 30% payment before the Tribunal, and ADR. Provisional until approved. | `deadlines.mts` |
| **F3** Records reconciliation | The user enters each figure they dispute, with URA's figure and their own, and links supporting documents. Output: a schedule of agreed, disputed and unexplained items. Data is entered by hand; no reading of ledgers or returns. | `classify.mts`, the records step in `challenge-app.js` |
| **F4** Issue classifier | Exactly one outcome per item, with the fixed owner wording kept in `wording.mts`. Penal tax and interest are recomputed whenever the principal changes, using an approved law formula, or otherwise the rate on URA's notice (labelled provisional). A reviewer can override an outcome. | `classify.mts`, `wording.mts` |
| **F5** Law and case research | Point-in-time law register; bills are never applied; LAW-1 note on the 20 August assent. Keyword and issue-tag search of the TAT case register. Each issue lists its provisions and decisions with source links. | `law.mts`, `search.mts`, `record.mts`, `scripts/ulii-ingest.mjs` |
| **F6** Response pack | Draft objection letter, which lists every arguable ground (a late-objection request comes first if needed), evidence checklist, schedules and a one-page briefing. Editable DOCX built in the browser, and PDF through print. Every pack passes the banned-phrase filter. | `pack.mts`, `challenge-docx.js` |
| Review gate and tiers | `review_required` is set by the threshold (UGX 50M, configurable), a procedural issue, a lapsed deadline, Tribunal preparation, or a low-confidence field the user could not confirm. Reviewer queue and sign-off, tied to the version of the case and audited. Tiers come from the existing plans plus per-case grants. | `review.mts`, `api.mts` |
| Security and foundations | Production RLS audit, 13 new tables with RLS and the Worker-only policy, private bucket, owner/reviewer scoping on the server, consent before upload, one-click deletion, append-only audit log, strict TypeScript, typecheck in CI. | migration `20261110000000`, `api.mts`, `store.mts` |
| Site wiring | `#challenge` view, home card, Tax Tools menu, front-page services and toolkit list, Workspace → My assessments, law and case registers in `#kb-laws` / `#kb-cases`, privacy text, service worker v31. | `index.html`, `design.css`, `site-router.js`, `service-worker.js` |

## 2. Acceptance tests

| ID | Result | Evidence |
|---|---|---|
| EXT-1 | **Partial.** Text **20/20 PASS**; PDF and photo **not run** | `worker/challenge-ext1.test.mjs` and `scripts/ext1-harness.mjs score text`. The PDF and photo runs need `ANTHROPIC_API_KEY` (not set; they would cost money). The 40 sample files are rendered in `docs/challenge-assessment/samples/`. |
| DL-1 | **PASS** | 5 days left, urgent banner; the objection letter is the first item in the pack. Unit, API and e2e tests. |
| DL-2 | **PASS** | "Possibly lapsed", a late-objection request is offered, review is required. Unit and API tests. |
| DL-3 | **PASS** | "Deadline unknown: tell us when you received this". Unit, API and e2e tests. |
| LAW-1 | **PASS** (on the brief's dates, which are unverified) | A July 2026 (and August 2026) income tax case applies the ITA 2026 amendment and shows the 20 August assent note. A bill is never applied. |
| CLS-1 | **PASS** | UGX 25M disallowed with invoices missing gives `insufficient_evidence`, with the invoices listed. Unit, API and e2e tests. |
| CLS-2 | **PASS** | An interest arithmetic error gives `computational_error`, with the corrected UGX 1,472,000. Unit and e2e tests. |
| CASE-1 | **Harness PASS, real data FAIL (blocked)** | The search returns at least 3 tagged decisions with ULII links on test records. The register holds **1** real TAT decision: ULII forbids automated collection (D-21), so cases must be entered by a reviewer. |
| SAFE-1 | **PASS** | The filter blocks the four banned phrases and 15 variants. Every pack is filtered (`assertSafe`) and the e2e checks the downloaded pack. Legal notes and pack paragraphs carry provision, rule or case links. Statements without a citation are dropped (`citedOnly`). |
| REV-1 | **PASS** | Disputed principal above UGX 50M returns 403 on the pack until a reviewer signs off; a later edit locks it again. API and e2e tests. |
| PLAIN-1 | **Not run** | Script ready: `plain-1-script.md`. The owner runs it with five people. |

Also required:
- **Unit tests** for deadlines, classifier, recomputation and the filter: `worker/challenge-logic.test.mjs` (19).
- **End-to-end happy path:** `scripts/challenge-e2e.mjs`, **44/44** in Microsoft Edge with the real Worker code on Postgres (PGlite). It covers upload or paste, confirm, deadline, reconcile, classify, research, pack download, deletion and every existing route.
- **Accessibility:** labels, button names, contrast of at least 4.5:1 and keyboard focus are checked automatically. A screen-reader pass is still to do.
- **360 px phone:** no sideways scroll on `#challenge` (checked).
- **Totals:** 388 Node tests pass. `tsc --strict` has 0 errors. CI (Node 22) passed on the server commit.

## 3. Open TODO_VERIFY items

See `todo-verify.md`:
- 10 rule items (periods, counting conventions, the 30% basis);
- 7 statute items (chapters, Acts, dates, links);
- 12 provision versions (text, sections, interest and penal-tax rates);
- the case repository (decisions, summaries, appeal statuses).

Nothing is approved for computation.

## 4. Known limitations and risks

- **No AI reading in production yet.** Without `ANTHROPIC_API_KEY`, photos and PDFs cannot be read; users can paste text, upload Word files or type the figures. **Uploads need `SUPABASE_SERVICE_ROLE_KEY`**, which is also not set; until it is, the upload box answers "not switched on yet".
- **Case repository holds 1 decision** (D-21). Research is thin until reviewers add decisions.
- **Reconciliation is manual entry.** Returns and ledgers are stored as evidence; their figures are not read automatically.
- **Recomputation** covers simple monthly interest and percentage penal tax only.
- **Public holidays** are not modelled in the deadline engine (flag A3).
- **The DOCX writer** produces plain formatting (headings, paragraphs, tables). It opens in Word and LibreOffice, but has no letterhead.
- **The e2e runs in CI** on Chrome (`E2E_BROWSER_CHANNEL=chrome`) and locally on Edge.
- **Pre-existing issue fixed along the way:** the workspace sidebar caused sideways scrolling on phones.
- **Pre-existing issues fixed after release:** the manifest `theme_color` now matches the page (`#0a1f3c`), and every foreign key has an index (migration `20261110000200`, from the Supabase performance advisor).
- **Superseded PR:** PR #11 (`foundations-law-register`) is replaced by this work and can be closed.

## 5. Owner deployment steps (Checkpoint B: each needs your approval)

Merge in order: **PR #10, then this PR**. Then:

1. **Database.** Apply the two new migrations, on a Supabase branch first, then production:

   ```
   npx supabase@2.121.0 db push --linked
   ```

   This creates the 13 tables, the private bucket `assessment-documents` and the seed data. Re-run the advisors afterwards: `npx supabase@2.121.0 db advisors --linked --type security`.
2. **Secrets.** Type the values when prompted; never paste them into chat:

   ```
   npx wrangler@4.158.0 secret put SUPABASE_SERVICE_ROLE_KEY   # legacy service_role JWT (eyJ…), enables uploads
   npx wrangler@4.158.0 secret put ANTHROPIC_API_KEY           # enables PDF/photo reading; set a spend limit in the Anthropic console
   ```
3. **Optional Worker variables** (in `wrangler.toml` `[vars]`):
   - `CHALLENGE_REVIEW_THRESHOLD_UGX` (default 50000000);
   - `CHALLENGE_GEMINI_PAID_TIER = "true"`, only if your Gemini key is billed.
4. **Deploy the Worker:** `npx wrangler@4.158.0 deploy`.
5. **Add reviewers** with the SQL in `user-guide.md` (Supabase SQL editor).
6. **Legal review:** work through `todo-verify.md` in Law and cases admin, then approve the rule set.
7. **Auth hardening:** turn on leaked-password protection, if your plan allows (`rls-audit.md`).
8. **Run PLAIN-1**, and the EXT-1 PDF/photo scoring once the key is set.

## 6. Suggested next work

- **PAYE and withholding tax assessments:** the same engine plus their own outcomes and law topics. This needs PAYE and withholding tax provisions in the register and payroll and withholding evidence lists.
- **Plans and pricing:** decide prices for the "Reviewed pack" (per case) and "Managed dispute". Add them as `billing_plans` rows with `challenge_tier` or as one-off Flutterwave payments; the per-case entitlement table is ready.
- Reading figures from uploaded returns and ledgers (an AI step behind the same validator).
- Retention automation; a public-holiday calendar for deadlines; reminders (email or WhatsApp) before deadlines.
- Ask ULII for permission or a data feed for TAT metadata.

## 7. Existing files changed

| File | Why |
|---|---|
| `index.html` | `#challenge` view, home card, Tax Tools link, "My assessments" pane, law and case register panels, privacy text, front-page services and toolkit mention, "Create a free account" button (fix 1), new scripts |
| `design.css` | Challenge styles; view-hiding rule for `#challenge`; print rules; the workspace sidebar no longer overflows phones |
| `site-router.js` | `challenge` added to the views |
| `service-worker.js` | Cache v31; new scripts in the shell; `/api/` never cached |
| `site-views.test.js` | Fix 1 guards (no repeated sections, every link resolves); `challenge` view allowed |
| `worker/index.mjs` | Routes `/api/challenge/*` to the new handler |
| `worker/pglite-test-support.mjs` | Test stubs for the `anon` / `authenticated` roles |
| `worker/supabase-test-fakes.mjs` | The fake Storage accepts any private bucket |
| `worker/supabase-postgres.test.mjs` | Table count, grants and append-only audit expectations for the new tables |
| `scripts/d1-to-supabase.mjs` | New tables added to the backup and restore order |
| `package.json`, `package-lock.json` | TypeScript 5.9.3 (dev) and the `typecheck` script |
| `.github/workflows/release-candidate.yml`, `deploy-pages.yml` | Run `tsc` in CI |
| `CHANGELOG.md` | Entry for this work |
| `.gitignore` | Ignore the e2e screenshot folder |

New files are in `worker/challenge/`, `prompts/`, `docs/challenge-assessment/`, `scripts/ulii-ingest.mjs`, `scripts/ext1-harness.mjs`, `scripts/challenge-e2e.mjs`, `challenge-app.js`, `challenge-docx.js`, the tests, `tsconfig.json` and the two migrations.
