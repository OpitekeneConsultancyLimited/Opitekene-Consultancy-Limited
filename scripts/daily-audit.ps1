# TaxComp daily audit (read-only).
# Checks the live site, the chat/billing Worker, GitHub, Supabase and backups,
# writes an HTML report to %USERPROFILE%\TaxComp-audits and shows a Windows
# notification. Changes nothing, sends no AI questions, prints no secret values
# (only secret NAMES, to see which are missing).
#   powershell -ExecutionPolicy Bypass -File scripts\daily-audit.ps1
# Scheduled by scripts\daily-audit-setup.ps1.
$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'
$project = Split-Path -Parent $PSScriptRoot
Set-Location $project

$site   = 'https://opitekeneconsultancylimited.github.io/Opitekene-Consultancy-Limited/'
# Since PR #32 the root is the corporate site; the TaxComp app (sign-in gate) lives here.
$app    = $site + 'taxcomp/'
$worker = 'https://taxcomp-uganda-chat.omaratomdenis1.workers.dev'
$repo   = 'OpitekeneConsultancyLimited/Opitekene-Consultancy-Limited'
$workerName = 'taxcomp-uganda-chat'
$supabaseRef = 'xbooviddjkikcbccfcnw'
$expectedSecrets = 'GEMINI_API_KEY', 'ANTHROPIC_API_KEY', 'FLW_SECRET_KEY', 'FLW_WEBHOOK_HASH', 'SUPABASE_SERVICE_ROLE_KEY'
$outDir = Join-Path $env:USERPROFILE 'TaxComp-audits'
New-Item -ItemType Directory -Force $outDir | Out-Null

$results = New-Object System.Collections.Generic.List[object]
function Add-Result([string]$area, [string]$status, [string]$detail) {
  $results.Add([pscustomobject]@{ Area = $area; Status = $status; Detail = $detail })
}
# PowerShell 5.1 returns a JSON array as ONE object; unroll it into items.
function Get-GhJson { param([string[]]$ghArgs) $raw = (& gh @ghArgs) -join "`n"; if (-not $raw) { return @() }; $raw | ConvertFrom-Json | ForEach-Object { $_ } }
function Get-Status([string]$url, [string]$method = 'GET', [hashtable]$headers = @{}, [string]$body = $null) {
  try {
    $req = @{ Uri = $url; Method = $method; UseBasicParsing = $true; TimeoutSec = 30; Headers = $headers }
    if ($body) { $req.Body = $body; $req.ContentType = 'application/json' }
    $r = Invoke-WebRequest @req
    return @{ Code = [int]$r.StatusCode; Content = $r.Content }
  } catch {
    if ($_.Exception.Response) { return @{ Code = [int]$_.Exception.Response.StatusCode; Content = '' } }
    return @{ Code = 0; Content = $_.Exception.Message }
  }
}

# ---- 1. live site ----
$homePage = Get-Status $site
if ($homePage.Code -eq 200) {
  $files = 'styles.css', 'account.js', 'tax-calculator.js', 'service-worker.js', 'manifest.webmanifest'
  if ($homePage.Content -match 'design\.css') { $files += 'design.css', 'site-router.js' }
  $broken = @($files | Where-Object { (Get-Status ($site + $_)).Code -ne 200 })
  if ($broken.Count) { Add-Result 'Live site' 'FAIL' "Up, but files fail to load: $($broken -join ', ')" }
  else { Add-Result 'Live site' 'OK' "Up; $($files.Count) key files load." }
  $sw = (Get-Status ($site + 'service-worker.js')).Content
  $cache = [regex]::Match($sw, 'taxcomp-app-v\d+').Value
  $appPage = Get-Status $app
  if ($appPage.Code -ne 200) { Add-Result 'TaxComp app' 'FAIL' "$app returned $($appPage.Code)." }
  elseif ($appPage.Content -notmatch 'auth-gate-root') { Add-Result 'TaxComp app' 'FAIL' 'App page has no sign-in gate.' }
  else { Add-Result 'TaxComp app' 'OK' 'Up at /taxcomp/ with its sign-in gate.' }
  $corp = if ($homePage.Content -match 'class="[^"]*\bcorp\b') { 'corporate site at /' } else { 'root page is NOT the corporate site' }
  Add-Result 'Site version' 'INFO' "$corp; app cache $cache."
} else {
  Add-Result 'Live site' 'FAIL' "Home page returned $($homePage.Code)."
}

# ---- 2. worker ----
$chat = Get-Status "$worker/chat" 'GET' @{ Origin = 'https://opitekeneconsultancylimited.github.io' }
if ($chat.Code -eq 405) { Add-Result 'Worker' 'OK' 'Responding.' } else { Add-Result 'Worker' 'FAIL' "GET /chat returned $($chat.Code) (expected 405)." }
$foreign = Get-Status "$worker/chat" 'POST' @{ Origin = 'https://example.invalid' } '{}'
if ($foreign.Code -eq 403) { Add-Result 'Worker origin lock' 'OK' 'Requests from other websites are refused.' }
else { Add-Result 'Worker origin lock' 'FAIL' "A foreign-origin request got $($foreign.Code) (expected 403)." }

$deployOut = (& npx --yes wrangler@4.158.0 deployments list --name $workerName 2>&1) -join "`n"
$versions = [regex]::Matches($deployOut, '\(100%\)\s+([0-9a-f-]{36})')
if ($versions.Count) {
  $v = $versions[$versions.Count - 1].Groups[1].Value
  Add-Result 'Worker version' 'INFO' "Deployed version $($v.Substring(0,8))."
} else { Add-Result 'Worker version' 'WARN' 'Could not read deployments (is wrangler still signed in?).' }

$secretOut = (& npx --yes wrangler@4.158.0 secret list --name $workerName 2>&1) -join "`n"
$names = @([regex]::Matches($secretOut, '"name":\s*"([A-Z0-9_]+)"') | ForEach-Object { $_.Groups[1].Value })
if ($names.Count) {
  $missing = @($expectedSecrets | Where-Object { $names -notcontains $_ })
  if ($missing.Count) { Add-Result 'Worker secrets' 'WARN' "Missing: $($missing -join ', ')." }
  else { Add-Result 'Worker secrets' 'OK' 'All expected secrets are set.' }
} else { Add-Result 'Worker secrets' 'WARN' 'Could not list secrets (is wrangler still signed in?).' }

# ---- 3. GitHub ----
try {
  $prs = @(Get-GhJson @('pr', 'list', '--repo', $repo, '--state', 'open', '--json', 'number,title'))
  if ($prs.Count) { Add-Result 'Open pull requests' 'INFO' (($prs | ForEach-Object { "#$($_.number) $($_.title)" }) -join '; ') }
  else { Add-Result 'Open pull requests' 'OK' 'None waiting.' }
  $since = (Get-Date).ToUniversalTime().AddHours(-26)
  $runs = @(Get-GhJson @('run', 'list', '--repo', $repo, '--limit', '30', '--json', 'workflowName,headBranch,conclusion,createdAt') |
    Where-Object { [datetime]$_.createdAt -gt $since })
  # Only the newest run of each workflow on each branch counts: a failure that a
  # later run on the same branch already fixed is history, not a problem.
  $latestRuns = @($runs | Sort-Object { [datetime]$_.createdAt } -Descending | Group-Object workflowName, headBranch | ForEach-Object { $_.Group[0] })
  $failed = @($latestRuns | Where-Object { $_.conclusion -in 'failure', 'timed_out', 'startup_failure' })
  if ($failed.Count) { Add-Result 'GitHub checks (24h)' 'FAIL' (($failed | ForEach-Object { "$($_.workflowName) [$($_.headBranch)]" }) -join '; ') }
  else { Add-Result 'GitHub checks (24h)' 'OK' "$($runs.Count) run(s), none failed." }
  $code = @(Get-GhJson @('api', "repos/$repo/code-scanning/alerts?state=open&per_page=100"))
  $leaks = @(Get-GhJson @('api', "repos/$repo/secret-scanning/alerts?state=open&per_page=100"))
  if ($code.Count -or $leaks.Count) { Add-Result 'Security alerts' 'FAIL' "$($code.Count) code-scanning, $($leaks.Count) leaked-secret alert(s) open." }
  else { Add-Result 'Security alerts' 'OK' 'No open code-scanning or leaked-secret alerts.' }
  $dep = (& gh api "repos/$repo/dependabot/alerts?state=open&per_page=100" 2>&1) -join "`n"
  if ($dep -match 'disabled') { Add-Result 'Dependency alerts' 'WARN' 'Dependabot alerts are switched off on the repository.' }
  else {
    $depCount = @($dep | ConvertFrom-Json | ForEach-Object { $_ }).Count
    if ($depCount) { Add-Result 'Dependency alerts' 'WARN' "$depCount open Dependabot alert(s)." } else { Add-Result 'Dependency alerts' 'OK' 'None open.' }
  }
} catch { Add-Result 'GitHub' 'WARN' "Could not query GitHub: $($_.Exception.Message)" }

# ---- 4. Supabase ----
$sbOut = (& npx --yes supabase@2.121.0 projects list -o json 2>&1) -join "`n"
$m = [regex]::Match($sbOut, '"ref"\s*:\s*"' + $supabaseRef + '"[\s\S]*?"status"\s*:\s*"([A-Z_]+)"')
if ($m.Success) {
  if ($m.Groups[1].Value -eq 'ACTIVE_HEALTHY') { Add-Result 'Database (Supabase)' 'OK' 'ACTIVE_HEALTHY.' }
  else { Add-Result 'Database (Supabase)' 'FAIL' "Status $($m.Groups[1].Value)." }
} else { Add-Result 'Database (Supabase)' 'WARN' 'Could not read project status (is the Supabase CLI still signed in?).' }

# ---- 5. backups ----
$latest = Get-ChildItem (Join-Path $env:USERPROFILE 'TaxComp-backups') -Filter *.tcbak -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $latest) { Add-Result 'Backups' 'FAIL' 'No backup files. Run scripts\backup-setup.ps1 once.' }
else {
  $age = [math]::Round(((Get-Date) - $latest.LastWriteTime).TotalHours, 1)
  if ($age -gt 26) { Add-Result 'Backups' 'FAIL' "Newest backup is $age hours old ($($latest.Name))." }
  else { Add-Result 'Backups' 'OK' "Newest backup $($latest.Name), $age hours old." }
}

# ---- 6. browser check (optional: needs npm install in this folder) ----
$checker = Join-Path $PSScriptRoot 'daily-audit-browser.mjs'
if ((Test-Path $checker) -and (Test-Path (Join-Path $project 'node_modules\playwright-core'))) {
  $browserOut = (& node $checker $app 2>&1) -join "`n"
  if ($browserOut -match 'BROWSER OK') { Add-Result 'Browser check' 'OK' (($browserOut -split "`n" | Select-String 'BROWSER OK').Line -replace 'BROWSER OK:\s*', '') }
  else { Add-Result 'Browser check' 'FAIL' (($browserOut -split "`n" | Select-Object -Last 3) -join ' ') }
}

# ---- report ----
$stamp = Get-Date -Format 'yyyy-MM-dd'
$fails = @($results | Where-Object Status -eq 'FAIL').Count
$warns = @($results | Where-Object Status -eq 'WARN').Count
$summary = if ($fails) { "$fails problem(s), $warns warning(s)" } elseif ($warns) { "All up; $warns warning(s)" } else { 'All checks passed' }
$enc = { param($s) [System.Net.WebUtility]::HtmlEncode($s) }
$rows = ($results | ForEach-Object { "<tr class='$($_.Status.ToLower())'><td>$(& $enc $_.Area)</td><td><span>$($_.Status)</span></td><td>$(& $enc $_.Detail)</td></tr>" }) -join "`n"
$html = @"
<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>TaxComp audit $stamp</title><style>
body{margin:0;padding:32px 16px;background:#f6f8fb;color:#0f1f38;font:15px/1.5 "Segoe UI",system-ui,sans-serif}
main{max-width:900px;margin:0 auto}h1{margin:0 0 4px;font-size:24px}p.sub{margin:0 0 20px;color:#5a6a7e}
table{width:100%;border-collapse:collapse;background:#fff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden}
td{padding:10px 14px;border-top:1px solid #e2e8f0;vertical-align:top}tr:first-child td{border-top:0}td:first-child{font-weight:600;white-space:nowrap}
span{display:inline-block;min-width:44px;padding:2px 8px;border-radius:999px;font-size:12px;font-weight:700;text-align:center}
.ok span{background:#e8f5f4;color:#0a6f6c}.fail span{background:#fde8e8;color:#9b1c1c}.warn span{background:#fff4dc;color:#8a5a00}.info span{background:#eef2f7;color:#334155}
</style></head><body><main><h1>TaxComp daily audit</h1><p class="sub">$(Get-Date -Format 'dddd d MMMM yyyy, HH:mm') &middot; $summary &middot; read-only, nothing was changed</p>
<table>$rows</table></main></body></html>
"@
$reportPath = Join-Path $outDir "audit-$stamp.html"
[IO.File]::WriteAllText($reportPath, $html, (New-Object Text.UTF8Encoding $false))
[IO.File]::WriteAllText((Join-Path $outDir 'latest.html'), $html, (New-Object Text.UTF8Encoding $false))
Get-ChildItem $outDir -Filter 'audit-*.html' | Sort-Object Name -Descending | Select-Object -Skip 60 | Remove-Item -Force

$results | Format-Table -AutoSize | Out-String -Width 200 | Write-Output
Write-Output "Report: $reportPath"

# Windows notification (best effort).
try {
  [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
  [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null
  $xml = New-Object Windows.Data.Xml.Dom.XmlDocument
  $title = [System.Security.SecurityElement]::Escape("TaxComp audit: $summary")
  $body = [System.Security.SecurityElement]::Escape("Report saved to $reportPath")
  $xml.LoadXml("<toast><visual><binding template='ToastGeneric'><text>$title</text><text>$body</text></binding></visual></toast>")
  $appId = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\WindowsPowerShell\v1.0\powershell.exe'
  [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($appId).Show([Windows.UI.Notifications.ToastNotification]::new($xml))
} catch { }

exit ([int]($fails -gt 0))
