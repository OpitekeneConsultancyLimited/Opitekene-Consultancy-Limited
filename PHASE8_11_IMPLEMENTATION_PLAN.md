# Phase 8-11 implementation plan

This is the additive implementation record for Phases 8-11. The local code foundations are implemented, but external and review-dependent acceptance items remain blocked; this document does not declare the product production-ready.

## Phase 8 — Legal intelligence and tax accuracy

Status: local catalog and historical-source resolver implemented; legal-content verification remains blocked.

- Add a structured legal repository with explicit metadata for legislation, regulations, URA guidance, and case records. The current catalog contains titles only where source metadata is unavailable.
- Distinguish legal authority from administrative guidance and preserve review status at every layer.
- Add historical tax-period resolution that is date-aware and does not resolve a rule without a verified source chain. The current resolver reports evidence but does not assert corpus completeness or filing approval.
- Keep all legal texts outside the executable source unless they are part of a reviewed data package.
- Blocked: acquire official texts and amendments, validate source URLs/effective periods, ingest URA materials, and obtain qualified legal review of provisions and cases.

## Phase 9 — Secure deployment and production readiness

Status: local fail-closed deployment gate implemented; production acceptance remains blocked.

- Complete secure Worker and browser/API configuration behind explicit feature flags.
- Verify D1 migrations, R2 storage, email delivery, and backup/restore procedures against real service bindings.
- Add fail-closed security checks, audit logging, and no-secret production safeguards.
- Require deployment gates and sign-off before enabling live operations.
- Blocked: configure and verify the actual Cloudflare services, remote migrations, backup/restore, authenticated browser/API flow, and independent security/privacy sign-off.

## Phase 10 — Scale, analytics and operations

Status: tenant-scoped operational summary implemented behind a disabled-by-default feature flag.

- Add tenant-safe operational dashboards, analytics, and reporting pipelines.
- Ensure audit trails and client-scoping remain intact across all workflows.
- Keep the legal source and verification rules as the governing layer for any automated recommendation engine.
- No cross-tenant analytics or telemetry collection is enabled.

## Phase 11 — Commercial launch and governance

Status: authenticated, audited approval-readiness endpoint implemented; no billing integration or public launch is active.

- Add subscription, commercial controls, support process, and launch review before any live billing or public launch.
- Confirm security, privacy, legal, and tax-accuracy sign-off before enabling production features.
- Keep the prototype in a non-production state until independent evidence and operational controls are complete.
- Required approvals default to false in `wrangler.toml`; the readiness endpoint cannot activate billing.

The implementation sequence remains additive, review-gated, and no-innovation-without-source. The current codebase is authoritative over older roadmap text; unverified legal material must not become production tax logic.
