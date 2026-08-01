# Architecture — Bunny OS

## System overview

```
┌─────────────────────────────────────────────────┐
│ React Frontend (Tauri WebView)                  │
│ - Compact panel, chat, advisor, memory, wake    │
│ - Push-to-talk / mute / cancel                  │
└────────────┬────────────────────────────────────┘
             │ Tauri IPC (typed JSON)
             ↓
┌─────────────────────────────────────────────────┐
│ Tauri Runtime (Rust)                            │
│ - Tray + lifecycle + sidecar supervisor         │
│ - Framed stdio IPC                              │
│ - Action broker (allowlist only; no free shell) │
└────────────┬────────────────────────────────────┘
             │ stdio (4-byte LE length + UTF-8 JSON)
             ↓
┌─────────────────────────────────────────────────┐
│ Python Sidecar                                  │
│ - Chat / pull / voice / wake / memory workers   │
│ - Ollama HTTP client                            │
│ - Optional faster-whisper + openWakeWord        │
│ - SQLite memory (untrusted data, not commands)  │
└────────────┬────────────────────────────────────┘
             │
    ┌────────┴────────┐
    ↓                 ↓
┌──────────────────┐ ┌──────────────────┐
│ faster-whisper   │ │ Ollama           │
│ (optional)       │ │ (user instance)  │
│ - STT in-memory  │ │ - Chat / tools   │
└──────────────────┘ └──────────────────┘
```

## Message flow: Assistant action

1. User chats or uses push-to-talk → sidecar streams Ollama response
2. If the model proposes an action, React shows Confirm (never auto-executes from voice)
3. On confirm, React calls `execute_assistant_action` → Rust broker
4. Broker validates Start Menu / HTTPS allowlists and launches via Win32/`open`
5. Audit event is emitted to the UI

Voice and wake word only start listening. They never authorize privileged actions.

## IPC Protocol

### From React → Tauri → Sidecar (stdin)

```typescript
type InboundMessage = 
  | {
      type: 'action'
      id: string
      payload: {
        action: 'open_app' | 'open_url' | 'youtube_search' | 'show_system_summary' | 'respond'
      } & (
        | { action: 'open_app'; app_name: string }
        | { action: 'open_url'; url: string }
        | { action: 'youtube_search'; query: string }
        | { action: 'show_system_summary' }
        | { action: 'respond'; input: string }
      )
    }
  | { type: 'shutdown' }
```

### From Sidecar → Tauri → React (stdout)

```typescript
type OutboundMessage =
  | {
      type: 'response'
      id: string
      result: string
    }
  | {
      type: 'error'
      id: string
      error: string
    }
  | {
      type: 'stream'  // for long responses
      id: string
      result: string
      finished: boolean
    }
```

### Framing

```
[4-byte length (u32 LE)][JSON payload]
```

Example (open_app request):
```
00 00 00 7e
{ "type": "action", "id": "123", "payload": { "action": "open_app", "app_name": "notepad" } }
```

## Sidecar responsibilities

1. **Validate** inbound JSON against discriminated union (Rust enum; no `any`)
2. **Enforce** action allowlist (only known actions execute)
3. **Execute** platform operations (Win32 APIs only; no cmd.exe/powershell)
4. **Spawn** faster-whisper for transcription or coordinate with Ollama
5. **Store** responses in SQLite (Tauri app-data)
6. **Return** typed responses to Tauri

## Data flow constraints

| Origin | Flow | Validation |
|---|---|---|
| React → Sidecar | Typed JSON stdin | Discriminated union (no `any` or index signatures) |
| Sidecar → faster-whisper | Framed JSON | Sidecar owns contract |
| Sidecar → Ollama | HTTP (local) | Ollama host/port hardcoded |
| Results → SQLite | Tauri storage | Persistent app-data |
| Results → React | Tauri events | TypeScript types |

## Why this architecture?

- **Isolation:** Sidecar runs in separate process; malformed JSON won't crash UI
- **Security:** Actions defined in Rust enum; no dynamic command execution
- **Performance:** Async I/O; long operations don't block React
- **Privacy:** No network calls; Ollama is local-only
- **Testability:** Sidecar logic tested independently of Tauri & React

## Dependencies (TBD)

Build commands will reference once toolchain is scaffolded:
```bash
# Placeholder only
cargo build --release  # Compiles sidecar + Tauri main
npm run build:sidecar  # (when Cargo.toml exists)
```
