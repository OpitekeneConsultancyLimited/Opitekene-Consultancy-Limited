# Schedules scripts\daily-audit.ps1 every day at 07:30 for the current Windows
# user (it uses your existing gh / wrangler / supabase sign-ins). If the PC is
# off at 07:30 it runs as soon as you next log on. Re-run to update; remove with:
#   Unregister-ScheduledTask -TaskName 'TaxComp daily audit' -Confirm:$false
param([string]$At = '07:30')
$ErrorActionPreference = 'Stop'
$script = Join-Path $PSScriptRoot 'daily-audit.ps1'
$action = New-ScheduledTaskAction -Execute 'powershell.exe' `
  -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$script`"" `
  -WorkingDirectory (Split-Path -Parent $PSScriptRoot)
$trigger = New-ScheduledTaskTrigger -Daily -At $At
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 30) `
  -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName 'TaxComp daily audit' -Action $action -Trigger $trigger -Settings $settings `
  -Principal $principal -Description 'Read-only TaxComp health audit; report in %USERPROFILE%\TaxComp-audits\latest.html' -Force | Out-Null
$info = Get-ScheduledTask -TaskName 'TaxComp daily audit' | Get-ScheduledTaskInfo
Write-Host "Scheduled: TaxComp daily audit, every day at $At. Next run: $($info.NextRunTime)" -ForegroundColor Green
Write-Host "Reports: $env:USERPROFILE\TaxComp-audits\latest.html"
