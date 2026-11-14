# Deployment policy (finding M5)

GitHub `main` is the single source of truth. Production must always correspond to an identifiable commit and release tag.

## Paths

| What | How | Gate |
|---|---|---|
| Website (Pages) | Push to `main` runs `deploy-pages.yml`: tests, then an allowlisted build, then deploy | CI green |
| Worker (API) | Push to `main` touching Worker code runs `deploy-worker.yml`: checks, then staging (preview Worker), then **approval**, then production, live verification and a tag `worker-YYYYMMDD-HHMM-<sha>` | Approval by a required reviewer of the `production` environment |
| Database migrations | `npx supabase@2.121.0 db push --linked --dry-run`, then `db push`, run by an engineer after a fresh backup | Migration merged; CI applied it to PGlite; backup taken |
| Rollback (Worker) | Run "Deploy Worker" manually with `rollback_version` set to the previous version ID (shown in the production job's summary) | `production` environment approval |
| Rollback (database) | Write a new forward migration. Applied migrations are never edited (CI enforces this). For data loss, follow the [recovery runbook](BACKUP_RECOVERY_RUNBOOK.md) | Management approval |

## One-time setup (owner)

1. **Cloudflare API token.** In Cloudflare › My Profile › API Tokens, create a token from the "Edit Cloudflare Workers" template, limited to this account. Then in GitHub › Settings › Secrets and variables › Actions, add the secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` (the account ID is in the Workers dashboard sidebar).
2. **Environments.** In GitHub › Settings › Environments, create `staging` (no rules) and `production` with **Required reviewers**: the owner and a deputy. Turn on "Prevent self-review" if there are two people.
3. After the first successful CI deploy, stop running `wrangler deploy` by hand. A manual deploy is allowed only in an incident, and it must be recorded in the incident log and followed by a normal CI deploy of the same commit.

Until step 1 is done, the deploy workflow stops at staging with a warning. Nothing deploys and nothing breaks.

## Rules

- No direct pushes to `main`: everything goes through a pull request with green CI (branch protection).
- Don't deploy on Fridays after 15:00 Kampala time, or before public holidays, unless fixing an incident.
- Every production deploy is verified automatically (`/chat` returns 405, a foreign origin gets 403, signed-out requests get 401, the amendments API returns 200). A failed verification means rolling back to the version in the job summary.
- Staging currently shares the production database (finding N5). Don't run data-changing tests against staging until it has its own project.
