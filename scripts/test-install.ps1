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

$installPs1 = Join-Path $root "install.ps1"

Write-Host "==> Local WhatIf (no network / install)"
$fakeMsi = Join-Path $env:TEMP "Bunny.OS_0.3.4_x64_en-US.msi"
Set-Content -LiteralPath $fakeMsi -Value "test only" -Encoding ASCII
try {
  & pwsh -NoProfile -File $installPs1 -LocalMsi $fakeMsi -WhatIf -SkipLaunch
  if ($LASTEXITCODE -ne 0) {
    throw "Local WhatIf failed: $LASTEXITCODE"
  }
} finally {
  Remove-Item -LiteralPath $fakeMsi -Force -ErrorAction SilentlyContinue
}
Write-Host "OK: local WhatIf"

Write-Host "==> Failure propagates a non-zero exit"
& pwsh -NoProfile -File $installPs1 -LocalMsi (Join-Path $env:TEMP "missing-bunny.msi") -WhatIf -SkipLaunch 2>$null
if ($LASTEXITCODE -eq 0) {
  throw "install.ps1 swallowed a fatal error"
}
Write-Host "OK: failure exit=$LASTEXITCODE"

Write-Host "==> Older release metadata remains selectable"
& pwsh -NoProfile -File $installPs1 -Version "v0.3.3" -WhatIf -SkipLaunch
if ($LASTEXITCODE -ne 0) {
  throw "Older release WhatIf failed: $LASTEXITCODE"
}
Write-Host "OK: v0.3.3 metadata"

Write-Host "P1 install.ps1 TESTS PASS"
