# Screen context v2 — focused-window visible text

Status: implemented (local-only)

## Problem
W3 only injected the focused **window title**. Users asking “what’s on my screen” got almost nothing useful.

## Decision
Prefer **UI Automation / Accessibility text** over pixel OCR for v2:

| Approach | Pros | Cons |
|---|---|---|
| **A — UIA / AX (chosen)** | Real control text, local, no image pipeline | Weak on pure images / games / canvas |
| B — Full-screen OCR | Reads pixels | Heavy deps, slower, more privacy surface |
| C — Title only (v1) | Tiny | Not useful |

OCR can be a later opt-in fallback for image-heavy windows; not in this pass.

## Behavior
- Still **Off by default**; probe only on screen-like utterances when On.
- Windows: exe name + UI Automation tree (optional `uiautomation`) with Win32 child-title fallback; skip Bunny’s own HWND.
- macOS: AppKit app name + AX focused element/window when Accessibility allowed.
- Prompt block stays **untrusted data**; never persist capture.
- Caps ~3.5k chars of visible text.

## Verify
- Memory → Screen: On
- Focus Notepad / browser with text → ask “what’s on my screen” / “read this”
- Expect spoken/chat answer using visible text, not title alone
