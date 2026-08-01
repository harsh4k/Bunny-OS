# Bunny OS

Local-only, privacy-first desktop automation suite for Windows 10/11 and macOS. No telemetry, no cloud.

## Install (Windows)

```powershell
irm https://raw.githubusercontent.com/harsh4k/Bunny-OS/main/install.ps1 | iex
```

Verifies `SHA256SUMS.txt` from the GitHub Release (fails closed if missing). Needs a published `v*` release.

## Install (macOS)

```bash
curl -fsSL https://raw.githubusercontent.com/harsh4k/Bunny-OS/main/install.sh | bash
```

Picks the DMG for your CPU (Apple Silicon or Intel), verifies SHA256, copies into `/Applications`, and launches. Needs a published `v*` release.

See [docs/SHIPPING.md](docs/SHIPPING.md). **Unsigned beta** — SmartScreen / Gatekeeper warnings are expected (no paid certs).

## Quick start

### Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Windows 10/11 or macOS | current | Target platforms |
| Node.js | 24.18.0 | Tested version |
| npm | 11.16.0 | Tested version |
| Rust / Cargo | stable | Required for Tauri backend |
| Visual Studio Build Tools 2019+ | latest | **Windows** — provides `link.exe` for MSVC (or use MinGW; see note) |
| Xcode CLT | latest | **macOS** — required for Tauri |
| Python | 3.11+ | For sidecar subprocess |
| Ollama | auto via Bunny | Bunny downloads the official installer if missing, starts it, pulls `llama3.2:1b` |

> **Rust toolchain:** Repo pins `stable`. Windows MinGW users: copy `src-tauri/.cargo/config.toml.windows` to `config.toml` (see that folder’s README). MSVC and macOS hosts need no override.

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
| `npm run build` | Production bundle (`.exe` / `.dmg`) |
| `npm run lint` | TypeScript type-check (`tsc --noEmit`) |
| `npm test` | Vitest unit tests |
| `cargo check` | Rust type-check (from `src-tauri/`) |
| `cargo test` | Rust unit tests (from `src-tauri/`) |
| `python -m unittest discover -s sidecar/tests` | Python sidecar tests |
| `pwsh -File scripts/package-sidecar.ps1` | Bundle sidecar (Windows) |
| `bash scripts/package-sidecar.sh` | Bundle sidecar (macOS) |
| `pwsh -File scripts/export-diagnostics.ps1` | Local diagnostics dump |

## Features (MVP)

- **Allowlisted actions** — `open_app`, `open_url`, `youtube_search`, `show_system_summary` (Rust broker; no free-form shell)
- **Typed Ollama chat** — streaming assistant with Cancel; action proposals need click-to-confirm
- **Model Advisor** — hardware inventory + Fast/Balanced/Quality recommendations; pull only after confirm
- **Voice** — push-to-talk, mute, cancel; optional faster-whisper + system TTS
- **Wake word** — custom phrase (default **Hey Bunny**), optional openWakeWord models; Talk/hotkey fallback; never authorizes actions
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
| TTS | Windows SAPI / macOS system voice | Python |
| Chat | Ollama | External (`ollama serve`) |
| DB | SQLite | `%LOCALAPPDATA%\BunnyOS\` (Win) / `~/Library/Application Support/BunnyOS/` (mac) |

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
