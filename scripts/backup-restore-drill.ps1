# Runs the restore drill on the newest local backup, using the DPAPI-protected
# passphrase copy (the same one backup-daily.ps1 uses), so the drill works
# without any plaintext copy of the passphrase. Writes evidence\restore-drill-<date>.json.
#   powershell -ExecutionPolicy Bypass -File scripts\backup-restore-drill.ps1
$ErrorActionPreference = 'Stop'
$project = Split-Path -Parent $PSScriptRoot
$secrets = Join-Path $env:USERPROFILE 'TaxComp-secrets'
$latest = Get-ChildItem (Join-Path $env:USERPROFILE 'TaxComp-backups') -Filter *.tcbak | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $latest) { throw 'No backup found in %USERPROFILE%\TaxComp-backups.' }
$protected = Get-Content (Join-Path $secrets 'backup-passphrase.dpapi') | ConvertTo-SecureString
$env:BACKUP_PASSPHRASE = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($protected))
try {
  $evidence = Join-Path $project ("evidence\restore-drill-{0}.json" -f (Get-Date -Format 'yyyy-MM-dd'))
  Push-Location $project
  node scripts/backup-restore-drill.mjs $latest.FullName $evidence
  $code = $LASTEXITCODE
} finally {
  Pop-Location
  Remove-Item Env:BACKUP_PASSPHRASE -ErrorAction SilentlyContinue
}
exit $code
