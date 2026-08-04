# Package Bunny OS Python sidecar with PyInstaller (Windows).
# Output (Tauri externalBin convention):
#   src-tauri/binaries/bunny-sidecar-x86_64-pc-windows-msvc.exe
#
# Prefer a real install of Python 3.11+ — not a random activated venv.
# Override with:  $env:BUNNY_PYTHON = "C:\Path\To\python.exe"

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Resolve-BunnyPython {
  if ($env:BUNNY_PYTHON -and (Test-Path $env:BUNNY_PYTHON)) {
    return (Resolve-Path $env:BUNNY_PYTHON).Path
  }
  $candidates = @(
    "$env:LOCALAPPDATA\Programs\Python\Python312\python.exe",
    "$env:LOCALAPPDATA\Programs\Python\Python311\python.exe",
    "$env:ProgramFiles\Python312\python.exe",
    "$env:ProgramFiles\Python311\python.exe"
  )
  foreach ($c in $candidates) {
    if (Test-Path $c) { return $c }
  }
  $cmd = Get-Command python -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  throw "Python 3.11+ not found. Install from python.org or set BUNNY_PYTHON."
}

$python = Resolve-BunnyPython
Write-Host "==> Using Python: $python"
& $python -c "import sys; assert sys.version_info >= (3, 11), sys.version"

$targetTriple = if ($env:BUNNY_SIDECAR_TRIPLE) {
  $env:BUNNY_SIDECAR_TRIPLE
} else {
  "x86_64-pc-windows-msvc"
}
$targetDir = Join-Path $root "src-tauri\binaries"
$destName = "bunny-sidecar-$targetTriple.exe"
$dest = Join-Path $targetDir $destName
$distDir = Join-Path $root "dist\sidecar"
$workDir = Join-Path $root "build\sidecar"
$bundleReqs = Join-Path $root "sidecar\requirements-bundle.txt"

Write-Host "==> Installing bundle dependencies (PyInstaller + voice runtime)"
& $python -m pip install --upgrade pip | Out-Host
& $python -m pip install -r $bundleReqs | Out-Host
if ($LASTEXITCODE -ne 0) { throw "pip install of requirements-bundle.txt failed" }

$whisperDir = Join-Path $workDir "whisper_models"
$prefetch = $env:BUNNY_PREFETCH_WHISPER -eq "1"
if ($prefetch) {
  Write-Host "==> Prefetching Whisper 'base' weights into $whisperDir (no first-run download)"
  New-Item -ItemType Directory -Force -Path $whisperDir | Out-Null
  $env:HF_HUB_DISABLE_SYMLINKS = "1"
  & $python (Join-Path $root "scripts\prefetch_whisper.py") $whisperDir
  if ($LASTEXITCODE -ne 0) { throw "Whisper prefetch failed" }
  $bins = Get-ChildItem -Path $whisperDir -Recurse -Filter model.bin -File -ErrorAction SilentlyContinue |
    Where-Object { $_.Length -gt 0 -and -not $_.LinkType }
  if (-not $bins) { throw "Whisper prefetch left no real model.bin under $whisperDir" }
}

Write-Host "==> Building onefile sidecar"
$pyArgs = @(
  "-m", "PyInstaller",
  "--noconfirm",
  "--clean",
  "--onefile",
  # WINDOWS_GUI subsystem — no black console window when Bunny starts the sidecar.
  # stdin/stdout pipes used for IPC still work; only the visible console is gone.
  "--noconsole",
  "--name", "bunny-sidecar",
  "--paths", "sidecar",
  "--distpath", $distDir,
  "--workpath", $workDir,
  "--specpath", $workDir,
  "--collect-all", "faster_whisper",
  "--collect-all", "ctranslate2",
  "--collect-all", "sounddevice",
  "--collect-all", "openwakeword",
  "--collect-all", "onnxruntime",
  "--hidden-import", "win32com",
  "--hidden-import", "win32com.client",
  "--hidden-import", "pythoncom",
  "--hidden-import", "pywintypes",
  "--hidden-import", "local_actions",
  "--hidden-import", "voice_intents",
  "--hidden-import", "voice_worker",
  "--hidden-import", "media_keys",
  "--hidden-import", "youtube_resolve",
  "--hidden-import", "tts",
  "--hidden-import", "stt",
  "--hidden-import", "wake_word",
  "--hidden-import", "wake_phrase",
  "--hidden-import", "wake_oww",
  "--hidden-import", "paths",
  "--hidden-import", "platform_open"
)
if ($prefetch -and (Test-Path $whisperDir)) {
  $pyArgs += @("--add-data", "${whisperDir};whisper_models")
}
$pyArgs += "sidecar/main.py"
& $python @pyArgs
if ($LASTEXITCODE -ne 0) { throw "PyInstaller failed (exit $LASTEXITCODE)" }

$built = Join-Path $distDir "bunny-sidecar.exe"
if (-not (Test-Path $built)) {
  throw "PyInstaller did not produce $built"
}

# A console-subsystem sidecar pops a black terminal on the user's desktop, and
# closing it kills Bunny's helper. Never let that build escape again.
$bytes = [System.IO.File]::ReadAllBytes($built)
$peOffset = [System.BitConverter]::ToInt32($bytes, 0x3c)
$subsystem = [System.BitConverter]::ToUInt16($bytes, $peOffset + 24 + 68)
if ($subsystem -ne 2) {
  throw "bunny-sidecar.exe is subsystem $subsystem (need 2 = WINDOWS_GUI). Is --noconsole set?"
}
Write-Host "==> Verified sidecar is WINDOWS_GUI (no console window)"

New-Item -ItemType Directory -Force -Path $targetDir | Out-Null
Copy-Item -Force $built $dest
Write-Host "==> Sidecar bundled to $dest"

# Tauri picks externalBin by *host* triple. Local MinGW dev uses *-gnu.exe while
# release CI uses *-msvc.exe — ship both names for the same PE on Windows.
if ($targetTriple -match "windows") {
  foreach ($alt in @("x86_64-pc-windows-msvc", "x86_64-pc-windows-gnu")) {
    $altPath = Join-Path $targetDir "bunny-sidecar-$alt.exe"
    if ($altPath -ne $dest) {
      Copy-Item -Force $built $altPath
      Write-Host "==> Also wrote $altPath (toolchain alias)"
    }
  }
}

# Plain name for resource_dir fallback in command.rs
$plain = Join-Path $targetDir "bunny-sidecar.exe"
Copy-Item -Force $built $plain
Write-Host "==> Also wrote $plain"

# Keep a checksum next to the binary for release scripts.
$hash = (Get-FileHash -Algorithm SHA256 $dest).Hash
$hash | Set-Content -Encoding ascii (Join-Path $targetDir "$destName.sha256")
Get-FileHash -Algorithm SHA256 $dest | Format-List | Out-Host

Write-Host "==> Smoke: launch frozen binary until ready frame"
$smokeOut = Join-Path $workDir "smoke-stdout.bin"
$smokeErr = Join-Path $workDir "smoke-stderr.txt"
New-Item -ItemType Directory -Force -Path $workDir | Out-Null
if (Test-Path $smokeOut) { Remove-Item -Force $smokeOut }
if (Test-Path $smokeErr) { Remove-Item -Force $smokeErr }

$proc = Start-Process -FilePath $dest `
  -RedirectStandardOutput $smokeOut `
  -RedirectStandardError $smokeErr `
  -NoNewWindow -PassThru

function Read-SharedBytes([string]$path) {
  if (-not (Test-Path $path)) { return [byte[]]@() }
  $fs = [IO.File]::Open(
    $path,
    [IO.FileMode]::Open,
    [IO.FileAccess]::Read,
    [IO.FileShare]::ReadWrite
  )
  try {
    $buf = New-Object byte[] $fs.Length
    if ($buf.Length -eq 0) { return $buf }
    [void]$fs.Read($buf, 0, $buf.Length)
    return $buf
  } finally {
    $fs.Dispose()
  }
}

$gotReady = $false
$deadline = [DateTime]::UtcNow.AddSeconds(60)
try {
  while ([DateTime]::UtcNow -lt $deadline) {
    $bytes = Read-SharedBytes $smokeOut
    if ($bytes.Length -ge 5) {
      $text = [Text.Encoding]::UTF8.GetString($bytes)
      if ($text -match '"type"\s*:\s*"ready"') {
        $gotReady = $true
        break
      }
    }
    if ($proc.HasExited) { break }
    Start-Sleep -Milliseconds 200
  }
  if (-not $gotReady) {
    $err = if (Test-Path $smokeErr) { Get-Content $smokeErr -Raw } else { "" }
    $exit = if ($proc.HasExited) { $proc.ExitCode } else { "running" }
    throw "Frozen sidecar did not emit ready frame (exit=$exit). stderr=`n$err"
  }
  Write-Host "OK: frozen sidecar ready"
} finally {
  if (-not $proc.HasExited) {
    Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
    $proc.WaitForExit(5000) | Out-Null
  }
}

Write-Host "DONE"
