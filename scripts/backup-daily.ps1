# Daily encrypted TaxComp backup (Supabase Free plan; blocker BCP-1).
# Registered by scripts/backup-setup.ps1 as a Windows scheduled task.
#  - Source: the taxcomp_worker connection string in %USERPROFILE%\TaxComp-secrets
#  - Passphrase: DPAPI-protected copy (only this Windows user can decrypt it)
#  - Output: %USERPROFILE%\TaxComp-backups\taxcomp-YYYY-MM-DD.tcbak (keeps 35),
#    plus a copy in OneDrive\TaxComp-backups for an off-site copy (the file is
#    AES-256-GCM encrypted, so the copy reveals nothing without the passphrase).
$ErrorActionPreference = 'Stop'
$project = Split-Path -Parent $PSScriptRoot
$secrets = Join-Path $env:USERPROFILE 'TaxComp-secrets'
$backups = Join-Path $env:USERPROFILE 'TaxComp-backups'
$log = Join-Path $backups 'backup.log'
New-Item -ItemType Directory -Force $backups | Out-Null

function Write-Log($message) { Add-Content -Path $log -Value ("{0:o} {1}" -f (Get-Date), $message) -Encoding utf8 }

try {
  $line = Get-Content (Join-Path $secrets 'supabase-taxcomp-worker.txt') | Where-Object { $_ -like 'Connection string*' }
  if (-not $line) { throw 'Worker connection string not found in TaxComp-secrets.' }
  $env:DATABASE_URL = $line.Substring($line.IndexOf('postgresql://'))
  $protected = Get-Content (Join-Path $secrets 'backup-passphrase.dpapi') | ConvertTo-SecureString
  $env:BACKUP_PASSPHRASE = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($protected))

  $file = Join-Path $backups ("taxcomp-{0:yyyy-MM-dd}.tcbak" -f (Get-Date))
  Push-Location $project
  try { $output = & node scripts/taxcomp-backup.mjs export --out $file 2>&1 } finally { Pop-Location }
  if ($LASTEXITCODE -ne 0) { throw "export failed: $output" }
  Write-Log "OK $file $((Get-Item $file).Length) bytes"

  if ($env:OneDrive) {
    $offsite = Join-Path $env:OneDrive 'TaxComp-backups'
    New-Item -ItemType Directory -Force $offsite | Out-Null
    Copy-Item $file $offsite -Force
    Get-ChildItem $offsite -Filter 'taxcomp-*.tcbak' | Sort-Object Name -Descending | Select-Object -Skip 35 | Remove-Item -Force
  }
  Get-ChildItem $backups -Filter 'taxcomp-*.tcbak' | Sort-Object Name -Descending | Select-Object -Skip 35 | Remove-Item -Force
} catch {
  Write-Log "FAILED $($_.Exception.Message)"
  exit 1
} finally {
  Remove-Item Env:DATABASE_URL, Env:BACKUP_PASSPHRASE -ErrorAction SilentlyContinue
}
