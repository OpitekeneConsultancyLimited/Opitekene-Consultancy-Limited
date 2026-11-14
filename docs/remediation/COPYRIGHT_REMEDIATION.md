# Copyright remediation (finding H2)

**Status: prepared, awaiting management approval.** Nothing in public history has been rewritten.

## What is exposed

| File | Rights holder (to confirm) | Added | Removed from `main` | Still downloadable from |
|---|---|---|---|---|
| `Compendium 2024-2025 LAWS OF UGANDA 2024 Edition_unlocked 3.pdf` (Okuja FY2024/25 compendium) | The compiler, who claims compilation copyright | `7282aff9`, 1 Nov 2026 | `e2e41885` (PR #32), 12 Nov 2026 | every commit in between, and about 33 old branches created in that window |
| `ICPAU TAX AND ECONOMIC POLICY PROPOSALS FOR FY 2026-27 NATIONAL BUDGET.pdf` | ICPAU | `7282aff9`, 1 Nov 2026 | this PR | all history up to this PR |

Measured on 14 Nov 2026: the repository is **public**, has **0 forks** and no open pull requests. Neither file was ever published on the website after PR #32: the Pages build uses an allowlist. The "unlocked" in the compendium's file name suggests copy protection was removed, which the rights assessment should note.

## Decision needed from management

1. **Rights check.** Confirm with the rights holders whether TaxComp had permission to store or redistribute either file. If ICPAU publishes the proposals openly for redistribution, ICPAU can be dropped from the rewrite.
2. **Approve the rewrite.** It changes every commit ID since 1 Nov, invalidates old links to commits, and every clone must be re-made. No forks exist, so the impact is limited to the owner's own copies.
3. **Approve deleting the stale branches** (all merged). Fewer branches means less to rewrite and less residual exposure.

## Procedure (after approval)

1. Install Git for Windows and `pip install git-filter-repo`.
2. Lift "block force pushes" on `main` (Settings › Branches) for the duration.
3. Dry run: `powershell -ExecutionPolicy Bypass -File scripts\git-history-cleanup.ps1 -ApprovedBy "<name, role>" -ApprovalDate <date> -Confirm "REWRITE PUBLIC HISTORY"`. This makes a mirror backup and a bundle, lists the affected commits, rewrites a clean mirror and verifies that nothing remains.
4. Review `verification.txt`, then re-run with `-Push`.
5. Re-enable the force-push block.
6. Ask GitHub Support to purge cached views of the old commits ("Remove sensitive data", referencing the rewritten repository and the old commit SHAs from `affected-commits-before.txt`).
7. Re-clone every local copy. On the owner PC, the working folder is not a git checkout, so nothing changes there.
8. Run the [verification steps](REPOSITORY_CLEANUP_VERIFICATION.md) and record the results there.
9. Keep the backup mirror and bundle offline and access-restricted until the rights matter is closed, then delete them.

## Prevention (implemented in this PR)

- `scripts/repo-content-guard.mjs` runs in CI on every pull request. It blocks documents and archives (PDF, Office files, ZIP, backups) outside a reviewed allowlist, blocks known third-party names in any folder, and blocks files over 2 MB.
- `.gitignore` excludes root-level PDFs, compendium PDFs and backup files.
- GitHub secret scanning with push protection is already on.

## Residual exposure

Copies already downloaded by others, or held in third-party caches and archives, cannot be recalled by a rewrite. Record any known copies in the verification file.
