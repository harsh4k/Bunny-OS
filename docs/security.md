# Security & Privacy — Bunny OS

## Privacy commitment

**Bunny OS runs entirely on your machine.** No telemetry, no cloud calls, no third-party APIs.

- ✓ All data processed locally in-memory or in SQLite (Tauri app-data)
- ✓ faster-whisper (STT) and Ollama (chat) run on your hardware only
- ✓ No internet connectivity required after install
- ✓ Session state persisted with user review/delete/export controls
- ✓ Logs rotated; no persistent history of private queries

## Threat model

### 1. Prompt injection

**Threat:** Malicious or confusing input could trick the LLM or cause unintended actions.

**Mitigations:**
- Actions are enum-based in Rust, not free-form strings
- Input validation at sidecar entry point
- Ollama system prompt locked (not user-configurable)
- Action payloads validated before execution

**User responsibility:** Review Ollama's system prompt before running.

### 2. Malicious app/URL names

**Threat:** User could try to launch dangerous apps or navigate to phishing URLs.

**Mitigations:**
- App whitelist (MVP: only known-safe apps allowed)
- URL scheme validation (http, https only; no `file://` or `javascript:`)
- Win32 `ShellExecute()` only (no cmd.exe, powershell, or free-form shell)

**User responsibility:** Don't accept untrusted input as app/URL names.

### 3. Sidecar spoofing

**Threat:** A compromised or fake sidecar binary could intercept or manipulate commands.

**Mitigations:**
- Sidecar spawned only by Tauri main process
- Stdin/stdout isolated; no inherited file descriptors
- Child process verified before I/O (PID check)
- IPC protocol includes message framing (length prefix) to prevent injection

**User responsibility:** Use signed releases only.

### 4. Microphone privacy

**Threat:** Accidental or intentional audio recording and persistence.

**Mitigations:**
- Microphone access gated by explicit user consent
- Audio transcribed in-memory by faster-whisper subprocess (never saved to disk raw)
- Transcription results passed back as JSON only
- No audio buffer accessible from React layer

**User responsibility:** Disable microphone in OS if not needed.

### 5. Memory leakage

**Threat:** Sensitive data (queries, tokens, user input) left in RAM after exit.

**Mitigations:**
- SQLite uses persistent storage (Tauri app-data) with user review/delete/export controls
- Sidecar subprocess terminated when main exits
- No persistent caches in React; session data cleared on app close
- Logs contain only sanitized summaries (no full queries)

**User responsibility:** Physically isolate machine if handling classified data.

### 6. Update/package integrity

**Threat:** Tampered binary or dependencies.

**Mitigations:**
- Release build order: `verify-beta` → `package-sidecar` → `npm run build` → human code-sign
- `scripts/checksum-release.ps1` publishes SHA256 next to artifacts
- Signing cert thumbprint is never committed; see `docs/updates.md`
- Diagnostics/logs omit transcripts, raw audio, and memory text by default
- [PLANNED] Dependencies locked in Cargo.lock and package-lock.json
- [PLANNED] Tauri built-in auto-update includes hash verification

**User responsibility:** Verify checksums before first install.

## Data retention

| Data | Retention | Location | Clearance |
|---|---|---|---|
| Session state | Persistent until user deletes | SQLite (Tauri app-data) | User review/delete/export controls |
| Input queries | Ollama context window | Ollama process RAM | On Ollama restart |
| Logs | 7 days rolling | Tauri app-data/logs/ | Auto-rotated daily |
| Config | Until user deletion | Tauri app-data/ | User must delete |
| Audio transcripts | In-memory only | faster-whisper subprocess | After transcription |

## Configuration & controls

### config.toml (user-writable, in Tauri app-data)

```toml
[ollama]
host = "http://localhost"
port = 11434
# User chooses model to use

[logging]
level = "info"  # or "debug"
max_days = 7

[actions]
allow_microphone = false
allow_app_launch = true
allow_url_open = true
```

### Changing privacy settings

Edit Tauri app-data config.toml to:
- Disable microphone: `allow_microphone = false`
- Disable app launching: `allow_app_launch = false`
- Reduce log retention: `max_days = 1`

Restart app to apply.

## Allowlisted actions (MVP)

Only these actions can be invoked:

| Action | Args | Notes |
|---|---|---|
| `open_app` | `app_name: string` | Whitelist enforced in Rust |
| `open_url` | `url: string` | Scheme validated (http/https only) |
| `youtube_search` | `query: string` | Constructs and opens HTTPS YouTube results URL |
| `show_system_summary` | None | Queries Win32 API; returns CPU, RAM, disk, uptime |
| `respond` | `input: string` | Streams text from Ollama |

No other actions execute. Any attempt to invoke unknown actions returns an error.

## Building with security

When contributing:
1. **Review dependencies:** `cargo tree`, `npm list`
2. **Audit for shell execution:** No `std::process::Command::new("cmd")`, `shell: true`, or free-form execution
3. **Validate all inputs** in Rust (not React) before sidecar calls
4. **Ensure discriminated unions:** No `any` types or index signatures in IPC
5. **Test malformed JSON** against sidecar; it must reject gracefully
6. **Sign releases** before public distribution (keys never in repo)

## Reporting security issues

**Do not open public issues for security bugs.**

Email: [TBD — insert security contact]

Include:
- Description of vulnerability
- Steps to reproduce
- Impact assessment
- Suggested fix (optional)
