# Bunny OS Windows bootstrap
# Usage:
#   irm https://raw.githubusercontent.com/harsh4k/Bunny-OS/main/install.ps1 | iex
#   pwsh -File install.ps1 -WhatIf
#   pwsh -File install.ps1 -LocalMsi .\BunnyOS_0.1.0_x64_en-US.msi
#
# Downloads the GitHub Release installer, REQUIRES SHA256SUMS.txt verify, installs, launches.

[CmdletBinding()]
param(
  [string]$Repo = "harsh4k/Bunny-OS",
  [string]$Version = "latest",
  [string]$LocalMsi = "",
  [switch]$WhatIf,
  [switch]$SkipLaunch
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

function Write-Step([string]$msg) { Write-Host "==> $msg" -ForegroundColor Cyan }
function Write-Warn([string]$msg) { Write-Host "WARN: $msg" -ForegroundColor Yellow }
function Write-Fail([string]$msg) { Write-Host "ERROR: $msg" -ForegroundColor Red; exit 1 }

function Get-Release {
  param([string]$Repo, [string]$Version)
  $headers = @{
    "Accept"               = "application/vnd.github+json"
    "User-Agent"           = "BunnyOS-Install"
    "X-GitHub-Api-Version" = "2022-11-28"
  }
  if ($env:GITHUB_TOKEN) { $headers["Authorization"] = "Bearer $($env:GITHUB_TOKEN)" }

  if ($Version -eq "latest") {
    $url = "https://api.github.com/repos/$Repo/releases/latest"
    try {
      return Invoke-RestMethod -Uri $url -Headers $headers -Method Get
    } catch {
      $listUrl = "https://api.github.com/repos/$Repo/releases?per_page=10"
      $list = Invoke-RestMethod -Uri $listUrl -Headers $headers -Method Get
      $pick = @($list) | Where-Object { -not $_.draft } | Select-Object -First 1
      if (-not $pick) {
        Write-Fail "Could not fetch release from $url — $($_.Exception.Message). Publish v0.1.0 after CI, or pass -LocalMsi."
      }
      return $pick
    }
  } else {
    $tag = if ($Version.StartsWith("v")) { $Version } else { "v$Version" }
    $url = "https://api.github.com/repos/$Repo/releases/tags/$tag"
    try {
      return Invoke-RestMethod -Uri $url -Headers $headers -Method Get
    } catch {
      Write-Fail "Could not fetch release from $url — $($_.Exception.Message)."
    }
  }
}

function Find-InstallerAsset($release) {
  $assets = @($release.assets)
  $msi = $assets | Where-Object { $_.name -match '\.msi$' } | Select-Object -First 1
  if ($msi) { return $msi }
  $exe = $assets | Where-Object { $_.name -match '(?i)(setup|installer).*\.exe$' } | Select-Object -First 1
  if ($exe) { return $exe }
  return $null
}

function Find-ChecksumAsset($release) {
  $assets = @($release.assets)
  $exact = $assets | Where-Object { $_.name -eq "SHA256SUMS.txt" } | Select-Object -First 1
  if ($exact) { return $exact }
  return $assets | Where-Object {
    $_.name -match '(?i)(sha256|checksums)'
  } | Select-Object -First 1
}

function Test-Sha256([string]$Path, [string]$Expected) {
  $actual = (Get-FileHash -Algorithm SHA256 -Path $Path).Hash.ToLowerInvariant()
  $want = $Expected.Trim().ToLowerInvariant() -replace '\s.*$', ''
  if ($actual -ne $want) {
    Write-Fail "SHA256 mismatch for $Path`n  expected $want`n  actual   $actual"
  }
  Write-Host "OK: SHA256 verified"
}

function Install-Msi([string]$Path) {
  Write-Step "Running installer: $Path"
  if ($WhatIf) {
    Write-Host "[WhatIf] msiexec /i `"$Path`""
    return
  }
  # Prefer interactive so UAC / SmartScreen prompts are visible on first install.
  $p = Start-Process -FilePath "msiexec.exe" -ArgumentList @("/i", "`"$Path`"") -Wait -PassThru
  if ($p.ExitCode -ne 0 -and $p.ExitCode -ne 3010) {
    Write-Warn "msiexec exited $($p.ExitCode); launching installer UI directly."
    Start-Process -FilePath $Path -Wait | Out-Null
  }
}

function Test-Ollama {
  try {
    $r = Invoke-WebRequest -Uri "http://127.0.0.1:11434/api/tags" -UseBasicParsing -TimeoutSec 2
    return $r.StatusCode -eq 200
  } catch {
    return $false
  }
}

Write-Host "Bunny OS installer (Windows)"
Write-Host "Repo: $Repo  Version: $Version"
if ($WhatIf) { Write-Host "(WhatIf — no download / install)" }

$installerPath = $null

if ($LocalMsi) {
  if (-not (Test-Path $LocalMsi)) { Write-Fail "LocalMsi not found: $LocalMsi" }
  $installerPath = (Resolve-Path $LocalMsi).Path
  Write-Step "Using local installer $installerPath"
} else {
  Write-Step "Fetching release metadata"
  $release = Get-Release -Repo $Repo -Version $Version
  Write-Host "Release: $($release.tag_name) — $($release.name)"

  $asset = Find-InstallerAsset $release
  if (-not $asset) {
    Write-Fail "No .msi/.exe installer asset on release $($release.tag_name)."
  }

  $sumAsset = Find-ChecksumAsset $release
  if (-not $sumAsset) {
    Write-Fail "Release $($release.tag_name) has no SHA256SUMS.txt — refusing to install unverified software."
  }

  $tmp = Join-Path $env:TEMP "bunny-os-install"
  New-Item -ItemType Directory -Force -Path $tmp | Out-Null
  $installerPath = Join-Path $tmp $asset.name

  if ($WhatIf) {
    Write-Host "[WhatIf] would download $($asset.browser_download_url) → $installerPath"
    Write-Host "[WhatIf] would verify against $($sumAsset.browser_download_url)"
  } else {
    Write-Step "Downloading $($asset.name)"
    Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $installerPath -UseBasicParsing
    $sumPath = Join-Path $tmp $sumAsset.name
    Write-Step "Downloading checksums $($sumAsset.name)"
    Invoke-WebRequest -Uri $sumAsset.browser_download_url -OutFile $sumPath -UseBasicParsing
    $line = Get-Content $sumPath | Where-Object { $_ -match [regex]::Escape($asset.name) } | Select-Object -First 1
    if (-not $line) {
      Write-Fail "Checksum file has no line for $($asset.name)"
    }
    $hash = ($line -split '\s+')[0]
    Test-Sha256 -Path $installerPath -Expected $hash
  }
}

Install-Msi -Path $installerPath

Write-Step "Checking Ollama"
if (Test-Ollama) {
  Write-Host "OK: Ollama is reachable on 127.0.0.1:11434"
} else {
  Write-Warn "Ollama not running yet — Bunny will offer Install & start Ollama on first launch."
}

if (-not $SkipLaunch -and -not $WhatIf) {
  $candidates = @(
    "$env:LOCALAPPDATA\Programs\Bunny OS\Bunny OS.exe",
    "$env:ProgramFiles\Bunny OS\Bunny OS.exe"
  )
  $app = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
  if ($app) {
    Write-Step "Launching $app"
    Start-Process $app | Out-Null
  } else {
    Write-Warn "Installed app not found at the usual paths — launch Bunny OS from the Start Menu."
  }
}

Write-Host "DONE — complete onboarding in the app (mic + Install Ollama if offered)."
Write-Host "Uninstall: https://github.com/harsh4k/Bunny-OS/blob/main/docs/uninstall.md"
Write-Host ""
Write-Host "UNSIGNED BETA: If SmartScreen says Windows protected your PC → More info → Run anyway."
