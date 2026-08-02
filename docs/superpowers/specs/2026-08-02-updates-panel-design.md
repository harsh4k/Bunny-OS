# Updates panel design (option 2)

Date: 2026-08-02  
Status: **approved** (user chose option 2)

## Goal

Dashboard **Updates** view so users know the installed version and can compare with the latest GitHub release — still **manual install**, no silent auto-update.

## Behavior

1. Show **installed version** (Tauri package version).
2. Copy: updates are manual; install over previous build; data under app-data is kept.
3. **Open releases** — HTTPS `open_url` / `open::that` to `https://github.com/harsh4k/Bunny-OS/releases` (user click only).
4. **Compare with latest** — one user-triggered HTTPS GET to GitHub Releases API (`/repos/harsh4k/Bunny-OS/releases/latest`), parse `tag_name`, compare to installed (strip leading `v`). No background polling, no telemetry.
5. Result states: up to date / newer available (show latest tag + link) / network or API error (clear message).

## Hard locks

- No Google auth, no Tauri updater download, no silent checks.
- External call only on explicit button press (same class as `youtube_play` one-shot GET).
- Keys never in repo; unsigned beta OK.

## Out of scope

True in-app download/install (needs paid code signing — later).
