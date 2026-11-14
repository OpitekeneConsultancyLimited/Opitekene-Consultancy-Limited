# Monitoring and alerting

## Checks in place

| Check | Where | When | Alert |
|---|---|---|---|
| Corporate site, TaxComp app and sign-in gate, 7 site files | `scripts/cloud-audit.mjs` (GitHub Actions) | 07:30 and 19:30 Kampala | GitHub issue labelled `audit` (emailed to watchers); closed automatically when checks pass again |
| Worker up, origin lock, signed-out refusal | same | same | same |
| Database reachable through the API, response time (warn above 3 s) | same | same | same |
| Open CodeQL alerts, last Pages deploy, missed audit runs (over 26 h) | same | same | same |
| Worker secrets present, Supabase project health, backups fresh, browser test | `scripts/daily-audit.ps1` (owner PC) | 07:30 when the PC is on | Windows notification and `%USERPROFILE%\TaxComp-audits\latest.html` |
| Legislative watch runs (failures now recorded) | `law_watch_runs` table, reviewer screen | nightly 02:15 UTC | visible to reviewers (not yet alerted) |
| Every production deploy | `deploy-worker.yml` verify step | each deploy | failed workflow run (emailed) |

**Setup (owner):** on GitHub, click **Watch › All activity** (or "Issues") on the repository so audit issues reach your email.

## Gaps (planned)

- AI provider failure rate, payment failures, scanner availability, storage usage and authentication error rates need Worker-side counters (the Phase 8 operations analytics flag is off).
- Backup freshness is checked only on the owner PC (the cloud can't see the backups). Moving backups to a scheduled cloud job would fix both.
- The legislative watch should raise an alert after two consecutive failed runs.
