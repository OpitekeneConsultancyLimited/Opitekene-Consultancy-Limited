# Production deployment report: legislative knowledge engine

- **Date:** 11 November 2026 (East Africa Time)
- **Release:** PR #23, `feature/legislative-engine`, squash-merged to `main` after release-candidate CI and CodeQL passed.
- **Also applied:** the earlier merged-but-unapplied migrations from PR #21 and PR #22.

## Sequence and evidence

| Step | Result | Evidence |
| --- | --- | --- |
| 1. Review migrations | Done | `20261112000200_law_index.sql`, `20261112000300_legislation_engine.sql` and `20261112000310_legislation_import_ug_rev_2024.sql` were applied in order on PGlite by `npm test` (433/433) and by the CI release candidate. |
| 2. Back up production | Done | `scripts/backup-daily.ps1` ran on 2026-11-11 at 17:58 EAT. Log line: `OK C:\Users\fubaf\TaxComp-backups\taxcomp-2026-11-11.tcbak 13304 bytes` (AES-256-GCM encrypted; off-site copy in OneDrive). |
| 3. Apply migrations | Done | `npx supabase@2.121.0 db push --linked` output: "Applying migration 20261112000200_law_index.sql… 20261112000300_legislation_engine.sql… 20261112000310_legislation_import_ug_rev_2024.sql… Finished supabase db push." |
| 4. Import 18 Acts and 701 sections | Done | Part of migration `20261112000310`. |
| 5. Verify record counts | Done | Production query results are in the table below. |
| 6. Deploy Worker | Done | `npx wrangler@4.158.0 deploy`: "Deployed taxcomp-uganda-chat triggers"; Current Version ID `ab70daf9-0487-444b-b903-e5d1c9f24c7a`. |
| 7. Deploy front end | Done | The GitHub Pages "Deploy GitHub Pages" run on `main` succeeded. The live `index.html` serves `law-index.js?v=law-index-2` and `kb-search.js?v=kb-2`, and contains `#kb-law-index`. The live `service-worker.js` is `taxcomp-app-v40`. |
| 8. Test production API | Done | Results are in the "Live checks" table below. |
| 9. Test live Knowledge Centre | Done (see note) | Live page in Edge at 390 px: 18 Acts rendered from the live API, all badged "Unverified". The three example searches return the expected sections. Expanding the VAT Act shows s.16 and "Schedule 3 – Exempt supplies". No script errors. |
| 10. Test live Law Register | Partly | The production database has the five added Acts and `tata` = Cap. 341 (query below). The register panel (`/api/challenge/law`) needs sign-in. It was tested signed-in in the browser suite (on PGlite), not on the live site, because no test account was used. |
| 11. Test live AI retrieval | Done (local-answer path) | Results are in the "Live checks" table below. |
| 12. Check logs | Not independently verified | `wrangler tail` did not connect within the test window. Every live request returned the expected status and body. No 5xx responses were seen. |

**Note on step 9.** The live site hides `<main>` until a visitor signs in (the existing sign-in gate). The check therefore read the rendered DOM and called the page's own `law-index.js` functions (`search`, `showSection`, `load`, `cite`) in the live page. That exercises the live front-end code against the live API. Clicking through as a signed-in user was covered by the browser test suite, not on the live site.

### Production record counts (step 5)

| Item | Count |
| --- | --- |
| `legislation_laws` | 18 |
| `legislation_law_versions` | 18 |
| `legislation_sections` | 701 |
| `legislation_schedules` | 41 |
| `legislation_relations` | 27 |
| `legislation_history` | 761 |
| Records other than `unverified` | 0 |
| Sections with wording | 0 |
| `knowledge_records` | 62 |

Further checks:

- The `tata` chapter is Cap. 341.
- The five added Acts are present: `cmaa` Cap. 335, `eacop` Cap. 156, `lga` Cap. 334, `nssf` Cap. 230 and `sda` Cap. 339.
- The flagged sections are `ug-rev-2024/ita/s118I` and `ug-rev-2024/tpca/s40E`.

### Live checks (steps 8 and 11)

Production API requests:

| Request | Result |
| --- | --- |
| `GET /api/legislation` | total=18; edition `ug-rev-2024`; match `latest-captured`; warning "…may not reflect the law in force on 2026-11-11". ITA is Cap. 338, 156 sections, unverified, `laterAmendments` = `ita-amendment-2026`. TAT is Cap. 341. |
| Search "foreign tax credit" | Income Tax Act (Cap. 338), s.80 – Foreign tax credit. |
| Search "international payments" | s.82 – Tax on international payments (4 results). |
| Search "place of supply of services" | Value Added Tax Act (Cap. 344), s.16 – Place of supply of services. |
| `GET …/ita/sections/118I` | Flagged `numbering-check`. |
| `GET …/vata/schedules` | 6 schedules. |
| `GET /api/legislation/editions` | 7 coverage gaps, including `ug-local-service-tax`. |
| POST | 405 |
| Foreign origin | 403 |
| `q=a` | 400 |
| Reviewer API without sign-in | 401 |

AI retrieval (step 11), asked on both `/advisor` (tried first by the site's chat) and `/chat`:

| Question | Provisions retrieved |
| --- | --- |
| "What is a foreign tax credit in Uganda?" | s.80, plus s.88 (inferred) |
| "How are international payments taxed in Uganda?" | s.82, s.137, s.84, s.83 |
| "Where are services supplied for VAT purposes?" | VAT s.16, s.15, s.5 (inferred) |

Every answer:

- begins with "Relevant provisions found in TaxComp's legislative database";
- states that the conditions, rates or legal effect cannot be given from headings;
- carries the edition warning;
- has the `legislation_database` source indicator first.

The model-written path (live AI provider with consent and Premium) was tested only with a mocked provider (`worker/legislation.test.mjs`). It was not tested live.

## Not done or outstanding

- No legal verification has been performed. All 18 laws and 701 sections remain *Unverified* until a legal approver checks them against the ULRC 2024 edition (see `LEGISLATIVE_VERIFICATION_GUIDE.md`).
- The 2025 and 2026 amendments are not captured as an edition. They are listed as coverage gaps and as "later amendments not captured".
- The live checks of the signed-in Law Register panel, the signed-in admin workflow and live Worker logs are outstanding (see steps 10 and 12).
