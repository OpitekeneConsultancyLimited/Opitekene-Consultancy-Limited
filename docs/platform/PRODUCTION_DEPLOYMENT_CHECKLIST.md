# Production deployment checklist

Check the front end, the Worker and the database separately. A green Pages deploy says nothing about the Worker or the database.

## Before

- [ ] `npm test`, `npx tsc -p tsconfig.json`, `node scripts/check-dom-contract.mjs`, `node scripts/build-pages.mjs --check` and `node scripts/challenge-e2e.mjs` all pass.
- [ ] The release-candidate workflow passes: migrations replayed on a clean database, backup and restore drill, Worker build. CodeQL is green.
- [ ] Backup taken: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\backup-daily.ps1`. The log shows `OK` and a size.
- [ ] Migrations: `npx supabase@2.121.0 db push --linked --dry-run` lists only this release's migrations.

## Deploy

1. Merge the PR. Pages builds `_site` from the allowlist and deploys.
2. Database: `npx supabase@2.121.0 db push --linked --yes`, only when the release has migrations.
3. Worker: `npx wrangler@4.158.0 deploy`, when the Worker or `wrangler.toml` changed. Note the version id.

## Verify on production

- [ ] **Front end:** `service-worker.js` serves the new cache name; `/` and `/taxcomp/` return 200; `/taxcomp/index.html` has the expected script versions.
- [ ] **Nothing private is published:** a `HEAD` request for a known repository-only file (for example `wrangler.toml`) returns 404.
- [ ] **Worker:** `/api/legislation/editions` returns 200; `/api/challenge/profile` returns 401 when signed out; a request from a foreign origin returns 403; a `/chat` question is answered.
- [ ] **Database:** an endpoint that reads the new tables answers. `select count(*)` on new tables matches the seed counts.
- [ ] **Old links:** `/#workspace` lands on `/taxcomp/#workspace`.

## Rollback

- **Worker:** `npx wrangler@4.158.0 rollback <previous-version-id>`.
- **Front end:** revert the merge commit on `main`; Pages redeploys.
- **Database:** migrations are additive. To restore data, run `scripts/taxcomp-backup.mjs restore` from the latest `.tcbak`, after a drill on a throwaway project.

## One-off: remove the compendium PDF from git history (owner decision)

The PDF is removed from `main` but remains in history. Rewriting history changes every commit id and needs a force push; anyone with a clone must re-clone. From a fresh clone:

```
pip install git-filter-repo
git filter-repo --invert-paths --path "Compendium 2024-2025 LAWS OF UGANDA 2024 Edition_unlocked 3.pdf"
git push --force --all && git push --force --tags
```

Then ask GitHub Support to clear cached views of the old commits.
