# Bunny OS v0.1.1 Patch Design

Date: 2026-08-02  
Status: approved for implementation

## Goal

Ship a feel-good patch: wake, island click-through, Memory auto-facts + UI, UI chrome, voice follow-up context.

## In scope

| Area | Behavior |
|---|---|
| Wake | Persist `enabled` across restarts; clearer error status when STT/mic fails |
| Island | Click-through when idle so other apps work under the pill; tighter hit box |
| Memory | After each voice turn, save short inferred facts when Memory is On; panel lists SQLite facts |
| UI | Visible square container borders; dark `<select>`; better collapse icon; custom scrollbar |
| Voice | Short dialog domain so “search sunflower” after YouTube → `youtube_search`; `yt` alias |

## Out of scope (see next-update roadmap)

Session history log, screen Q&A, full browser automation.

## Decisions

- Memory patch = **auto-facts only** (not full session log).
- Island uses `ignoreCursorEvents` when pill is idle/collapsed; interactive when hovered or voice-active.
- Follow-up intents keep a process-local last domain (youtube/spotify), cleared after timeout or unrelated intent.

## Success criteria

- Wake toggle survives app restart.
- Memory panel shows facts after a voice turn (Memory On).
- Idle island does not block clicks on apps beneath.
- Dropdown matches dark theme; scrollbar is custom thin track.
- “open youtube” then “search sunflower” → YouTube search.
