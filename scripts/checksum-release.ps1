# Compute SHA256 checksums for release artifacts (Windows + macOS).
# Usage:
#   pwsh -File scripts/checksum-release.ps1 -Path path\to\bundle
#   pwsh -File scripts/checksum-release.ps1 -Path .\BunnyOS_0.1.0_x64.msi

param(
  [Parameter(Mandatory = $true)]
  [string]$Path
)

$ErrorActionPreference = "Stop"

$ext = @(".exe", ".msi", ".msix", ".dmg", ".app")
$items = @()
if (Test-Path $Path -PathType Container) {
  $items = Get-ChildItem $Path -File -Recurse | Where-Object { $_.Extension.ToLowerInvariant() -in $ext }
} elseif (Test-Path $Path -PathType Leaf) {
  $items = @(Get-Item $Path)
} else {
  throw "Path not found: $Path"
}

if ($items.Count -eq 0) {
  throw "No release artifacts found under $Path"
}

$outDir = if (Test-Path $Path -PathType Container) { (Resolve-Path $Path).Path } else { Split-Path -Parent (Resolve-Path $Path).Path }
$out = Join-Path $outDir "SHA256SUMS.txt"
$lines = @()
foreach ($item in $items) {
  $hash = (Get-FileHash -Algorithm SHA256 $item.FullName).Hash.ToLowerInvariant()
  $lines += "$hash  $($item.Name)"
  Write-Host "$hash  $($item.Name)"
}
$lines | Set-Content -Path $out -Encoding ASCII
Write-Host "Wrote $out"
