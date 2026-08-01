# P0 packaging gate — reports what this machine can do and runs what it can.
# Does NOT claim a full MSVC installer if link.exe is missing.

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

Write-Host "======== Bunny OS P0 packaging gate ========"
Write-Host ""

$msvc = [bool](Get-Command link.exe -ErrorAction SilentlyContinue)
$rustHost = (rustc -vV | Select-String "host:").ToString()
Write-Host "MSVC link.exe : $(if ($msvc) { 'YES' } else { 'NO — install VS Build Tools (Desktop C++)' })"
Write-Host "rustc host    : $rustHost"
Write-Host "toolchain file: $(Get-Content (Join-Path $root 'rust-toolchain.toml') -Raw)".Trim()

Write-Host ""
Write-Host "==> P0.2 package-sidecar (frozen binary)"
& "$PSScriptRoot\package-sidecar.ps1"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$bin = Join-Path $root "src-tauri\binaries\bunny-sidecar-x86_64-pc-windows-msvc.exe"
if (-not (Test-Path $bin)) {
  throw "Missing $bin after package-sidecar"
}
Write-Host "OK: $bin ($([math]::Round((Get-Item $bin).Length / 1MB, 1)) MB)"

Write-Host ""
if (-not $msvc) {
  Write-Host "======== P0.1 / P0.3 blocked on this machine ========"
  Write-Host "Cannot run 'npm run build' (Tauri installer) without MSVC link.exe."
  Write-Host "Options:"
  Write-Host "  1. Install VS Build Tools + Desktop C++ workload, then:"
  Write-Host "       pwsh -File scripts/prepare-release.ps1"
  Write-Host "  2. Push to GitHub and use .github/workflows/release-windows.yml"
  Write-Host "     (windows-latest has MSVC)."
  Write-Host ""
  Write-Host "P0.2 DONE locally. P0.1/P0.3/P0.4 → CI or MSVC machine."
  exit 0
}

Write-Host "==> P0.1/P0.3 prepare-release (MSVC present)"
& "$PSScriptRoot\prepare-release.ps1"
exit $LASTEXITCODE
