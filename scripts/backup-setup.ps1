# One-time setup for daily encrypted TaxComp backups. Run it yourself, in your
# own PowerShell window (not through an assistant), from TaxComp-Prototype:
#   powershell -ExecutionPolicy Bypass -File scripts\backup-setup.ps1
#
# 1. Generates a random backup passphrase and shows it ONCE. Save it in your
#    password manager: without it no backup can ever be restored.
# 2. Stores a DPAPI-protected copy that only your Windows account can decrypt,
#    so the daily job can run unattended.
# 3. Registers the "TaxComp daily backup" scheduled task (02:30 every day,
#    and at the next logon if a run was missed).
# 4. Runs one backup immediately to prove it works.
$ErrorActionPreference = 'Stop'
$secrets = Join-Path $env:USERPROFILE 'TaxComp-secrets'
$dpapi = Join-Path $secrets 'backup-passphrase.dpapi'
if (Test-Path $dpapi) { throw "A backup passphrase already exists ($dpapi). Delete it first only if you mean to start a new key." }

$bytes = New-Object byte[] 32
[Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
$passphrase = [Convert]::ToBase64String($bytes)
Write-Host ""
Write-Host "Your TaxComp backup passphrase (save it in your password manager NOW):" -ForegroundColor Yellow
Write-Host ""
Write-Host "    $passphrase" -ForegroundColor Cyan
Write-Host ""
Read-Host "Press Enter once it is saved"
Clear-Host

ConvertTo-SecureString $passphrase -AsPlainText -Force | ConvertFrom-SecureString | Set-Content -Path $dpapi -Encoding ascii
Remove-Variable passphrase

$script = Join-Path $PSScriptRoot 'backup-daily.ps1'
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$script`""
$trigger = New-ScheduledTaskTrigger -Daily -At 2:30am
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 30)
Register-ScheduledTask -TaskName 'TaxComp daily backup' -Action $action -Trigger $trigger -Settings $settings -Description 'Encrypted TaxComp Supabase backup (scripts/backup-daily.ps1)' | Out-Null
Write-Host "Scheduled task 'TaxComp daily backup' registered (02:30 daily)."

& $script
if ($LASTEXITCODE -eq 0) {
  Write-Host "First backup written to $env:USERPROFILE\TaxComp-backups (and OneDrive\TaxComp-backups)." -ForegroundColor Green
} else {
  Write-Host "First backup FAILED - see $env:USERPROFILE\TaxComp-backups\backup.log" -ForegroundColor Red
}
