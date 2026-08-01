# Package Bunny OS Python sidecar with PyInstaller (Windows).
# Requires: Python 3.11+, pip install pyinstaller
#
# Output (Tauri externalBin convention):
#   src-tauri/binaries/bunny-sidecar-x86_64-pc-windows-msvc.exe

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$targetTriple = "x86_64-pc-windows-msvc"
$targetDir = Join-Path $root "src-tauri\binaries"
$destName = "bunny-sidecar-$targetTriple.exe"
$dest = Join-Path $targetDir $destName

Write-Host "==> Installing/upgrading PyInstaller"
python -m pip install --upgrade pyinstaller | Out-Host

Write-Host "==> Building onefile sidecar"
python -m PyInstaller `
  --noconfirm `
  --clean `
  --onefile `
  --name bunny-sidecar `
  --paths sidecar `
  --distpath (Join-Path $root "dist\sidecar") `
  --workpath (Join-Path $root "build\sidecar") `
  --specpath (Join-Path $root "build\sidecar") `
  sidecar/main.py

$built = Join-Path $root "dist\sidecar\bunny-sidecar.exe"
if (-not (Test-Path $built)) {
  throw "PyInstaller did not produce $built"
}

New-Item -ItemType Directory -Force -Path $targetDir | Out-Null
Copy-Item -Force $built $dest
Write-Host "==> Sidecar bundled to $dest"

# Also copy plain name for resource_dir resolution in command.rs
$plain = Join-Path $targetDir "bunny-sidecar.exe"
Copy-Item -Force $built $plain
Write-Host "==> Also wrote $plain"

Get-FileHash -Algorithm SHA256 $dest | Format-List | Out-Host
Write-Host "DONE"
