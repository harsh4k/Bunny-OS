# W2 Voice Follow-up v2 + Wake Reliability Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or subagent-driven-development. Checkbox steps for tracking.

**Goal:** Multi-step media dialog (query slot + “play the first one”) on allowlisted actions only; wake profiles + slightly stricter default gates to cut false triggers.

**Architecture:** Extend process-local dialog state in `voice_intents.py` with `_last_query` beside `_last_domain`. Ordinal/play-it phrases map to `youtube_play` / `spotify_play` using that query. Wake settings gain named profiles (`strict` / `balanced` / `sensitive`) persisted in `settings.json`; RMS gate floors nudged for fewer false wakes.

**Tech Stack:** Python sidecar intents + wake_phrase/wake_word; WakePanel select; unittest.

## Global Constraints

- No new action kinds — reuse `youtube_play` / `spotify_*` / `youtube_search`
- Clear slots on unrelated intent / TTL / Ollama fall-through
- No screen/browser work in W2
- Full lint + npm test + python unittest after implementation

---

### Task 1: Dialog query slot + play-first

**Files:** `sidecar/voice_intents.py`, `sidecar/tests/test_voice_intents.py`

- [ ] Store `_last_query` when youtube/spotify search or play sets a query; clear with domain
- [ ] After domain active: bare 1–5 word utterance (no command verbs) → `{domain}_search` and set query
- [ ] Match `play the first one` / `play first` / `play it` / `the first one` → `{domain}_play` with `_last_query` (respond ask if no query)
- [ ] Tests for open youtube → sunflower → play the first one; time clears slots

### Task 2: Wake profiles + gate tune

**Files:** `sidecar/wake_phrase.py`, `sidecar/wake_word.py`, `src/components/WakePanel.tsx`, `sidecar/tests/test_wake_word.py`

- [ ] Persist `profile` + optional `profiles` map; presets: strict 0.75/3.0, balanced 0.5/2.0, sensitive 0.35/1.5
- [ ] `configure(profile=...)` applies preset sensitivity/cooldown
- [ ] Slightly raise `_RMS_LO` (e.g. 0.008 → 0.010) and `_MIN_SPEECH_SECS` (0.35 → 0.45)
- [ ] WakePanel: profile `<select>`; status shows profile
- [ ] Tests: profile round-trip in settings

### Task 3: Verify + commit

- [ ] Full suites green; code-reviewer pass; commit + push
