# Repository cleanup verification (finding H2)

## Before cleanup (measured 14 Nov 2026)

| Check | Result |
|---|---|
| Commits touching the compendium on `main` | 2 (`7282aff9` added, `e2e41885` removed) |
| Commits touching the ICPAU PDF on `main` | 1 (`7282aff9` added); removed from the tree by this PR |
| Branches | 35 (including `main`) |
| Forks | 0 |
| Open pull requests | 0 |
| Content guard on the tracked files after this PR | passes (no third-party documents tracked) |

## After cleanup (fill in once the rewrite is done)

| Check | Command or source | Result | Date | By |
|---|---|---|---|---|
| No commit touches either file | `git log --all -- "<file>"` on a fresh clone | | | |
| No blob with either name | `git rev-list --objects --all \| findstr /i "compendium icpau"` | | | |
| Old commit URL no longer serves the file | open `https://github.com/<repo>/blob/7282aff9/<file>` | | | |
| GitHub Support cache purge requested | ticket number | | | |
| GitHub Support confirmation | reply date | | | |
| Clones re-made | list of machines | | | |
| Known residual copies | | | | |
| Backup mirror and bundle location and custodian | | | | |
