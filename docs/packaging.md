# Private beta packaging — Bunny OS

## P0 status (critical path)

| Gate | What | This machine / CI |
|---|---|---|
| **P0.1** | MSVC `link.exe` + `npm run build` | Needs VS Build Tools **or** GitHub Actions `release-windows.yml` |
| **P0.2** | Frozen sidecar via PyInstaller | `pwsh -File scripts/package-sidecar.ps1` |
| **P0.3** | Sidecar embedded (`bundle.externalBin`) | Wired in `src-tauri/tauri.conf.json` |
| **P0.4** | Publish installer + checksums | Tag `v*` → draft GitHub Release (CI) |

```powershell
# Run whatever this machine can (sidecar always; full installer if MSVC present)
pwsh -File scripts/check-p0.ps1
```

## Prerequisites

| Tool | Notes |
|---|---|
| Windows 10/11 | Target platform |
| Node.js + npm | Frontend / Tauri CLI |
| Rust (MSVC toolchain) | Release builds — `stable-x86_64-pc-windows-msvc` |
| VS Build Tools (Desktop C++) | Provides `link.exe` — required for local `npm run build` |
| Python 3.11+ | Sidecar freeze (`BUNNY_PYTHON` optional override) |
| Ollama | External; `http://127.0.0.1:11434` |

Local daily-drive may use the GNU toolchain (`rust-toolchain.toml`) when MinGW is installed and MSVC is not. **Release builds always use MSVC** (CI overrides the toolchain file).

## Release build order (local, MSVC present)

```powershell
npm install
python scripts/gen-icons.py
pwsh -File scripts/verify-beta.ps1
pwsh -File scripts/package-sidecar.ps1   # writes src-tauri/binaries/bunny-sidecar-x86_64-pc-windows-msvc.exe
npm run build
# Sign the installer on a machine with the code-signing cert
pwsh -File scripts/checksum-release.ps1 -Path src-tauri\target\release\bundle
pwsh -File scripts/export-diagnostics.ps1
```

Or one shot: `pwsh -File scripts/prepare-release.ps1`

`package-sidecar.ps1` installs `sidecar/requirements-bundle.txt` into the chosen Python, freezes a onefile exe (STT/TTS/wake included), smokes the ready handshake, and copies into `src-tauri/binaries/` for Tauri `externalBin`.

## CI release

```text
git tag v0.1.0
git push origin v0.1.0
```

Workflow: `.github/workflows/release-windows.yml`  
Produces a **draft prerelease** with the Windows installer. Signing remains a human step.

## End-user install (P1)

```powershell
irm https://raw.githubusercontent.com/harsh4k/Bunny-OS/main/install.ps1 | iex
```

Or: `pwsh -File install.ps1 -WhatIf` / `-LocalMsi .\path\to.msi`  
Test gate: `pwsh -File scripts/test-install.ps1`

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
