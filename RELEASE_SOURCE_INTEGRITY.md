# Release source integrity

Date: 2026-11-07  
Status: **PASSED for source-controlled candidate commit; final tag points to the metadata-complete revision**

## Verified production source

- Repository: `OpitekeneConsultancyLimited/Opitekene-Consultancy-Limited`
- Confirmed production commit: `6572ba8dbc693dc827bf3cb561f5656bbc41bc86`
- Confirmed commit tree: `b84f7ae87890464b0747c474e4ef6409baabf3aa`
- Read-only GitHub branch check reports `main` at the confirmed commit.
- The production D1 inventory was read only; migrations 0004–0006 remain pending.
- Git is not installed in this workspace and the project directory contains no `.git`; the candidate commit was created through GitHub's Git Data API from the verified production tree.

## Local comparison and restoration

The local candidate was compared against GitHub's recursive file tree for the confirmed commit by computing Git blob SHA-1 values for local files and comparing them with the tree. `.wrangler`, Python bytecode/cache, environment files and logs were excluded from candidate content.

The comparison found two tracked application files missing locally: `tax-transaction.js` and `tax-transaction.test.js`. Both were restored byte-for-byte from the confirmed production commit; their Git blob IDs were checked against GitHub before writing:

- `tax-transaction.js`: `5e7669ef4e8397f72ba063ea350bc0e1e92131ec`
- `tax-transaction.test.js`: `708344fb6c4d5c9a0209bd9e991f5b1e6833aee8`

The full Node suite was rerun with these files included: 301 passed, 0 failed. Subsequent RC4 security fixes are confined to candidate files and have separate regression coverage.

## Candidate provenance

The release-candidate branch's initial source commit `fe27d7231d7774da7448a252aa1599b83395ff2e` (tree `05cfbc828ab7194e8d3454ee9301a9871ab93f12`) is a direct child of the confirmed production commit above. The latest candidate tag is recorded in `RELEASE_MANIFEST.json` and pins the complete review tree; earlier RC tags are superseded. The tag is unsigned and no protected-tag policy was configured. The commit content is content-addressed, but the tag is not a cryptographic signature or proof of protected-ref immutability.

The Pages deployment workflow is restricted to `main`; this candidate branch does not trigger it. Candidate pushes trigger a validation workflow (tests and Wrangler dry-run) and CodeQL. RC7 commit `bad850a7780d2d3d681571fef945bc517e22fa9d` passed both workflows; CodeQL found zero open alerts after fixing six historical findings. RC8 contains evidence/report updates only and reruns the same workflows.

## Exclusions and cautions

- Four Python bytecode files present in the remote tree were absent locally; they were retained from the base tree and not deleted.
- No local Git history was synthesized.
- No production deployment, remote D1 migration, analytics enablement or billing activation occurred.
- `RELEASE_MANIFEST.json` and `RELEASE_CHECKSUMS.txt` provide release metadata and SHA-256 digests; the checksum list excludes itself to avoid self-reference.
