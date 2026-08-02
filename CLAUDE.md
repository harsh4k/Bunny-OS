# Bunny OS — Project Context

> Global rules in ~/.claude/CLAUDE.md always apply. This file holds only what's specific to this project. Keep under 150 lines.

## What this is
Bunny OS: local-only privacy-first desktop automation suite for Windows 10/11 and macOS. No telemetry, no cloud. Personal use only. — PERSONAL

## Live links
| What | URL |
|---|---|
| Repo | https://github.com/harsh4k/Bunny-OS |
| Vercel | N/A |
| Supabase | N/A |

## Stack (overrides global default)
**Tauri v2 + React/TypeScript + Rust sidecar + Python/faster-whisper + Ollama**.  
- Desktop: Tauri v2 (Windows 10/11 + macOS)
- Frontend: React 18.3.1 + TypeScript 5.9.3 + Vite 6.4.3
- IPC: Typed framed JSON stdio protocol — canonical schema in `contracts/ipc.ts`
- STT: faster-whisper (optional; in-memory push-to-talk)
- Chat: Ollama (auto-installed on first run from official ollama.com build if missing; default model `llama3.2:1b`)
- Local DB: SQLite under `%LOCALAPPDATA%\BunnyOS\` (Windows) or `~/Library/Application Support/BunnyOS/` (macOS)
- No shell execution (cmd.exe/powershell/osascript forbidden); Win32 / LaunchServices / Tauri APIs allowed
- Allowlisted MVP actions only: `open_app`, `open_url`, `youtube_search`, `youtube_play`, `spotify_open`, `spotify_search`, `spotify_play`, `media_play`, `media_next`, `media_prev`, `show_system_summary`, `get_local_time`, `get_local_date`, `respond`, `browser_scroll`, `browser_type`, `browser_click_role`, `browser_focus_search` (type/click need confirm)
- Voice fast-path: time/date/open/youtube/spotify/media matched locally before Ollama; errors are spoken aloud
- Wake word: custom text phrase (default **hey bunny**), persisted under app-data `wake/`; optional openWakeWord models; never authorizes actions
- No LLM-invented tools — new capabilities must be added to the typed allowlist
- `youtube_play` may do one user-triggered HTTPS GET to youtube.com to open the first watch URL (no API key)
- Updates panel may do one user-triggered HTTPS GET to GitHub Releases API to compare versions (no silent check; no download/install)
- `spotify_play` only opens search results — Spotify's pages are client-rendered so no entity ID is resolvable without an authenticated Web API. It must never claim a track is playing
- `media_play` / `media_next` / `media_prev` — Win32 multimedia keys on Windows; IOKit NX aux keys on macOS — no cloud
- TTS: Windows SAPI / macOS system voice (no cloud neural voices)

## Database & storage
| What | Format | Location | Controls |
|---|---|---|---|
| Session state | SQLite persistent | Tauri app-data | Review/delete/export on exit |
| Logs | Text | Tauri app-data/logs/ | Daily rotation; 7-day retention |
| Config | TOML | Tauri app-data/ | User-editable |

## Security & privacy
- **Threat model:** prompt injection, malicious app/URLs, sidecar spoofing, microphone privacy, memory leakage, update/package integrity
- **Privacy contract:** All data stays local. Ollama & faster-whisper run on user's machine. No cloud calls.
- **Action validation:** IPC commands typed in Rust enum; no `any` types or index signatures; allowlist enforced at sidecar entry
- **Microphone:** Opt-in only; audio transcribed in-memory by faster-whisper; never persisted raw
- **Data retention:** SQLite persistent with user controls (review/delete/export); logs rotate daily, kept 7 days
- **Shell execution:** cmd.exe, powershell, osascript, and free-form shells forbidden; Win32 / LaunchServices / Tauri APIs allowed
- **Updates & signing:** [PLANNED] Signed releases, notarization, hash verification (keys never in repo)

## Project-specific hard rules
- Do NOT add cloud APIs, telemetry, or external calls beyond Ollama & faster-whisper
- Do NOT execute shell commands (cmd.exe, powershell, osascript, free-form); Win32 / LaunchServices / Tauri APIs only
- Do NOT persist raw audio or private data
- IPC payloads must be fully typed in Rust (no `any`, no index signatures); discriminated unions only
- faster-whisper weights are prefetched into the frozen sidecar in CI; Ollama is auto-bootstrapped from the official installer on first run (not redistributed inside our MSI/DMG)
- Signing keys, checksums, update verification: [PLANNED] never store private keys in repo

## Run commands
```powershell
npm install
python scripts/gen-icons.py
pwsh -File scripts/verify-beta.ps1
pwsh -File scripts/check-p0.ps1          # frozen sidecar; full installer if MSVC present
# pwsh -File scripts/package-sidecar.ps1
# bash scripts/package-sidecar.sh        # macOS
# pwsh -File scripts/prepare-release.ps1 # needs MSVC + PyInstaller path
# pwsh -File scripts/export-diagnostics.ps1
```

## Toolchain notes
- `rust-toolchain.toml` pins `stable` (works on Windows + macOS CI/hosts).
- Local Windows MinGW: copy `src-tauri/.cargo/config.toml.windows` → `config.toml` (see `.cargo/README.md`).

## Current status
- Done: Architecture/security contract through voice, wake, memory
- Done: Packaging scripts, structured logs, diagnostics, first-run notice, beta checklist
- Done: P0 — frozen sidecar, `externalBin`, Windows release CI
- Done: P1 — `install.ps1` one-liner bootstrap (`-WhatIf` / `-LocalMsi`)
- Done: P2 — onboarding wizard (scan + mic/sound settings + Ollama)
- Done: P3 — uninstall docs + beta checklist install path
- Done: P4 — macOS app catalog, media keys, `install.sh`, `package-sidecar.sh`, unified `release.yml`
- Done: Custom wake phrase (default **hey bunny**) + production install harden (checksum fail-closed, Whisper prefetch, first-run UI)
- Done: v0.1.1 patch (wake persist, island click-through, memory auto-facts, voice domain)
- Done: Next-update W1 — session log + app aliases
- Done: Next-update W2 — voice follow-up v2 + wake profiles/VAD
- Done: Next-update W3 — opt-in screen context (focused-window UIA/AX text; default Off)
- Done: Next-update W4 — allowlisted browser tools + confirm UX
- Done: Updates panel — version + Open Releases + optional GitHub compare (manual install)
- Next: soak / tag as needed (`docs/beta-checklist.md`)
- Human gates: soak on Win + Mac after CI artifacts (`docs/beta-checklist.md`); unsigned beta OK (no paid certs)
- Tag release: `git tag v0.2.1 && git push origin v0.2.1` → MSI + Mac DMGs + `SHA256SUMS.txt`
- Legal: Privacy + Terms (India / DPDP-oriented) in `docs/` + GitHub Pages (`docs/PAGES.md`)
