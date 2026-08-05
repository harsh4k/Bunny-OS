# Bunny OS — Product Requirements Document

Status: active · Last updated: 2026-08-05

## Problem

Bunny OS is a local-only desktop assistant. Recent UI work introduced regressions: the expanded dashboard becomes click-through, the notification island shows an unwanted plate behind the pill, and the Apps catalog appears empty or uses initials instead of real icons. Docs and tests did not encode ownership boundaries (host vs sidecar, island vs dashboard), so fixes were fragile.

## Goals

1. **Interactive shell** — Expanded dashboard and onboarding are always clickable; idle island passes through except the notch hit target.
2. **Clear island** — No visible background plate, shadow, or sheen on the notification pill; WebView stays alpha-transparent.
3. **Real app catalog** — Start Menu / Applications scan persists paths; dock shows OS icons when extraction succeeds; failures are visible, not silent glyphs.
4. **Maintainable repo** — PRD + architecture + maintenance + testing docs; unit and e2e gates for island input, pill presentation, and Apps load path.

## Non-goals

- Cloud APIs, telemetry, or new allowlisted actions.
- Merging Rust and Python app catalogs into one service (dual path stays; documented).
- Sidecar onboarding IPC (host owns scan + Ollama bootstrap).
- Full Tauri-driver desktop GUI automation (human soak checklist until justified).

## Users

Personal use on Windows 10/11 and macOS. Privacy-first; all data local.

## P0 — Stability sprint (this release)

| Requirement | Acceptance |
|-------------|------------|
| Click-through fix | Open island → dashboard; all controls receive clicks; no stuck pass-through after expand |
| Clear notification pill | `.shell` transparent; no box-shadow/sheen; text readable via text-shadow |
| WebView transparency | `ensureIslandTransparency` after geometry settle and surface switch |
| App scan | `list_apps` / `rescan_apps` return real entries; empty catalog auto-rescans once |
| Real icons | Asset protocol allows icon cache on Win + Mac; `get_app_icon` failures logged |
| Onboarding scan UX | Wizard shows `sample_apps` after scan |
| Docs | PRD, MAINTENANCE, TESTING, stability design/plan |
| Tests | Vitest for cursor controller, AppsPanel, pill CSS; Playwright e2e with mocked Tauri |

## P1 — Reliability

- Multi-monitor / DPI soak for island hit rect.
- Icon extract failure metrics in structured logs.
- Onboarding polish (scan preview, error recovery).

## P2 — Product

- Soak and tag per `docs/beta-checklist.md`.
- Smarter app aliases (yt, chrome, edge).
- Signed releases when certs available.

## Success metrics

- P0 automated gates green: `npm run lint`, `npm test`, `npm run test:e2e`, `cargo test`.
- Manual soak: click-through, clear pill, Apps rescan with icons on Windows (glyphs only when OS extract fails, with status).

## Definition of done (P0)

See `docs/TESTING.md` verification gate.
