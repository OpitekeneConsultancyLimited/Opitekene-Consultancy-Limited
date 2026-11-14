# Audit finding H2: removes the third-party PDFs from the ENTIRE public git
# history. PREPARED, NOT RUN. It rewrites every commit and force-pushes, so it
# runs only with written management approval (docs/remediation/COPYRIGHT_REMEDIATION.md).
#
# Requirements: Git for Windows, Python 3 with `pip install git-filter-repo`,
# gh signed in as a repository admin, and main's force-push protection lifted
# for the duration (the script tells you when).
#
#   powershell -ExecutionPolicy Bypass -File scripts\git-history-cleanup.ps1 `
#     -ApprovedBy "Name, role" -ApprovalDate 2026-11-20 -Confirm "REWRITE PUBLIC HISTORY"
#   Add -Push only after reviewing the verification output of a run without it.
param(
  [Parameter(Mandatory)][string]$ApprovedBy,
  [Parameter(Mandatory)][datetime]$ApprovalDate,
  [Parameter(Mandatory)][string]$Confirm,
  [string]$WorkRoot = (Join-Path $env:USERPROFILE 'TaxComp-history-cleanup'),
  [switch]$Push
)
$ErrorActionPreference = 'Stop'
if ($Confirm -ne 'REWRITE PUBLIC HISTORY') { throw 'Pass -Confirm "REWRITE PUBLIC HISTORY" to proceed.' }
$repo = 'OpitekeneConsultancyLimited/Opitekene-Consultancy-Limited'
$paths = @(
  'Compendium 2024-2025 LAWS OF UGANDA 2024 Edition_unlocked 3.pdf',
  'ICPAU TAX AND ECONOMIC POLICY PROPOSALS FOR FY 2026-27 NATIONAL BUDGET.pdf'
)
foreach ($tool in 'git', 'gh') { if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) { throw "$tool is not installed." } }
& git filter-repo --version *> $null; if ($LASTEXITCODE -ne 0) { throw 'git-filter-repo is not installed (pip install git-filter-repo).' }

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$work = Join-Path $WorkRoot $stamp
New-Item -ItemType Directory -Force $work | Out-Null
$log = Join-Path $work 'cleanup-log.txt'
function Log($m) { $line = "{0:o} {1}" -f (Get-Date), $m; Add-Content $log $line; Write-Output $line }
Log "Approved by $ApprovedBy on $($ApprovalDate.ToString('yyyy-MM-dd')). Work folder $work."

# 1. Untouched backup: a mirror clone plus a single-file bundle (keep both until the rights matter is closed).
git clone --mirror "https://github.com/$repo.git" (Join-Path $work 'backup.git')
git -C (Join-Path $work 'backup.git') bundle create (Join-Path $work "backup-$stamp.bundle") --all
Log "Backup mirror and bundle created."

# 2. Evidence before: affected commits and branches.
$before = foreach ($p in $paths) { git -C (Join-Path $work 'backup.git') log --all --format='%H %ad %s' --date=iso -- $p }
$before | Set-Content (Join-Path $work 'affected-commits-before.txt')
Log "Commits touching the files before cleanup: $(@($before).Count)."
$open = gh pr list --repo $repo --state open --json number,title | ConvertFrom-Json
if ($open.Count) { Log "WARNING: $($open.Count) open pull request(s); they must be re-created after the rewrite: $(($open | ForEach-Object { "#$($_.number)" }) -join ', ')" }

# 3. Rewrite a fresh mirror.
$clean = Join-Path $work 'clean.git'
git clone --mirror "https://github.com/$repo.git" $clean
$filterArgs = @('filter-repo', '--force', '--invert-paths') + ($paths | ForEach-Object { '--path', $_ })
& git -C $clean @filterArgs
Log 'History rewritten in the clean mirror.'

# 4. Verify: no commit and no blob still carries the files.
$left = foreach ($p in $paths) { git -C $clean log --all --format='%H' -- $p }
$pdfBlobs = git -C $clean rev-list --objects --all | Select-String -Pattern '\.pdf$' | Where-Object { $_ -match 'Compendium|ICPAU' }
$report = @(
  "Verification $(Get-Date -Format o)",
  "Commits still touching the files: $(@($left).Count)",
  "Blobs still named like the files: $(@($pdfBlobs).Count)",
  "Branches after: $((git -C $clean branch --list | Measure-Object).Count)"
)
$report | Set-Content (Join-Path $work 'verification.txt'); $report | ForEach-Object { Log $_ }
if (@($left).Count -or @($pdfBlobs).Count) { throw 'Verification failed: the files are still present. Nothing was pushed.' }

if (-not $Push) { Log 'Dry run complete. Review the files above, lift force-push protection on main, then re-run with -Push.'; return }

# 5. Force-push all branches and tags (refs/pull/* are read-only on GitHub and are skipped).
git -C $clean push --force --all origin
git -C $clean push --force --tags origin
Log 'Force-pushed. Re-enable force-push protection on main now, then follow the after-push steps in COPYRIGHT_REMEDIATION.md.'
