# International and domestic tax knowledge base

How TaxComp holds tax knowledge, reasons with it, and keeps it lawful and current.

## Parts

| Part | File | What it does |
| --- | --- | --- |
| Knowledge records | `supabase/migrations/20261112000100_knowledge_base.sql`, `worker/challenge/knowledge.mts` | One row per piece of knowledge, with its source, period, licence and review status. Changes are kept in `knowledge_record_events`. |
| Retrieval API | `worker/challenge/api.mts` | `GET /api/challenge/knowledge?q=&country=&category=&layer=&onDate=` returns verified records for signed-in users, strongest authority first. |
| Review API | `worker/challenge/api.mts` | `GET/POST /api/challenge/review/knowledge` (reviewers: list, add, edit). `POST /api/challenge/review/knowledge/{id}/decision` with `verify`, `reject`, `outdated` or `reopen` (legal approvers only). |
| Admin screen | `challenge-app.js` → Law and cases admin → **Knowledge base** | Drafts to review first; verify, reject, mark outdated (with the record that replaces it), reopen; a form to add a record. |
| Guided reasoning | `intl-tax-reasoning.js` | Turns a plain-language question into facts, asks for the missing ones, and answers in the standard order. |
| Calculations with working | `international-tax.js` | Taxable income, foreign tax credit, double tax relief (credit, exemption and deduction compared), withholding and gross-up, transfer pricing adjustment, and a comparison of two structures. |

## Two layers

- **International principles** (`layer = international`, `country = INTL`). These follow the nine chapters of Brian J. Arnold, *International Tax Primer*, 4th ed. (Kluwer Law International, 2019):
  1. Introduction
  2. Jurisdiction to Tax
  3. Taxation of Residents
  4. Double Taxation Relief
  5. Taxation of Nonresidents
  6. Transfer Pricing
  7. Anti-avoidance Measures
  8. An Introduction to Tax Treaties
  9. Emerging Issues

  The chapter titles come from the book's own table of contents. Each of the 23 topics in the brief has a seeded note. The topic-to-chapter mapping was inferred from the chapter titles, and a reviewer should confirm it.
- **Domestic law** (`layer = domestic`), Uganda first. The 15 tax areas in the brief are listed in `intl-tax-reasoning.js`. Each points to a statute in the law register (`statute_id`).
  - Stamp duty and customs have no register entry yet, and TaxComp says so rather than naming an Act.
  - The register's chapter numbers and links are themselves still marked TODO_VERIFY (see `docs/challenge-assessment/todo-verify.md`).

## Structure of the Uganda tax Acts (`law-index.json`)

`law-index.json` holds the structure of 18 Acts and regulations as in the 2024 revised edition at FY 2024/25: titles, chapters, commencement dates, Parts, 701 section numbers and headings, and Schedules. The instruments are:

- the Income Tax Act;
- the VAT Act;
- the Excise Duty Act;
- the Stamp Duty Act;
- the Tax Procedures Code Act;
- the Tax Appeals Tribunals Act;
- the Lotteries and Gaming Act;
- the EACOP Act;
- the Convention on Mutual Administrative Assistance (Implementation) Act;
- the NSSF Act;
- their regulations: transfer pricing, exporters, VAT deferment, e-invoicing, ADR and NSSF.

**How it was built.** `scripts/compendium-index.mjs` reads the "Arrangement of Sections" printed in a private FY 2024/25 compendium of Uganda tax laws. Acts of Parliament carry no copyright, but the compiler claims copyright in his compilation: its selection, arrangement, tracked amendments and footnotes. So:

- only statutory structure was taken;
- no section wording, footnotes or editorial marks were taken (bracketed numbers such as "(94)" are dropped);
- the compendium is a metadata-only, `restricted_no_text` record.

The owner chose this "structure only" scope on 2026-11-12.

**How it is used:**

- The Knowledge Centre lists it under "Structure of the tax Acts" (`law-index.js`), where Knowledge Centre search finds sections by heading.
- Guided answers cite sections by number and heading, for example "Income Tax Act (Cap. 338): s.80 Foreign tax credit".
- Migration `20261112000200` records the instruments in the database:
  - It adds the five Acts that were missing from the law register.
  - It corrects the Tax Appeals Tribunals Act to Cap. 341. The register had Cap. 345, its number in the 2000 edition.
  - It seeds one draft knowledge record per instrument (`ug.law.*`).

**Caveats** (listed in the file itself):

- Amendments made after FY 2024/25 are not reflected.
- A few inserted sections carry pre-revision numbers (Income Tax Act 118I, Tax Procedures Code Act 40E).
- Nothing has been checked against the Uganda Law Reform Commission's (ULRC) official edition yet (todo-verify B4 and B10 to B15).

**For a later edition:**

```
npm i --no-save pdfjs-dist@4.10.38
node scripts/compendium-index.mjs "<compendium.pdf>" law-index.json
```

Then regenerate the migration's records. Do not add section wording.

## Copyright and licensing

TaxComp holds **no licence** for the *International Tax Primer*, which is © 2019 Kluwer Law International, all rights reserved. Therefore:

- The book is not stored, uploaded or indexed anywhere: not in the repository, the database or the Worker. Its record (`primer-arnold-4e`) is metadata only and has no text.
- The topic notes are TaxComp's own words. They refer to the book by chapter number and title only.
- No page numbers are used: a page number could only come from the book, and it cannot be checked here.
- The notes were written by an AI assistant (`ai_generated = 1`). They start as drafts, and a legal approver must check each one before users see it. Verifying an AI-written note requires a review note saying what it was checked against.

The rules are enforced twice. `validateRecord()` checks them in the Worker, and CHECK constraints check them in the database:

| Licence | May hold |
| --- | --- |
| `restricted_no_text` (copyright, no licence) | Original notes or metadata only. |
| `licensed` (written permission on file) | Short excerpts (2,000 characters at most), with a licence note saying where the permission is kept. |
| `public_law`, `official_publication` | Official text: statutes, court decisions, URA and OECD publications. |
| `original_work` | TaxComp's own writing. |

Two further rules apply to restricted sources and to AI-written notes. A quotation of 25 words or more is rejected, and so is any page reference.

**If a licence is obtained later:** record the permission in `licence_note`, set `licence = licensed`, and add excerpts as `licensed_excerpt`. Any production use of the full text still needs the copyright owner's written permission.

## Source hierarchy

From strongest to weakest (`DEFAULT_HIERARCHY` in `knowledge.mts`):

1. Legislation and amendments
2. Regulations and statutory instruments
3. Court and tribunal decisions
4. Official tax authority guidance
5. Tax treaties
6. International standards (OECD, UN)
7. Textbooks and commentary
8. General AI knowledge

The order can be changed for a single country in `HIERARCHY_BY_COUNTRY`. Uganda uses the default for now. A legal approver should confirm how an in-force treaty ranks against the Income Tax Act before changing it (TODO_VERIFY).

Ranking works in this order:

1. Verified records come first.
2. Records whose applicable period covers the date asked about, and which are not outdated, come next.
3. Ties are broken by the hierarchy, then by how well the record matches the question.

Users never see draft or rejected records. Outdated records are shown last, marked as not current, with the record that replaced them.

## Review workflow

1. Any reviewer adds a record, or edits one. Every save produces a **draft**, so an edit to a verified record withdraws it until it is reviewed again.
2. A legal approver (`challenge_reviewers.can_approve_law`) verifies or rejects it.
3. When the law changes, the approver marks the old record **outdated** and names the replacing record (`superseded_by`).
4. Every step is written to `knowledge_record_events` and the audit log.

## How an answer is built

`analyse()` in `intl-tax-reasoning.js` works through 12 steps:

1. subject
2. countries
3. taxpayer
4. transaction
5. applicable law
6. period
7. knowledge used
8. exemptions and reliefs
9. calculation
10. explanation
11. sources
12. uncertainty

The reader sees these sections in order: what we understood, short answer, the rules, in plain terms, example, calculation, what to do, sources, then assumptions and uncertainty.

- Each rule is labelled as an international principle, Uganda law, or administrative guidance.
- The answer separates tax planning, avoidance and evasion. Evasion is refused. Avoidance is answered with an explanation of the anti-avoidance rules.

**No rates or thresholds are ever stated.** The calculators need the user to enter the rate and its source (Act and section, treaty article or URA notice). Every calculation shows the figures used, the rule, the formula, each step and the assumptions.

## Tests

- `worker/knowledge.test.mjs`:
  - the licence guards;
  - ranking;
  - the seeds (all drafts; the Primer as metadata only; the notes pass the guard);
  - the database constraints;
  - the full review workflow over HTTP.
- `intl-tax-reasoning.test.js`:
  - one walk-through for each persona in the brief: beginner, accountant, business owner, consultant, investor, employee with foreign income, international company;
  - refusal of evasion;
  - every calculation;
  - a check that no answer contains a rate or a page reference.
- `scripts/challenge-e2e.mjs`:
  - the guided question in a real browser, with a reviewed record;
  - the hand-over to the calculator;
  - the rule that a rate needs its source;
  - axe accessibility checks.

## Deployment

1. Apply the migration: `npx supabase@2.121.0 db push --linked`. It adds 2 tables, bringing the total to 55, and seeds about 43 draft records.
2. Deploy the Worker: `npx wrangler@4.158.0 deploy`. It adds the new routes; no new secrets or variables are needed.
3. The site (GitHub Pages) deploys on merge. The service worker cache is `taxcomp-app-v38`.
4. **Owner or lawyer action:** in Law and cases admin → Knowledge base, review the seeded drafts. Check each note against the chapter it cites and against the Income Tax Act, then verify or reject it. Until then, answers show the concept notes only as framework references, and say that no reviewed record was available.

## Known gaps

- No URA publications or regulations have been ingested yet. Add them as records with `source_kind = official_guidance` or `regulation`, with the URA link and publication date.
- The treaty list (which treaties Uganda has in force) is not in the register. Answers tell users to check URA's list.
- Countries other than Uganda have no domestic layer yet. The schema supports them (`country` code), but no records exist.
- Signed-out readers get the guided answer without reviewed records, because the retrieval API requires sign-in.
