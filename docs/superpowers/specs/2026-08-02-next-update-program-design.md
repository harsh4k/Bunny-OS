# Bunny OS — Next Update Program Design

Date: 2026-08-02  
Status: **approved** (brainstorming 2026-08-02)  
Supersedes-as-execution-plan: `2026-08-02-next-update-roadmap.md` (roadmap remains the feature list; this doc is the phased program)

## Goal

Ship **all** post-v0.1.1 roadmap features as one coherent program, delivered in **phases** so each wave stays small enough to avoid context drift, regressions, and “big bang” breakage. After every feature and every wave: automated + manual verification. Skills gate every wave.

## Baseline (already on main)

v0.1.1 patch: wake `enabled` persist + retry UX; island click-through; Memory auto-facts + panel list; UI chrome; YouTube/Spotify 90s dialog domain + bare `search …`; `yt` aliases.

## Hard locks (every wave)

Copied from project CLAUDE.md — non-negotiable:

- Local-only; no telemetry; no cloud model/OCR APIs
- No shell execution (cmd.exe / powershell / osascript / free-form)
- IPC payloads fully typed; new capabilities only via allowlisted action kinds
- Microphone opt-in; never persist raw audio
- Screen capture only if explicitly opt-in; never silent; W3 uses focused-window **accessibility text**, not always-on pixel OCR
- Browser tools (W4) are allowlisted steps with confirm for risky actions — not unrestricted RPA

## Delivery model

| Wave | Suggested tag | Features | Rationale |
|---|---|---|---|
| **W1** | v0.1.2 | Session log in Memory + smarter app catalog aliases | Extends shipped Memory + `open_app`; lowest new risk |
| **W2** | v0.1.3 | Voice follow-up v2 + wake reliability pack | Builds on v0.1.1 domain; no new OS permission surfaces |
| **W3** | v0.1.4 | Opt-in screen context Q&A (a11y / UI Automation text) | New privacy surface; only after voice/memory soak |
| **W4** | v0.2.0 | Allowlisted browser tools + confirm UX | Highest blast radius; last |

One git line of work preferred; merge/tag after each wave when the human asks. No single mega-PR for all four waves.

## Skills workflow (mandatory per wave)

```
writing-plans → docs/superpowers/plans/YYYY-MM-DD-wN-<slug>.md
  → subagent-driven-development (preferred) OR executing-plans
  → after each feature change set: code-reviewer → qa-verifier
  → verification-before-completion before claiming wave done
```

Do **not** start coding a wave until that wave’s plan file exists and the human has chosen execution mode.

Program-level brainstorming is complete (this document). Per-wave micro-brainstorm only if the plan uncovers an unresolved product fork.

## Verification contract

### Feature gate (after each feature inside a wave)

1. Feature-focused unit tests (Python `unittest` and/or Vitest as applicable)
2. Full automated suite:
   - `npm run lint`
   - `npm test`
   - `python -m unittest discover -s sidecar/tests`
3. Skills: `code-reviewer` then `qa-verifier` on the change set
4. Commit when the human asks (do not auto-push unless asked)

### Phase gate (after each wave)

1. Feature gate for the last feature in the wave
2. Manual smoke checklist for that wave (see below) **plus** regression smoke: wake toggle, PTT/voice, Memory On/Off + facts, island idle click-through, time/date/open/youtube/spotify fast-path
3. All plan checkboxes for the wave closed
4. Tag only when the human requests it

### Release gate (after W4)

1. Phase gate for W4
2. `docs/beta-checklist.md` soak on Windows and macOS (unsigned beta OK)
3. Human confirms before calling the program complete

### Manual smoke by wave

**W1:** Memory panel shows session turns after voice/chat; delete one turn; Clear session; aliases (`yt`, chrome, edge, vscode) open correct apps on Win (and Mac where catalog exists).

**W2:** “open youtube” → “sunflower” → “play the first one” resolves via allowlisted play/search only; wake false-trigger better or documented; sensitivity/profile persist across restart; Disable/Retry still work after STT glitch.

**W3:** Screen Q&A off by default; with On, question about focused window uses a11y text; spoken/error path if permission denied; no capture when Off.

**W4:** Each browser action kind works on one allowlisted path; risky step shows confirm; denied/cancel does nothing; no shell spawned.

## Wave designs

### W1 — Session log + app aliases (v0.1.2)

**Goal:** Users can browse and delete recent conversation/voice turn summaries in Memory; spoken app names resolve reliably on Win + Mac.

**In**

- Persist compact per-turn summaries when Memory is On (voice + typed chat), separate from durable `facts`
- MemoryPanel: list session turns, delete one, clear session (backed by durable store — not RAM-only)
- Expand/unify spoken aliases (`yt`, chrome, edge, vscode, …) across `sidecar/local_actions.py` and Rust `broker.rs` where needed; catalog-aware where possible

**Out**

- Screen Q&A, browser tools, follow-up v2, wake pack

**Likely files**

- `sidecar/memory.py`, `sidecar/voice_worker.py`, `sidecar/chat_worker.py`, `sidecar/main.py`
- `src/components/MemoryPanel.tsx`, `contracts/ipc.ts` (+ Rust IPC mirrors if required)
- `sidecar/local_actions.py`, `sidecar/app_catalog.py`, `src-tauri/src/broker.rs`
- Tests under `sidecar/tests/`, `src/__tests__/`

**Acceptance**

- After a voice turn with Memory On, MemoryPanel shows a session entry without Refresh-only luck (poll or push OK)
- Session survives sidecar restart (SQLite or equivalent under app-data)
- Secrets/credentials refused or redacted like facts
- Alias phrases open the intended app or clear spoken error; no shell

### W2 — Voice follow-up v2 + wake reliability (v0.1.3)

**Goal:** Multi-step media dialog without Ollama for the happy path; wake more trustworthy day-to-day.

**In**

- Dialog slots beyond 90s domain: e.g. pending query after “search/play” context; “play the first one” / ordinal → existing `youtube_play` / Spotify search allowlist only
- Clear slots on unrelated intent / TTL / Ollama fall-through (same spirit as v0.1.1 domain clear rules)
- Wake: false-trigger tuning (gates/cooldown/docs), optional openWakeWord model path unchanged-in-spirit, persist sensitivity profiles with phrase/`enabled`

**Out**

- Screen, browser; no new action kinds unless strictly required for ordinal play (prefer existing `youtube_play` / `spotify_*`)

**Likely files**

- `sidecar/voice_intents.py`, `sidecar/voice_worker.py`, `sidecar/tests/test_voice_intents.py`
- `sidecar/wake_word.py`, `sidecar/wake_phrase.py`, `src/components/WakePanel.tsx`

**Acceptance**

- Scripted sequence: open YouTube → bare search query → “play the first one” hits allowlisted play/search path in tests
- Unrelated “what time is it” clears slots
- Wake enabled + sensitivity survive restart; Retry/Disable still correct after soft STT errors

### W3 — Screen context Q&A (v0.1.4)

**Goal:** Opt-in answers about the focused window using OS accessibility / UI Automation **text**, never silent capture.

**In**

- Explicit user toggle (default Off), persisted in app-data
- On demand (voice or chat): read focused-window accessible text → local Ollama with untrusted screen block → allowlisted `respond` only (no invented tools from screen content)
- Clear permission / denied errors spoken and shown
- macOS: reuse accessibility settings open helper where relevant; Windows: UI Automation

**Out**

- Always-on OCR, screenshots-as-default, cloud vision, browser RPA

**Likely files**

- New small module(s) under `sidecar/` and/or `src-tauri/` for a11y text probe
- IPC action e.g. `get_focused_window_text` (exact name fixed in W3 plan) — typed allowlist
- UI toggle in settings / CompactPanel capability tile
- `contracts/ipc.ts` + Rust enum

**Acceptance**

- Off → no OS a11y probe on voice turns
- On + permission → short answer grounded in returned text; prompt marks screen block untrusted
- Denied permission → spoken failure, no crash

### W4 — Allowlisted browser tools (v0.2.0)

**Goal:** Narrow local browser automation for everyday “click / type / scroll / focus tab” with human confirm on risky steps.

**In**

- New allowlisted action kinds only (exact set locked in W4 plan), e.g. focus tab, scroll, type-into-focused, click-by-role/name
- Confirm UI for risky steps (navigate away, submit, irreversible click) — cancel = no-op
- Platform implementation via Win32/macOS APIs or constrained browser bridge — **never** cmd/powershell/osascript free-form

**Out**

- Arbitrary scripts, “do everything” RPA, remote control, downloading executables

**Likely files**

- `contracts/ipc.ts`, Rust action enum, `sidecar/local_actions.py` or dedicated `browser_actions.py`
- Frontend confirm dialog for pending browser action
- Tests with fakes/mocks (no live browser required in CI)

**Acceptance**

- Each action kind has unit tests with fakes
- Confirm cancel leaves page state unchanged (mocked)
- No shell process spawn in implementation paths

## Cross-cutting architecture notes

- **Memory:** Keep `facts` (durable profile) vs `session` (turn log) distinct in schema and UI. Prompt injection posture unchanged: persona first; memories/session/screen marked untrusted.
- **Intents:** Process-local dialog state OK for W2; document TTL and clear rules; never authorize privileged actions from wake alone.
- **IPC:** Every new capability = discriminated union member end-to-end (TS contract + Rust + sidecar dispatch). No `any`, no index signatures.
- **UI:** Prefer existing Memory / Wake / CompactPanel patterns; square borders / dark select from v0.1.1 stay.

## Explicitly deferred forever (this program)

- Unrestricted browser RPA / “do everything”
- Cloud OCR / always-on screen recording
- Telemetry or remote model APIs
- Shell-backed automation

## Success for the program

- All six roadmap items shipped across W1–W4 with tags as above (or equivalent agreed tags)
- Each wave passed feature + phase gates with evidence
- No hard-lock violations introduced
- v0.1.1 behaviors still pass regression smoke after every wave

## Next step after this spec

1. Human reviews this file  
2. Invoke **writing-plans** for **W1 only** → `docs/superpowers/plans/2026-08-02-w1-session-log-aliases.md`  
3. Implement W1 with skills + gates; then repeat writing-plans for W2, W3, W4
