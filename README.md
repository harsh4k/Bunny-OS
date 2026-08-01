# Bunny OS

Local-only, privacy-first desktop automation suite for Windows 10/11. No telemetry, no cloud.

## Quick start

### Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Windows | 10 / 11 | Target platform |
| Node.js | 24.18.0 | Tested version |
| npm | 11.16.0 | Tested version |
| Rust / Cargo | 1.97.1 | Required for Tauri backend |
| Visual Studio Build Tools 2019+ | latest | **Required** — provides `link.exe` for MSVC target |
| Python | 3.11+ | For sidecar subprocess |
| Ollama | user-installed | Run `ollama serve` before using Respond action |

> **Rust / Windows build note:** The default Rust target is `x86_64-pc-windows-msvc`.  
> [Install Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) with the "C++ Build Tools" workload before running `cargo` or `npm run build`.

### Setup

```powershell
# 1. Install Node dependencies
npm install

# 2. Generate placeholder icons (replace with real art before release)
python scripts/gen-icons.py

# 3. Start dev server (Tauri + Vite hot reload)
npm run dev
```

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Tauri dev window with Vite hot reload |
| `npm run build` | Production `.exe` bundle |
| `npm run lint` | TypeScript type-check (`tsc --noEmit`) |
| `npm test` | Vitest unit tests |
| `cargo check` | Rust type-check (from `src-tauri/`) — needs MSVC `link.exe` |
| `cargo test` | Rust unit tests (from `src-tauri/`) — needs MSVC `link.exe` |
| `python -m unittest discover -s sidecar/tests` | Python sidecar tests |
| `pwsh -File scripts/package-sidecar.ps1` | Bundle sidecar with PyInstaller |
| `pwsh -File scripts/export-diagnostics.ps1` | Local diagnostics dump |

## Features (MVP)

- **Allowlisted actions** — `open_app`, `open_url`, `youtube_search`, `show_system_summary` (Rust broker; no free-form shell)
- **Typed Ollama chat** — streaming assistant with Cancel; action proposals need click-to-confirm
- **Model Advisor** — hardware inventory + Fast/Balanced/Quality recommendations; pull only after confirm
- **Voice** — push-to-talk, mute, cancel; optional faster-whisper + Windows SAPI TTS
- **Wake word** — openWakeWord scaffold + Talk/hotkey fallback; never authorizes actions
- **Memory** — local SQLite facts with Off / Forget / Delete all / Export; treated as untrusted data

## System tray

Right-click the tray icon for: Open, Push-to-talk (opens panel), Toggle Mute, Wake/Settings, Quit.  
Left-click shows / hides the compact panel. Closing the window hides to tray.

## Architecture

| Layer | Tech | Language |
|---|---|---|
| Desktop | Tauri v2 (2.x) | Rust |
| Frontend | React 18 + Vite 6 + TypeScript 5 | TypeScript/TSX |
| IPC contracts | `contracts/ipc.ts` | TypeScript (canonical) |
| Sidecar | Python subprocess | Python 3.11+ |
| STT | faster-whisper | Python _(optional)_ |
| TTS | Windows SAPI | PowerShell argv (no `shell=True`) |
| Chat | Ollama | External (`ollama serve`) |
| DB | SQLite | `%LOCALAPPDATA%\BunnyOS\memory.db` |

## IPC Protocol

Framed JSON over stdin/stdout: `[4-byte u32 LE length][UTF-8 JSON payload]`

Full schema: [`contracts/ipc.ts`](contracts/ipc.ts) — mirrored in  
- Rust: [`src-tauri/src/ipc.rs`](src-tauri/src/ipc.rs)  
- Python: [`sidecar/ipc_types.py`](sidecar/ipc_types.py)

## Lifecycle states

```
stopped → starting → ready
                  ↘ degraded (crash, auto-recovers ≤3 times)
                  ↘ error    (unrecoverable; manual Recover action)
```

## Privacy

✓ **All data local.** No cloud calls, no telemetry.  
✓ **STT + Chat.** faster-whisper (transcription) + Ollama (text generation); both local-only.  
✓ **Opt-in audio.** Microphone starts muted; audio stays in-memory, never persisted raw.  
✓ **Persistent storage.** SQLite memory with review/delete/export/off controls.  
✓ **Voice ≠ authority.** Wake/PTT never approve privileged actions — click/confirm required.

## Threat model

| Threat | Mitigation |
|---|---|
| Prompt injection | Input validation at sidecar; enum-based actions |
| Malicious app/URL names | Allowlist in Rust; URL scheme validation |
| Sidecar spoofing | Child process spawned by Tauri only; framed IPC |
| Microphone privacy | Default muted; no raw audio persistence |
| Memory injection | Memories labeled untrusted; persona stays first |
| Update integrity | [PLANNED] Signed releases; hash verification |

## Packaging / private beta

```powershell
pwsh -File scripts/verify-beta.ps1          # automated gates
pwsh -File scripts/package-sidecar.ps1      # PyInstaller → src-tauri/binaries
pwsh -File scripts/prepare-release.ps1      # verify + sidecar + tauri build (MSVC)
pwsh -File scripts/export-diagnostics.ps1   # local diag bundle (no transcripts)
```

Human gates (signing + daily-drive): [`docs/beta-checklist.md`](docs/beta-checklist.md), [`docs/updates.md`](docs/updates.md).

## Documentation

- **CLAUDE.md** — Project contract & stack
- **contracts/ipc.ts** — Canonical IPC schema (TS/Rust/Python mirror)
- **docs/architecture.md** — System design, IPC, security model
- **docs/security.md** — Threat model, privacy controls, data retention
- **docs/packaging.md** — Private beta build / signing checklist
- **docs/beta-checklist.md** — Install / soak / security sign-off
- **docs/updates.md** — Manual updates + rollback

## Dependencies

| Package | Version |
|---|---|
| `@tauri-apps/api` | 2.11.1 |
| `react` | 18.3.1 |
| `vite` | 6.4.3 |
| `typescript` | 5.9.3 |
| `vitest` | 2.1.9 |
| `tauri` (Rust crate) | 2.x |
| `tauri-plugin-single-instance` | 2.x |
| `tokio` | 1.x |
