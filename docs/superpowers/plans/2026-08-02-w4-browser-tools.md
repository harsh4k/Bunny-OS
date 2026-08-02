# W4 Allowlisted Browser Tools Plan

> **For agentic workers:** executing-plans.

**Goal:** Narrow local browser automation with human confirm on risky steps. Never shell.

**Allowlisted actions (locked):**
| Action | Risk | Confirm? | Behavior |
|---|---|---|---|
| `browser_scroll` | low | no | Mouse wheel toward focused window (Win32 SendInput / macOS Quartz) |
| `browser_type` | medium | **yes** | Type unicode into focused control |
| `browser_click_role` | medium | **yes** | Click by name (Win32 window title match → center click) |
| `browser_focus_search` | low | no | Focus address/search via Ctrl+L / Cmd+L |

**Confirm flow:** Sidecar queues pending → stream `browser_confirm_pending` → `BrowserConfirmBanner` → `browser_confirm` / `browser_cancel`.

**Out:** Free-form scripts, CDP remote, arbitrary click-by-coords, downloading executables.

---

### Task 1: IPC + pending queue + platform stubs — done
### Task 2: Confirm UI + voice/chat wire — done
### Task 3: Tests + verify + push — in progress
