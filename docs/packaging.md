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
| Windows 10/11 **or** macOS 12+ | Target platforms |
| Node.js + npm | Frontend / Tauri CLI |
| Rust (stable) | Host toolchain — MSVC or MinGW on Windows; Apple clang on macOS |
| VS Build Tools (Desktop C++) | **Windows release** — provides `link.exe` |
| Xcode Command Line Tools | **macOS release** |
| Python 3.11+ | Sidecar freeze (`BUNNY_PYTHON` optional override) |
| Ollama | External; `http://127.0.0.1:11434` |

Local daily-drive on Windows may use MinGW by copying `src-tauri/.cargo/config.toml.windows` → `config.toml` (see that folder’s README). Repo `rust-toolchain.toml` pins `stable` so macOS CI/hosts work. **Release builds use the host’s default linker** (MSVC on `release-windows.yml`, Apple clang on `release-macos.yml`).

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

`package-sidecar.ps1` / `package-sidecar.sh` installs `sidecar/requirements-bundle.txt` into the chosen Python, freezes a onefile binary (STT/TTS/wake included), smokes the ready handshake, and copies into `src-tauri/binaries/` for Tauri `externalBin`.

## CI release

```text
git tag v0.1.0
git push origin v0.1.0
```

Workflows: `.github/workflows/release-windows.yml` and `release-macos.yml`  
Produces **draft prereleases** with the Windows installer and macOS DMG. Signing remains a human step.

## End-user install (P1)

```powershell
irm https://raw.githubusercontent.com/harsh4k/Bunny-OS/main/install.ps1 | iex
```

```bash
curl -fsSL https://raw.githubusercontent.com/harsh4k/Bunny-OS/main/install.sh | bash
```

Or: `pwsh -File install.ps1 -WhatIf` / `-LocalMsi .\path\to.msi`  
macOS: `./install.sh --what-if` / `--local-dmg ./path/to.dmg`  
Test gate: `pwsh -File scripts/test-install.ps1`

## Structured logs

- Location: `%LOCALAPPDATA%\BunnyOS\logs\` (Windows) or `~/Library/Application Support/BunnyOS/logs/` (macOS)
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
