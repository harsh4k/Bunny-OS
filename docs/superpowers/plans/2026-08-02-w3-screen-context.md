# W3 Screen Context Q&A Plan

> **For agentic workers:** executing-plans / subagent-driven-development.

**Goal:** Opt-in focused-window text for local Q&A; default Off; never silent capture; no OCR/cloud.

**Architecture:** `sidecar/platform_screen.py` reads foreground window title (Win32 ctypes / macOS AppKit when present). Setting `screen_context` in MemoryStore settings. Voice/chat Ollama path injects untrusted screen block when enabled and the utterance looks screen-related. UI toggle on MemoryPanel (Screen context).

**Out:** Pixel OCR, always-on capture, browser RPA (W4).

---

### Task 1: platform_screen + settings + IPC
- [x] `platform_screen.get_focused_window_text`
- [x] MemoryStore `screen_context` setting (default Off)
- [x] Actions: `screen_status`, `screen_set_enabled`, `get_focused_window_text`
- [x] TS + Rust Action mirrors

### Task 2: Wire voice/chat prompt injection
- [x] `screen_context.enrich_prompt_with_screen` — probe only when On + screen-like query
- [x] Voice speaks probe errors; chat returns respond text
- [x] Untrusted screen block in prompt

### Task 3: UI toggle + tests + verify
- [x] MemoryPanel Screen On/Off
- [x] Unit tests + allowlist tests
- [ ] Full suite + review + commit/push
