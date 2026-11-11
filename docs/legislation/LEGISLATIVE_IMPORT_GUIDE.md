# Importing legislation

An import has two steps. The extraction script turns a compendium PDF into structure-only JSON. The import script then turns that JSON into idempotent SQL for one edition.

## 1. Extract the structure

```
npm i --no-save pdfjs-dist@4.10.38
node scripts/compendium-index.mjs "<compendium.pdf>" law-index-<edition>.json
```

What the extractor does:

- It reads the "Arrangement of Sections" (or Regulations) printed at the start of each instrument.
- It keeps only titles, chapters, commencement dates, enabling provisions, statutory instrument numbers, Parts, divisions, section numbers, headings and schedules.
- It drops section wording, footnotes and the compiler's editorial marks (for example bracketed numbers such as "(94)").

**Check the output before importing it:**

- `node --test law-index.test.js` checks the structure. Adapt the counts for a new edition.
- Every instrument needs an id in `IDS` in `scripts/compendium-index.mjs`. The script stops if one is missing.

**Copyright.** The compendium's compiler claims copyright in the compilation, so do not add wording or editorial notes. Wording may only be entered by a legal approver from the official text (see `LEGISLATIVE_VERIFICATION_GUIDE.md`).

## 2. Generate the import SQL

```
node scripts/legislation-import.mjs law-index-<edition>.json \
  --edition ug-cons-2026 \
  --label "Laws of Uganda as amended to 1 July 2026 (FY 2026/27)" \
  --effective-from 2026-07-01 [--effective-to YYYY-MM-DD] [--publication-date YYYY-MM-DD] \
  > import-ug-cons-2026.sql
```

Use a **new edition id** for each edition. Never re-use `ug-rev-2024` for amended law: old editions stay, and historical questions still use them.

What the import SQL guarantees:

- **No duplicates.** Laws, versions, sections, schedules and relations are keyed and upserted.
- **Reviewer work is kept.** A record a reviewer has moved off `unverified` is never overwritten. Unverified records are updated only if they changed.
- **History.** Every insert and change is logged by trigger, with the actor `import:<edition>`.
- **Relations are checked.** Enabling-provision sections and the hand-written relation hints (`RELATION_HINTS`) must exist in the edition, or the script stops.
- **Flags.** `NUMBERING_CHECK` lists captured numbers that need official checking (currently `ita:118I` and `tpca:40E`).

## 3. Apply it

- **Development:** the migration test harness, or `pg.exec(sql)` in a test (see `worker/legislation.test.mjs`).
- **Production:** either add the file as a new migration in `supabase/migrations/` (preferred, so it is reviewed in a PR and runs in CI), or run it once with `npx supabase@2.121.0 db query --linked -f import-<edition>.sql`.

Back up first: `node scripts/taxcomp-backup.mjs export …` (see `scripts/backup-daily.ps1`).

## 4. After importing

1. Check the counts:
   ```
   GET /api/legislation?edition=<id>
   GET /api/legislation/<law>/verification?edition=<id>
   ```
2. Compare with the previous edition in Law and cases admin → Legislation verification → Compare editions.
3. Edition metadata (label, period, publication date) is set by the generated SQL. Correct it with SQL in the Supabase editor if needed; the change is logged by trigger.
4. Ask a legal approver to verify the new edition (see `LEGISLATIVE_VERIFICATION_GUIDE.md`).

## The first import

Migration `20261112000310_legislation_import_ug_rev_2024.sql` was generated with:

```
node scripts/legislation-import.mjs law-index.json --edition ug-rev-2024 \
  --label "Laws of Uganda, Revised Edition 2024 (as in force for FY 2024/25)" \
  --effective-from 2024-07-01 --effective-to 2025-06-30 --imported-at 2026-11-12T02:00:00.000Z
```
