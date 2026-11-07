# Updated deployment and recovery guide

Date: 2026-11-07  
Status: production operations remain disabled.

## Environments

- **Local prototype:** run `py run_taxcomp.py` from this folder. This is static/local software and must use synthetic data.
- **Staging:** not configured yet. Create separate Pages/Worker configuration and a separate D1/R2/email/scanner set before migration or authenticated browser testing. Never reuse production secrets in a local or staging environment.
- **Production Pages:** GitHub Actions deploys `main` after JavaScript/Worker and Python tests pass.
- **Production Worker:** configured by `wrangler.toml`. Deployment requires reviewed source and authorization. The current Phase 6 API intentionally fails closed.

## Required secrets and bindings

Set secrets with Cloudflare Worker secret management; do not put values in source or `wrangler.toml`. Current Phase 6 prerequisites include `PHASE6_BOOTSTRAP_SECRET`, HTTPS app origin, email service/API credentials, private R2 document storage, and a malware scanner. The database, rate limiter, allowed origin and Gemini credential are separate bindings/configuration. Use least privilege and rotate credentials through the approved provider process.

## Staging database migration checklist

Do not run the following against production without explicit authorization.

1. Confirm the staging database name/ID and Worker environment.
2. Read current history: `npx wrangler d1 migrations list <staging-database> --remote`.
3. Export/backup staging and verify the backup integrity.
4. Apply to staging only: `npx wrangler d1 migrations apply <staging-database> --remote`.
5. Run `py -m unittest test_phase6_migration -v` and full JavaScript/Python suites.
6. Exercise tenant isolation, concurrent writes, workflows, and restore against staging.
7. Record migration history and approval before any production change.

Do not edit applied migration files or delete migration history. Recover using a forward corrective migration or restore a verified backup to an isolated database, then switch only with approval.

## Safe release sequence

1. Review the phase and security reports; resolve or formally accept blockers.
2. Run full tests and CodeQL/security workflows on the proposed commit.
3. Complete staging migration and backup/restore evidence.
4. Obtain security, privacy, legal, database, payment, and launch approvals as applicable.
5. Deploy reviewed Pages/Worker code; keep Phase 6, analytics, and billing flags false until their respective approvals.
6. Run HTTPS/site, Worker, CORS, authentication-disabled-state, and monitoring smoke checks.
7. Verify rollback/recovery path before changing traffic or enabling a feature.

## Current observed production state

- Pages and Worker baseline correspond to commit `6572ba8dbc693dc827bf3cb561f5656bbc41bc86` and Worker version `7c86d391-0856-4b18-b238-8f8b6f8d5264`.
- Pages smoke check returned HTTP 200.
- Phase 6 API returned 503 with required approval flags missing.
- Remote D1 listing reported migrations 0004–0006 pending.
- No remote migration was applied by this work.
- Local CodeQL workflow, migration 0006, analytics and subscription changes are not deployed.

## Rollback and incidents

For static Pages, redeploy a previously reviewed commit through the repository workflow. For Worker, use Cloudflare's documented version/deployment rollback process after checking D1 compatibility. Do not roll back Worker code across a database schema change unless compatibility has been verified. Preserve logs and immutable audit records; escalate suspected data exposure through the organization's incident process.
