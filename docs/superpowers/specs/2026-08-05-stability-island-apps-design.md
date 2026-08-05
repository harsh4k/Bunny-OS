# Stability — Island Input, Clear Pill, App Catalog

Date: 2026-08-05  
Status: approved for implementation

Supersedes the premium-graphite island **background plate** requirement (dark `.shell` plate). Island pill is **fully clear always**.

## Goals

1. Fix dashboard click-through (stale `setIgnoreCursorEvents` poll).
2. Remove all visible plate/shadow/sheen from notification pill; harden WebView transparency.
3. Harden host app scan + icon path; surface failures in UI.
4. Document ownership and add regression tests.

## Island input

- **Owner:** `src/lib/islandCursorController.ts`
- **Modes:** `interactive` (dashboard, expanded, hidden island) vs `idle-island` (poll hit rect).
- **Rule:** Monotonic generation checked after every await before applying ignore.
- **Cleanup:** Always leaves window interactive (`ignore=false`), never `ignore=true`.

## Notification pill

- `.stage`, `.hit`, `.face`, `.shell`: `background: transparent`
- No `box-shadow`, no `::before` sheen, no rim border on shell.
- Text contrast: `text-shadow` on title/subtitle.
- `ensureIslandTransparency()` after window resize settle and on `expanded` / island surface switch.

## App catalog

- **Dashboard / onboarding / chat open_app:** Rust `user_apps` + `start_menu` + `app_icons`.
- **Voice name inventory:** Python `app_catalog` (KEEP dual path).
- Asset protocol: Windows `$LOCALAPPDATA/BunnyOS/icons/**` + macOS `Application Support/BunnyOS/icons/**`.
- AppsPanel: auto `rescan_apps` once when `list_apps` returns empty; glyph only as labeled fallback.
- Onboarding: display `sample_apps` after successful scan.

## Tests

- Unit: cursor controller race, AppsPanel load/rescan, transparency calls.
- E2E: mocked Tauri preview for dashboard, island, onboarding harness.

## Non-goals

- Sidecar onboarding IPC
- Merged single catalog service
- Tauri WebDriver GUI automation
