# Private beta packaging — Bunny OS

## Prerequisites

| Tool | Notes |
|---|---|
| Windows 10/11 | Target platform |
| Node.js + npm | Frontend / Tauri CLI |
| Rust + Cargo | Tauri backend |
| VS Build Tools (Desktop C++) | Provides `link.exe` — required for `npm run build` |
| Python 3.11+ | Sidecar + PyInstaller |
| Ollama | External; `http://127.0.0.1:11434` |

## Release build order

```powershell
npm install
python scripts/gen-icons.py
pwsh -File scripts/verify-beta.ps1
pwsh -File scripts/package-sidecar.ps1
npm run build
# Sign the installer on a machine with the code-signing cert
pwsh -File scripts/checksum-release.ps1 -Path src-tauri\target\release\bundle
pwsh -File scripts/export-diagnostics.ps1
```

`package-sidecar.ps1` must run before `npm run build` so Tauri `externalBin` can embed:

`src-tauri/binaries/bunny-sidecar-x86_64-pc-windows-msvc.exe`

## Structured logs

- Location: `%LOCALAPPDATA%\BunnyOS\logs\bunny-YYYY-MM-DD.log`
- Contents: lifecycle / crash / packaging events only
- Retention: 7 days (pruned on write)
- Never logged: transcripts, raw audio, memory fact text, full chat payloads

## Diagnostics

```powershell
pwsh -File scripts/export-diagnostics.ps1
```

Writes under `%LOCALAPPDATA%\BunnyOS\diagnostics\` (toolchain + Ollama health + log tails). Omits transcripts/audio/memory text.

## Signing [human]

- Certificate is **not** stored in the repo
- Set `bundle.windows.certificateThumbprint` only on the signing machine / CI secret
- Publish `SHA256SUMS.txt` with every installer

## Updates & rollback

See [`docs/updates.md`](updates.md).

## Private beta acceptance

See [`docs/beta-checklist.md`](beta-checklist.md).

### Daily-drive gate

Human daily use for several days is required before expanding the action allowlist.
This cannot be automated truthfully in CI.
