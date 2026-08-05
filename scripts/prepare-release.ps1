# Prepare a releaseable Windows build: verify → package sidecar → tauri build.
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

Write-Host "==> verify-beta"
& "$PSScriptRoot\verify-beta.ps1"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

if (-not (Get-Command link.exe -ErrorAction SilentlyContinue)) {
  Write-Host "ERROR: MSVC link.exe required for tauri build. Install VS Build Tools (Desktop C++)."
  exit 2
}

Write-Host "==> package-sidecar"
if (-not $env:BUNNY_PREFETCH_WHISPER) {
  $env:BUNNY_PREFETCH_WHISPER = "1"
}
& "$PSScriptRoot\package-sidecar.ps1"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "==> npm run build"
npm run build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$bundle = Join-Path $root "src-tauri\target\release\bundle"
if (Test-Path $bundle) {
  Write-Host "==> checksums"
  & "$PSScriptRoot\checksum-release.ps1" -Path $bundle
}

Write-Host "Release artifacts under src-tauri\target\release\bundle"
Write-Host "NEXT (human): code-sign installer, then complete docs/beta-checklist.md"
