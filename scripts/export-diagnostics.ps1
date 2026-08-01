# Emit a local diagnostics bundle (no transcripts/audio/memory text by default).
$ErrorActionPreference = "Stop"

$outDir = Join-Path $env:LOCALAPPDATA "BunnyOS\diagnostics"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$out = Join-Path $outDir "diag-$stamp.txt"

$lines = @(
  "Bunny OS diagnostics $stamp"
  "OS: $([System.Environment]::OSVersion.VersionString)"
  "User: $env:USERNAME"
  "Computer: $env:COMPUTERNAME"
  "PowerShell: $($PSVersionTable.PSVersion)"
  ""
  "Toolchain:"
  "  node: $(try { node --version } catch { 'missing' })"
  "  npm:  $(try { npm --version } catch { 'missing' })"
  "  python: $(try { python --version 2>&1 } catch { 'missing' })"
  "  rustc: $(try { rustc --version } catch { 'missing' })"
  "  cargo: $(try { cargo --version } catch { 'missing' })"
  "  link.exe: $(if (Get-Command link.exe -ErrorAction SilentlyContinue) { (Get-Command link.exe).Source } else { 'MISSING — install VS Build Tools C++' })"
  ""
  "Ollama /api/tags:"
)

$lines | Set-Content -Path $out -Encoding UTF8

try {
  $tags = Invoke-WebRequest -Uri "http://127.0.0.1:11434/api/tags" -TimeoutSec 3
  Add-Content -Path $out -Value $tags.Content
} catch {
  Add-Content -Path $out -Value "Ollama unreachable: $($_.Exception.Message)"
}

$logDir = Join-Path $env:LOCALAPPDATA "BunnyOS\logs"
Add-Content -Path $out -Value ""
Add-Content -Path $out -Value "Recent logs directory: $logDir"
if (Test-Path $logDir) {
  Get-ChildItem $logDir -Filter "*.log" |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 3 |
    ForEach-Object {
      Add-Content -Path $out -Value ("--- " + $_.Name + " (tail, sanitized lifecycle only expected) ---")
      Get-Content $_.FullName -Tail 40 | Add-Content -Path $out
    }
} else {
  Add-Content -Path $out -Value "(no logs yet)"
}

Add-Content -Path $out -Value ""
Add-Content -Path $out -Value "NOTE: Transcripts, raw audio, and memory fact text are intentionally omitted."

Write-Host "Wrote $out"
