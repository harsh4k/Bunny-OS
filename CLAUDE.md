# Bunny OS — Project Context

> Global rules in ~/.claude/CLAUDE.md always apply. This file holds only what's specific to this project. Keep under 150 lines.

## What this is
Bunny OS: local-only privacy-first desktop automation suite for Windows 10/11. No telemetry, no cloud. Personal use only. — PERSONAL

## Live links
| What | URL |
|---|---|
| Repo | https://github.com/harshdreamweaver/bunny-os |
| Vercel | N/A |
| Supabase | N/A |

## Stack (overrides global default)
**Tauri v2 + React/TypeScript + Rust sidecar + Python/faster-whisper + Ollama**.  
- Desktop: Tauri v2 (Windows 10/11 native)
- Frontend: React 18.3.1 + TypeScript 5.9.3 + Vite 6.4.3
- IPC: Typed framed JSON stdio protocol — canonical schema in `contracts/ipc.ts`
- STT: faster-whisper (optional; in-memory push-to-talk)
- Chat: Ollama (external; user runs locally via `ollama serve`)
- Local DB: SQLite memory under `%LOCALAPPDATA%\BunnyOS\` with review/delete/export/off
- No shell execution (cmd.exe/powershell forbidden); Win32/Tauri APIs allowed
- Allowlisted MVP actions only: `open_app`, `open_url`, `youtube_search`, `youtube_play`, `spotify_open`, `spotify_search`, `spotify_play`, `media_play`, `media_next`, `media_prev`, `show_system_summary`, `get_local_time`, `get_local_date`, `respond`
- Voice fast-path: time/date/open/youtube/spotify/media matched locally before Ollama; errors are spoken aloud
- No LLM-invented tools — new capabilities must be added to the typed allowlist
- `youtube_play` may do one user-triggered HTTPS GET to youtube.com to open the first watch URL (no API key)
- `spotify_play` only opens search results — Spotify's pages are client-rendered so no entity ID is resolvable without an authenticated Web API. It must never claim a track is playing
- `media_play` / `media_next` / `media_prev` send Win32 multimedia keys (resume last track, skip, previous) — no cloud
- TTS uses the Windows default SAPI voice (no cloud neural voices)

## Database & storage
| What | Format | Location | Controls |
|---|---|---|---|
| Session state | SQLite persistent | Tauri app-data | Review/delete/export on exit |
| Logs | Text | Tauri app-data/logs/ | Daily rotation; 7-day retention |
| Config | TOML | Tauri app-data/ | User-editable

## Security & privacy
- **Threat model:** prompt injection, malicious app/URLs, sidecar spoofing, microphone privacy, memory leakage, update/package integrity
- **Privacy contract:** All data stays local. Ollama & faster-whisper run on user's machine. No cloud calls.
- **Action validation:** IPC commands typed in Rust enum; no `any` types or index signatures; allowlist enforced at sidecar entry
- **Microphone:** Opt-in only; audio transcribed in-memory by faster-whisper; never persisted raw
- **Data retention:** SQLite persistent with user controls (review/delete/export); logs rotate daily, kept 7 days
- **Shell execution:** cmd.exe, powershell, and free-form shells forbidden; Win32/Tauri APIs allowed
- **Updates & signing:** [PLANNED] Signed releases, hash verification (keys never in repo)

## Project-specific hard rules
- Do NOT add cloud APIs, telemetry, or external calls beyond Ollama & faster-whisper
- Do NOT execute shell commands (cmd.exe, powershell, free-form); Win32/Tauri APIs only
- Do NOT persist raw audio or private data
- IPC payloads must be fully typed in Rust (no `any`, no index signatures); discriminated unions only
- faster-whisper & Ollama not bundled; user-provided
- Signing keys, checksums, update verification: [PLANNED] never store private keys in repo

## Run commands
```powershell
npm install
python scripts/gen-icons.py
pwsh -File scripts/verify-beta.ps1
pwsh -File scripts/check-p0.ps1          # frozen sidecar; full installer if MSVC present
# pwsh -File scripts/prepare-release.ps1 # needs MSVC + PyInstaller path
# pwsh -File scripts/export-diagnostics.ps1
```

## Current status
- Done: Architecture/security contract through voice, wake, memory
- Done: Packaging scripts, structured logs, diagnostics, first-run notice, beta checklist
- Done: P0 wiring — `externalBin`, `requirements-bundle.txt`, hardened `package-sidecar.ps1`, CI `release-windows.yml`
- Human gates: MSVC `npm run build` (or tag `v*` for CI), code-signing cert, daily-drive soak (`docs/beta-checklist.md`)
- Next (P1): `install.ps1` one-liner once a release artifact exists
