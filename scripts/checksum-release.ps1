# Compute SHA256 checksums for release artifacts.
# Usage:
#   pwsh -File scripts/checksum-release.ps1 -Path path\to\BunnyOS_0.1.0_x64.msi
#   pwsh -File scripts/checksum-release.ps1 -Path src-tauri\binaries

param(
  [Parameter(Mandatory = $true)]
  [string]$Path
)

$ErrorActionPreference = "Stop"

$items = @()
if (Test-Path $Path -PathType Container) {
  $items = Get-ChildItem $Path -File | Where-Object { $_.Extension -in ".exe", ".msi", ".msix" }
} elseif (Test-Path $Path -PathType Leaf) {
  $items = @(Get-Item $Path)
} else {
  throw "Path not found: $Path"
}

if ($items.Count -eq 0) {
  throw "No release artifacts found under $Path"
}

$out = Join-Path (Split-Path -Parent $items[0].FullName) "SHA256SUMS.txt"
$lines = @()
foreach ($item in $items) {
  $hash = (Get-FileHash -Algorithm SHA256 $item.FullName).Hash.ToLowerInvariant()
  $lines += "$hash  $($item.Name)"
  Write-Host "$hash  $($item.Name)"
}
$lines | Set-Content -Path $out -Encoding ASCII
Write-Host "Wrote $out"
