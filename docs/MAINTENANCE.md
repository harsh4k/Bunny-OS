# Bunny OS — Maintenance Guide

Where code lives, who owns what, and how to change the app without regressions.

## Folder map

| Path | Owns |
|------|------|
| `src/` | React UI, island geometry, voice status, dashboard panels |
| `src/lib/islandCursorController.ts` | Idle-island click-through (generation-guarded) |
| `src/lib/islandTransparency.ts` | WebView/window alpha clear |
| `src/lib/islandHitTest.ts` | Notch/bar hit rects (must match NotificationPill CSS) |
| `src-tauri/src/` | Tray, window lifecycle, broker, onboarding, app scan, icons |
| `src-tauri/src/user_apps.rs` | `user_apps.json` catalog (dashboard + chat open_app) |
| `src-tauri/src/start_menu.rs` | OS discovery (Start Menu / Applications) |
| `src-tauri/src/app_icons.rs` | Icon extract + PNG cache |
| `src-tauri/src/onboarding.rs` | First-run completion marker |
| `sidecar/` | Chat, voice, wake, memory; voice name inventory (`app_catalog.py`) |
| `contracts/ipc.ts` | Typed sidecar stdio schema |
| `docs/PRD.md` | Product roadmap source of truth |
| `docs/superpowers/specs/` | Design specs (approve before large UI work) |
| `docs/superpowers/plans/` | Implementation plans (task checklists) |
| `e2e/` | Playwright specs (mocked Tauri via `E2E=1` build) |

## Bug routing

| Symptom | Look first |
|---------|------------|
| Can't click dashboard | `App.tsx` + `islandCursorController.ts` — stale `setIgnoreCursorEvents` |
| White/black behind island | `islandTransparency.ts`, `index.css`, `NotificationPill.module.css` |
| Apps empty | `user_apps.rs`, `list_apps` / `rescan_apps`, AppsPanel load path |
| Fake / initials icons | `get_app_icon`, `app_icons.rs`, `tauri.conf.json` asset scope |
| Voice can't open app | `sidecar/local_actions.py` + shared `user_apps.json` |
| Onboarding won't scan | `commands::onboarding_scan` (host, not sidecar) |

## When to touch what

- **Island CSS sizes** → update `islandGeometry.ts`, `NotificationPill.module.css`, and `islandHitTest.test.ts` together.
- **New Tauri command** → `commands.rs`, `lib.rs` handler list, frontend invoke, optional Vitest mock.
- **New sidecar action** → Rust broker allowlist + `contracts/ipc.ts` + sidecar handler (never LLM-only).
- **App catalog** → Rust `user_apps` for paths; Python catalog only for voice name hints.

## Commands

```powershell
npm install
npm run lint
npm test
npm run test:e2e          # E2E=1 preview + Playwright
npm run build:frontend
cargo test --manifest-path src-tauri/Cargo.toml
pwsh -File scripts/verify-beta.ps1
```

## Release gate

1. Automated gates in `docs/TESTING.md`
2. Human items in `docs/beta-checklist.md` (island click, pill clarity, Apps rescan)
3. Tag → CI release artifacts per `docs/SHIPPING.md`

## Doc workflow

1. Change product scope → update `docs/PRD.md`
2. Non-trivial feature → spec in `docs/superpowers/specs/YYYY-MM-DD-*.md`
3. Implementation → plan in `docs/superpowers/plans/YYYY-MM-DD-*.md`
4. Architecture shift → `docs/architecture.md`
