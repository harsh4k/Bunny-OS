# Automated private-beta verification gates for Bunny OS.
# Human gates (signing certificate, daily-drive soak) are listed at the end and NOT claimed here.

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Step($name, $scriptBlock) {
  Write-Host ""
  Write-Host "==> $name"
  & $scriptBlock
  if ($LASTEXITCODE -ne 0 -and $null -ne $LASTEXITCODE) {
    throw "FAILED: $name (exit $LASTEXITCODE)"
  }
  Write-Host "OK: $name"
}

$failures = @()

try {
  Step "npm test" { npm test -- --run }
  Step "npm run lint" { npm run lint }
  Step "npm run build:frontend" { npm run build:frontend }
  Step "python sidecar tests" { python -m unittest discover -s sidecar/tests }
  Step "cargo fmt --check" {
    cargo fmt --manifest-path src-tauri/Cargo.toml --check
  }
  Step "cargo metadata" {
    cargo metadata --manifest-path src-tauri/Cargo.toml --no-deps --format-version 1 | Out-Null
  }
} catch {
  $failures += $_.Exception.Message
  Write-Host $_
}

$link = Get-Command link.exe -ErrorAction SilentlyContinue
if (-not $link) {
  Write-Host ""
  Write-Host "GATE (environment): MSVC link.exe missing — cannot run cargo test / tauri build on this machine."
  Write-Host "Install Visual Studio Build Tools with Desktop C++ workload, then re-run."
} else {
  try {
    Step "cargo test" { cargo test --manifest-path src-tauri/Cargo.toml }
  } catch {
    $failures += $_.Exception.Message
  }
}

Write-Host ""
Write-Host "======== Automated gate summary ========"
if ($failures.Count -eq 0) {
  Write-Host "PASS: all runnable automated checks succeeded."
} else {
  Write-Host "FAIL:"
  $failures | ForEach-Object { Write-Host " - $_" }
  exit 1
}

Write-Host ""
Write-Host "======== Human gates (not automated) ========"
Write-Host "[ ] MSVC-linked npm run build produces installer"
Write-Host "[ ] Code-sign installer with cert NOT stored in repo"
Write-Host "[ ] Publish SHA256 checksums next to installer"
Write-Host "[ ] Fresh VM install + Ollama-unavailable flow"
Write-Host "[ ] Daily-drive soak (several days) before expanding allowlist"
Write-Host "See docs/beta-checklist.md and docs/packaging.md"
Write-Host "DONE"
