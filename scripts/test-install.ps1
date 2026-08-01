# Smoke-test install.ps1 without downloading an installer.
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

Write-Host "==> Parse install.ps1"
$tokens = $null
$errs = $null
$null = [System.Management.Automation.Language.Parser]::ParseFile(
  (Join-Path $root "install.ps1"),
  [ref]$tokens,
  [ref]$errs
)
if ($errs -and $errs.Count -gt 0) {
  $errs | ForEach-Object { Write-Host $_ }
  throw "install.ps1 has parse errors"
}
Write-Host "OK: parse"

Write-Host "==> WhatIf against GitHub API (expects missing installer until a release exists)"
$installPs1 = Join-Path $root "install.ps1"
& pwsh -NoProfile -File $installPs1 -WhatIf -SkipLaunch
$code = $LASTEXITCODE
# Exit 0 = release+asset found (WhatIf), exit 1 = no release/asset yet (still a valid gate).
if ($code -notin 0, 1) {
  throw "install.ps1 -WhatIf exited unexpectedly: $code"
}
Write-Host "OK: WhatIf exit=$code (0=asset ready, 1=waiting on release — both acceptable pre-release)"

Write-Host "P1 install.ps1 TESTS PASS"
