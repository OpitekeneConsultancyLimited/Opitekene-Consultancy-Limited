# Release source integrity

Date: 2026-11-07  
Status: **BLOCKED for an immutable candidate until the remote candidate ref is created**

## Verified production source

- Repository: `OpitekeneConsultancyLimited/Opitekene-Consultancy-Limited`
- Confirmed production commit: `6572ba8dbc693dc827bf3cb561f5656bbc41bc86`
- Confirmed commit tree: `b84f7ae87890464b0747c474e4ef6409baabf3aa`
- Read-only GitHub branch check reports `main` at the confirmed commit.
- The production D1 inventory was read only; migrations 0004–0006 remain pending.
- Git is not installed in this workspace and the project directory contains no `.git`. Therefore no local Git diff, local branch, commit or tag can be created or verified here.

## Local comparison and restoration

The local candidate was compared against GitHub's recursive file tree for the confirmed commit by computing Git blob SHA-1 values for local files and comparing them with the tree. `.wrangler`, Python bytecode/cache, environment files and logs were excluded from candidate content.

The comparison found two tracked application files missing locally: `tax-transaction.js` and `tax-transaction.test.js`. Both were restored byte-for-byte from the confirmed production commit; their Git blob IDs were checked against GitHub before writing:

- `tax-transaction.js`: `5e7669ef4e8397f72ba063ea350bc0e1e92131ec`
- `tax-transaction.test.js`: `708344fb6c4d5c9a0209bd9e991f5b1e6833aee8`

The full Node suite was rerun with these files included: 299 passed, 0 failed. No production source was changed.

## Candidate provenance

The candidate is intended to be a child of the confirmed production commit, with only the local candidate additions/updates overlaid. The repository's Pages workflow deploys pushes to `main` only; creating a separate release-candidate branch does not match that trigger. The immutable candidate revision and tag must be recorded here after creation. Until the branch/tag is actually created and independently inspected, this file does not claim that a release commit exists.

## Exclusions and cautions

- Four Python bytecode files present in the remote tree were absent locally; they are not source and are not copied as new candidate content. A tree-based candidate should preserve them unless a separate reviewed cleanup is approved.
- No local Git history was synthesized.
- No production deployment, remote D1 migration, analytics enablement or billing activation occurred.
