# Legislative database architecture

## 1. Review of the existing setup (2026-11-12)

| Area | Finding |
| --- | --- |
| Front end | A static site on GitHub Pages: `index.html` plus plain JavaScript modules (UMD, no framework). Views switch on the URL hash (`site-router.js`), and the service worker (`service-worker.js`) caches assets. |
| Back end | One Cloudflare Worker, `taxcomp-uganda-chat` (`worker/index.mjs`, configured in `wrangler.toml`). Its routes are `/chat`, `/advisor`, `/search`, `/api/challenge/*`, `/api/account/*`, `/api/billing/*`, `/api/phase6/*`, `/admin/*`, and now `/api/legislation/*`. It also runs a daily cron job at 02:15 UTC. |
| Database | Supabase Postgres, project `xbooviddjkikcbccfcnw`, schema `taxcomp`, reached through Cloudflare Hyperdrive (`worker/db.mjs` translates `?` placeholders). Migrations live in `supabase/migrations/` and are applied with `npx supabase@2.121.0 db push --linked`. Every table has RLS with a Worker-only policy; `anon` and `authenticated` have no grants. |
| Development | `worker/pglite-test-support.mjs` runs every migration on PGlite (in-process Postgres). Tests use `npm test`; browser tests use `scripts/challenge-e2e.mjs`, which runs the real Worker against PGlite. |
| AI assistant | `/chat` and `/advisor` in `worker/index.mjs`. Retrieval before this change: reviewed local notes (`worker/knowledge.mjs`), the legal-source registry, case law and, with consent and Premium, Claude or Gemini live research. Before this change neither route read the law register or any legislative structure. |
| Law register | `law_statutes` and `law_provision_versions` (Challenge an Assessment), served by `GET /api/challenge/law` (signed-in users only) and shown in the Knowledge Centre under "TaxComp law register". |
| Captured dataset | `law-index.json` (18 laws, 701 headings), built by `scripts/compendium-index.mjs`. Before this change it was read by the browser as a static file; the API and the AI did not use it. Migration `20261112000200` (5 Acts, the TAT chapter fix, knowledge records) had been merged but **not applied** to production, because the deploy permission was refused. |

**Why the live site did not show the new records:**

- Migrations `20261112000100` and `20261112000200` were merged but never pushed to the production database. `db push` was blocked as a production deployment.
- The Worker was last deployed before PR #21. Its new routes (`/api/challenge/knowledge`) were therefore not live.
- The structure data reached the browser only as a static JSON file. No API or AI path read it.

**What this change does:** it moves legislation into Postgres tables, serves them through a public read-only API in the same Worker, connects them to the chat and advisor routes, and adds a reviewer workflow. Nothing else is rebuilt.

## 2. Tables (migration `20261112000300_legislation_engine.sql`)

| Table | Holds | Key and integrity rules |
| --- | --- | --- |
| `legislation_editions` | One edition of the law, e.g. `ug-rev-2024` (the 2024 revised edition, as in force 2024-07-01 to 2025-06-30). | `effective_from`/`effective_to` (the period the law is stated for) are kept separate from `publication_date`. `kind` is `revised_edition`, `amendment` or `consolidation`. `base_edition_id` and `amending_statute_id` (FK to `law_statutes`) let later amendment editions point to their base and their amending Act. |
| `legislation_laws` | Stable identity of an Act or instrument: id, short title, category (act/regulations/order/rules), tax category, jurisdiction. | `statute_id` is an FK to `law_statutes` (the Law Register). `parent_law_id` links regulations to their Act. Regulations must have a parent. |
| `legislation_law_versions` | The law as it stands in one edition: official title, chapter, commencement date, enabling provision, SI number, counts, source reference, verification. | `UNIQUE (law_id, edition_id)`. The chapter must look like `Cap. 338`. |
| `legislation_sections` | Section number, heading, Part, division, position, flags, optional wording, verification. | `UNIQUE (law_version_id, section_number)`. `parent_section_id` is a self-FK for subdivisions. Wording needs a wording status, and verified wording needs its source URL. A generated `search_tsv` column has a GIN index. |
| `legislation_schedules` | The schedules of each law version. | `UNIQUE (law_version_id, position)`. |
| `legislation_relations` | Links between laws and sections. | `basis` is either `confirmed` (stated in the legislation, e.g. an instrument's enabling provision) or `inferred` (suggested from headings, for a reviewer to confirm). |
| `legislation_coverage_gaps` | Legislation known to be missing: Local Service Tax, other subsidiary legislation, customs, tax treaties, the 2025 and 2026 amendments, and section wording. | The AI reports these instead of guessing. |
| `legislation_history` | An append-only log of every insert, status change and content change. | Written by triggers, so it covers every writer (API, import, SQL editor). Ids are derived from the change itself, so a restore does not duplicate rows. The Worker cannot update or delete it. |

**Verification statuses** apply to editions, law versions, sections and schedules: `unverified`, `under_review`, `verified` ("verified against official edition"), `superseded` and `requires_amendment_review`.

A database CHECK means `verified` requires `verified_by`, `verified_at` and `official_source_url`. Only legal approvers (`challenge_reviewers.can_approve_law`) can set `verified` or `superseded`, and the Worker enforces this.

**Access** follows the existing pattern: RLS on, the `taxcomp_worker_all` policy, no `anon` or `authenticated` grants, and no DELETE for the Worker.

## 3. Data (migration `20261112000310_legislation_import_ug_rev_2024.sql`)

This migration is generated by `scripts/legislation-import.mjs` from `law-index.json`. It contains:

- 1 edition;
- 18 laws and 18 law versions (all 10 Acts linked to `law_statutes`);
- 701 sections;
- 41 schedules;
- 27 relations (15 confirmed from enabling provisions, 7 inferred);
- 761 history rows.

Every record starts `unverified`, and no wording is imported. Income Tax Act s.118I and Tax Procedures Code Act s.40E keep their captured numbers and carry the `numbering-check` flag.

## 4. Editions and history

- **Historical questions.** The API and the AI pick the edition by date: `chooseEdition()` in `worker/challenge/legislation.mts`.
  - A date inside an edition's period uses that edition.
  - A later date gets the latest earlier edition, with a warning that it may not show the law in force.
  - The FY 2024/25 edition is therefore treated as historical evidence for 2026 questions.
- **Later amendments.** Amendment Acts in the Law Register (`law_statutes` rows with `kind = 'amendment'`) that apply after an edition ends are listed against each law as "later amendments not captured". This is derived at query time, never written over the edition.
- **New editions.** A new edition is a new `legislation_editions` row with its own law versions and sections. Old editions are never replaced, and `GET /api/challenge/review/legislation/compare` shows what changed between two of them.
- **Re-imports.** Re-importing is idempotent. A record that is no longer `unverified` is never overwritten, and every change is in `legislation_history`.

## 5. Known limitation

A restore from backup re-applies the migrations first, then inserts the backed-up rows with `ON CONFLICT DO NOTHING`. Seeded rows that reviewers changed after the seed therefore come back as seeded. This is the existing behaviour for `law_statutes` too. Their history rows are restored, so the changes can be re-applied from `legislation_history`.
