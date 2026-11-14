# Audit finding H3 (and N7): makes DPAPI-protected copies of the local TaxComp
# secrets so the plaintext files can be deleted. DPAPI copies can only be
# decrypted by this Windows user on this PC, so they are NOT a recovery copy:
# keep the values in the password manager as well.
# Prints no secret values. Does not delete anything; it tells you what is safe to delete.
#   powershell -ExecutionPolicy Bypass -File scripts\protect-local-secrets.ps1
$ErrorActionPreference = 'Stop'
$secrets = Join-Path $env:USERPROFILE 'TaxComp-secrets'

function Read-Dpapi($path) {
  $s = Get-Content $path | ConvertTo-SecureString
  [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s))
}

# 1. Database connection string (used by backup-daily.ps1).
$txt = Join-Path $secrets 'supabase-taxcomp-worker.txt'
$dpapi = Join-Path $secrets 'supabase-taxcomp-worker.dpapi'
if (Test-Path $txt) {
  $line = Get-Content $txt | Where-Object { $_ -like 'Connection string*' }
  if (-not $line) { throw 'No "Connection string" line in supabase-taxcomp-worker.txt.' }
  $url = $line.Substring($line.IndexOf('postgresql://'))
  if (-not (Test-Path $dpapi)) { ConvertTo-SecureString $url -AsPlainText -Force | ConvertFrom-SecureString | Set-Content -Path $dpapi -Encoding ascii }
  if ((Read-Dpapi $dpapi) -ne $url) { throw 'The DPAPI copy of the connection string does not match the text file. Nothing was changed.' }
  Remove-Variable url, line
  Write-Output 'Connection string: DPAPI copy verified. After saving the database password in your password manager, you may delete supabase-taxcomp-worker.txt.'
} elseif (Test-Path $dpapi) { Write-Output 'Connection string: only the DPAPI copy exists (plaintext already removed).' }

# 2. Backup passphrase (backup-setup.ps1 already created the DPAPI copy).
$handoff = Join-Path $secrets 'backup-passphrase-SAVE-IN-PASSWORD-MANAGER-THEN-DELETE.txt'
$passDpapi = Join-Path $secrets 'backup-passphrase.dpapi'
if ((Test-Path $handoff) -and (Test-Path $passDpapi)) {
  $fromFile = (Get-Content $handoff | Where-Object { $_.Trim() -and $_ -notmatch '[: ]' } | Select-Object -Last 1)
  $same = $fromFile -and ((Read-Dpapi $passDpapi) -eq $fromFile.Trim())
  Remove-Variable fromFile
  if ($same) { Write-Output 'Backup passphrase: DPAPI copy matches the hand-off file. After saving it in your password manager, delete the hand-off file.' }
  else { Write-Output 'Backup passphrase: could not confirm the hand-off file matches the DPAPI copy automatically; check the password manager entry with a restore drill before deleting it.' }
} elseif (Test-Path $passDpapi) { Write-Output 'Backup passphrase: hand-off file already deleted; DPAPI copy present.' }

# 3. Is the folder synchronised by OneDrive? (It should not be.)
$od = $env:OneDrive
if ($od -and $secrets.StartsWith($od, [StringComparison]::OrdinalIgnoreCase)) { Write-Output 'WARNING: TaxComp-secrets is inside OneDrive and is being synchronised.' }
else { Write-Output "TaxComp-secrets is outside OneDrive ($od); it is not synchronised." }
