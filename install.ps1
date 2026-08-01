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
# throw, never exit: piped through `irm | iex` this runs in the user's own
# session, where `exit` closes their console window and hides the error.
function Write-Fail([string]$msg) { throw $msg }

function Format-Bytes([double]$n) {
  if ($n -ge 1GB) { return "{0:N2} GB" -f ($n / 1GB) }
  if ($n -ge 1MB) { return "{0:N1} MB" -f ($n / 1MB) }
  if ($n -ge 1KB) { return "{0:N0} KB" -f ($n / 1KB) }
  return "{0:N0} B" -f $n
}

function Write-DownloadProgress {
  param([long]$Done, [long]$Total, [double]$Seconds, [string]$Label)
  $speed = if ($Seconds -gt 0) { $Done / $Seconds } else { 0 }
  if ($Total -gt 0) {
    $pct = [math]::Min(100, [math]::Floor($Done * 100.0 / $Total))
    $eta = if ($speed -gt 0) {
      [TimeSpan]::FromSeconds([math]::Max(0, ($Total - $Done) / $speed)).ToString("mm\:ss")
    } else { "--:--" }
    $line = "    {0,3}%  {1} / {2}  at {3}/s  ETA {4}" -f `
      $pct, (Format-Bytes $Done), (Format-Bytes $Total), (Format-Bytes $speed), $eta
  } else {
    $line = "    {0} at {1}/s" -f (Format-Bytes $Done), (Format-Bytes $speed)
  }
  Write-Host ("`r" + $line.PadRight(72)) -NoNewline
}

function Save-UrlDotNet {
  param([string]$Url, [string]$OutFile)
  Add-Type -AssemblyName System.Net.Http
  $client = [System.Net.Http.HttpClient]::new()
  $client.Timeout = [TimeSpan]::FromMinutes(60)
  try {
    $mode = [System.Net.Http.HttpCompletionOption]::ResponseHeadersRead
    $resp = $client.GetAsync($Url, $mode).GetAwaiter().GetResult()
    if (-not $resp.IsSuccessStatusCode) {
      Write-Fail "HTTP $([int]$resp.StatusCode) downloading $Url"
    }
    $total = 0L
    if ($resp.Content.Headers.ContentLength) { $total = [long]$resp.Content.Headers.ContentLength }
    $in = $resp.Content.ReadAsStreamAsync().GetAwaiter().GetResult()
    $out = [System.IO.File]::Create($OutFile)
    try {
      $buf = New-Object byte[] (1MB)
      $done = 0L; $last = 0L
      $sw = [System.Diagnostics.Stopwatch]::StartNew()
      while (($read = $in.Read($buf, 0, $buf.Length)) -gt 0) {
        $out.Write($buf, 0, $read)
        $done += $read
        if (($sw.ElapsedMilliseconds - $last) -ge 500) {
          $last = $sw.ElapsedMilliseconds
          Write-DownloadProgress -Done $done -Total $total -Seconds $sw.Elapsed.TotalSeconds
        }
      }
      Write-DownloadProgress -Done $done -Total $total -Seconds $sw.Elapsed.TotalSeconds
      Write-Host ""
    } finally { $out.Dispose(); $in.Dispose() }
  } finally { $client.Dispose() }
}

function Save-Url {
  param([string]$Url, [string]$OutFile)
  if (Test-Path $OutFile) { Remove-Item $OutFile -Force -ErrorAction SilentlyContinue }
  # curl.exe ships with Windows 10 1803+ and prints its own %/size/speed/ETA meter.
  $curl = Join-Path $env:SystemRoot "System32\curl.exe"
  if (Test-Path $curl) {
    & $curl -L --fail --retry 3 --retry-delay 2 --retry-connrefused -o $OutFile $Url
    if ($LASTEXITCODE -eq 0 -and (Test-Path $OutFile)) { return }
    Write-Warn "curl exited $LASTEXITCODE — retrying the download in PowerShell"
  }
  Save-UrlDotNet -Url $Url -OutFile $OutFile
  if (-not (Test-Path $OutFile)) { Write-Fail "Download produced no file: $Url" }
}

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

function Invoke-BunnyInstall {

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
    $sizeText = if ($asset.size) { " (" + (Format-Bytes $asset.size) + ")" } else { "" }
    Write-Step "Downloading $($asset.name)$sizeText"
    Save-Url -Url $asset.browser_download_url -OutFile $installerPath
    $sumPath = Join-Path $tmp $sumAsset.name
    Write-Step "Downloading checksums $($sumAsset.name)"
    Save-Url -Url $sumAsset.browser_download_url -OutFile $sumPath
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

}

try {
  Invoke-BunnyInstall
} catch {
  Write-Host ""
  Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host "Bunny OS was not installed. Nothing was changed on this PC." -ForegroundColor Red
  Write-Host "Report it: https://github.com/harsh4k/Bunny-OS/issues"
}
