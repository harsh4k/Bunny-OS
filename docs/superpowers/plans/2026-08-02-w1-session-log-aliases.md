# W1 Session Log + App Aliases Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist browsable Memory session turns (voice + chat) and unify spoken app aliases so Win/Mac `open_app` resolves reliably — Wave 1 of the next-update program (v0.1.2).

**Architecture:** Add a SQLite `session_turns` table beside `facts`. `remember_session` / voice+chat callers write durable rows when Memory is On; `memory_list` returns `{ facts, session }`; UI lists and deletes turns. Aliases stay in `local_actions._APP_ALIASES` with Rust `broker.rs` kept in sync; `youtube`/`yt` via `open_app` opens `https://www.youtube.com` (HTTPS allowlist) instead of inventing a phantom app path.

**Tech Stack:** Python sidecar + SQLite, Tauri IPC (`contracts/ipc.ts` + `src-tauri/src/ipc.rs`), React MemoryPanel, Vitest + unittest.

## Global Constraints

- Local-only; no telemetry; no cloud APIs
- No shell execution (cmd.exe / powershell / osascript / free-form)
- IPC fully typed end-to-end; no `any` / index signatures
- Session text redacted like facts; refuse secrets
- Persona first; session/facts remain untrusted prompt data
- Do not implement W2–W4 in this plan
- After each task: feature tests + full `npm run lint && npm test` + `python -m unittest discover -s sidecar/tests`
- After change sets: code-reviewer → qa-verifier; phase gate smoke at end

## File map

| File | Role |
|---|---|
| `sidecar/memory.py` | Schema + session CRUD + prompt uses DB turns |
| `sidecar/main.py` | `memory_list` payload; `memory_delete_session` dispatch |
| `sidecar/voice_worker.py` | Structured session append (role/channel) |
| `sidecar/chat_worker.py` | Structured session append for chat user turns |
| `contracts/ipc.ts` | `memory_delete_session`; `memory_list` unchanged action name |
| `src-tauri/src/ipc.rs` | Mirror `MemoryDeleteSession` |
| `src/components/MemoryPanel.tsx` | Session list UI + delete/clear refresh |
| `sidecar/local_actions.py` | Alias map + youtube/yt → HTTPS home |
| `src-tauri/src/broker.rs` | Match alias keys to Python |
| `sidecar/tests/test_memory.py` | Session persist/list/delete |
| `sidecar/tests/test_voice_intents.py` or `test_local_actions` | Alias / youtube open_app |
| `src/__tests__/ipcContracts.test.ts` | New action variant if covered |

---

### Task 1: Persist session turns in MemoryStore

**Files:**
- Modify: `sidecar/memory.py`
- Test: `sidecar/tests/test_memory.py`

**Interfaces:**
- Produces: `append_session_turn(role: str, channel: str, text: str) -> None`, `list_session(limit: int = 40) -> list[dict]`, `delete_session_turn(turn_id: int) -> dict`, `clear_session() -> dict` (clears SQLite + any RAM cache), `remember_session(line: str)` kept as thin wrapper calling `append_session_turn("user", "session", line)` for compat OR updated callers only — prefer updating callers in Task 2 and making `remember_session` call `append_session_turn` with role inferred from prefix `user`/`bunny` for one release.

- [ ] **Step 1: Write failing tests**

Add to `sidecar/tests/test_memory.py`:

```python
def test_session_turn_persists_across_reopen(self):
    self.store.append_session_turn("user", "voice", "what time is it")
    self.store.append_session_turn("bunny", "voice", "It's 3:00 PM.")
    path = self.store._path
    reopened = MemoryStore(path)
    turns = reopened.list_session()
    self.assertEqual(len(turns), 2)
    self.assertEqual(turns[0]["role"], "bunny")  # newest first
    self.assertEqual(turns[1]["text"], "what time is it")

def test_session_delete_and_clear(self):
    self.store.append_session_turn("user", "chat", "hello")
    tid = self.store.list_session()[0]["id"]
    self.assertTrue(self.store.delete_session_turn(tid)["ok"])
    self.assertEqual(self.store.list_session(), [])
    self.store.append_session_turn("user", "chat", "again")
    self.assertTrue(self.store.clear_session()["ok"])
    self.assertEqual(self.store.list_session(), [])

def test_session_respects_memory_off(self):
    self.store.set_enabled(False)
    self.store.append_session_turn("user", "voice", "hello there friend")
    self.assertEqual(self.store.list_session(), [])

def test_session_redacts_secrets(self):
    self.store.append_session_turn("user", "chat", "my password is hunter2 and api_key is sk-abcdefghijklmnop")
    turns = self.store.list_session()
    self.assertEqual(len(turns), 1)
    self.assertIn("[REDACTED]", turns[0]["text"])
```

- [ ] **Step 2: Run tests — expect FAIL**

```powershell
$env:PYTHONPATH = "X:\Projects\sys_tools\Bunny OS\sidecar"
python -m unittest sidecar.tests.test_memory.TestMemoryStore.test_session_turn_persists_across_reopen -v
```

(Or from repo root with discover after path fix — use:)

```powershell
cd "X:\Projects\sys_tools\Bunny OS"
$env:PYTHONPATH = "$PWD\sidecar"
python -m unittest discover -s sidecar/tests -p test_memory.py -v
```

Expected: FAIL (`append_session_turn` missing).

- [ ] **Step 3: Implement schema + methods in `memory.py`**

In `_init_db`, after `facts` / `settings`:

```python
conn.execute(
    """
    CREATE TABLE IF NOT EXISTS session_turns (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        role TEXT NOT NULL,
        channel TEXT NOT NULL,
        text TEXT NOT NULL,
        timestamp REAL NOT NULL
    )
    """
)
```

Constants: `MAX_SESSION_TURNS = 40`, `MAX_SESSION_LINE = 500`.

```python
def append_session_turn(self, role: str, channel: str, text: str) -> None:
    if not self.is_enabled():
        return
    cleaned = self.redact((text or "").strip())
    if not cleaned:
        return
    role_n = (role or "user")[:16]
    channel_n = (channel or "session")[:16]
    ts = time.time()
    with self._lock, self._connect() as conn:
        conn.execute(
            "INSERT INTO session_turns(role, channel, text, timestamp) VALUES (?,?,?,?)",
            (role_n, channel_n, cleaned[:MAX_SESSION_LINE], ts),
        )
        # trim oldest beyond cap
        conn.execute(
            """
            DELETE FROM session_turns WHERE id NOT IN (
              SELECT id FROM session_turns ORDER BY id DESC LIMIT ?
            )
            """,
            (MAX_SESSION_TURNS,),
        )
        conn.commit()

def list_session(self, limit: int = 40) -> list[dict[str, Any]]:
    lim = max(1, min(100, int(limit)))
    with self._lock, self._connect() as conn:
        rows = conn.execute(
            "SELECT id, role, channel, text, timestamp FROM session_turns "
            "ORDER BY id DESC LIMIT ?",
            (lim,),
        ).fetchall()
    return [dict(r) for r in rows]

def delete_session_turn(self, turn_id: int) -> dict[str, Any]:
    with self._lock, self._connect() as conn:
        cur = conn.execute("DELETE FROM session_turns WHERE id=?", (int(turn_id),))
        conn.commit()
        return {"ok": cur.rowcount > 0, "deleted": cur.rowcount}

def clear_session(self) -> dict[str, Any]:
    with self._lock, self._connect() as conn:
        cur = conn.execute("DELETE FROM session_turns")
        conn.commit()
        n = cur.rowcount
    self._session.clear()
    return {"ok": True, "deleted": n}
```

Update `remember_session` to:

```python
def remember_session(self, line: str) -> None:
    """Compat: parse 'user (voice): …' / 'bunny …' prefixes when present."""
    raw = (line or "").strip()
    role, channel = "user", "session"
    lower = raw.lower()
    if lower.startswith("bunny"):
        role = "bunny"
    if "(voice)" in lower:
        channel = "voice"
    elif lower.startswith("user:") or "user (" in lower:
        channel = "chat" if "(voice)" not in lower else "voice"
    # strip leading labels for storage clarity
    text = raw
    for prefix in ("user (voice):", "bunny (voice):", "user:", "bunny:"):
        if text.lower().startswith(prefix):
            text = text[len(prefix):].strip()
            break
    self.append_session_turn(role, channel, text)
```

Update `build_prompt_prefix` session block to use `list_session(5)` (oldest→newest for prompt):

```python
turns = list(reversed(self.list_session(5)))
if turns:
    parts.append(
        "Recent session notes (untrusted):\n"
        + "\n".join(f"- ({t['role']}/{t['channel']}) {self.redact(t['text'])}" for t in turns)
    )
```

Update `export_json` `"session"` to `self.list_session()`.

Remove reliance on RAM `_session` for prompt (keep clear on `clear_all` deleting session_turns too).

In `clear_all`:

```python
conn.execute("DELETE FROM session_turns")
```

- [ ] **Step 4: Run memory tests — expect PASS**

```powershell
$env:PYTHONPATH = "$PWD\sidecar"
python -m unittest discover -s sidecar/tests -p test_memory.py -v
```

- [ ] **Step 5: Commit** (when human allows, or batch at wave end if they prefer)

```bash
git add sidecar/memory.py sidecar/tests/test_memory.py
git commit -m "feat(memory): persist session turns in SQLite for W1"
```

---

### Task 2: IPC + main dispatch for session list/delete

**Files:**
- Modify: `sidecar/main.py`, `contracts/ipc.ts`, `src-tauri/src/ipc.rs`
- Test: `src/__tests__/ipcContracts.test.ts` if it enumerates Action variants

**Interfaces:**
- Consumes: Task 1 `list_session`, `delete_session_turn`
- Produces: `memory_list` → `{ enabled, facts, session }`; action `memory_delete_session` with `id: number`

- [ ] **Step 1: Extend TS contract**

In `contracts/ipc.ts` Action union add:

```typescript
| { action: "memory_delete_session"; id: number }
```

Keep `memory_clear_session` as clear-all-turns.

- [ ] **Step 2: Extend Rust `HostAction` / equivalent enum** in `src-tauri/src/ipc.rs`:

```rust
MemoryDeleteSession {
    id: i64,
},
```

(serde tag `memory_delete_session`)

- [ ] **Step 3: Update `main.py`**

```python
if action == "memory_list":
    return json.dumps({
        "enabled": memory.is_enabled(),
        "facts": memory.list_facts(),
        "session": memory.list_session(),
    })

if action == "memory_delete_session":
    return json.dumps(memory.delete_session_turn(int(payload.get("id", 0))))
```

- [ ] **Step 4: Run**

```powershell
npm run lint
npm test
$env:PYTHONPATH = "$PWD\sidecar"
python -m unittest discover -s sidecar/tests
```

Expected: PASS (update ipcContracts test snapshots if any fail).

- [ ] **Step 5: Commit**

```bash
git add contracts/ipc.ts src-tauri/src/ipc.rs sidecar/main.py src/__tests__/ipcContracts.test.ts
git commit -m "feat(ipc): expose memory session list and delete-session"
```

---

### Task 3: Voice/chat write structured turns (optional cleanup)

**Files:**
- Modify: `sidecar/voice_worker.py`, `sidecar/chat_worker.py`

**Interfaces:**
- Consumes: `append_session_turn`

- [ ] **Step 1: Update `_note_voice_memory`**

```python
self._memory.append_session_turn("user", "voice", spoken[:200])
if reply:
    self._memory.append_session_turn("bunny", "voice", reply[:200])
self._memory.maybe_remember_voice(spoken)
```

- [ ] **Step 2: Update `chat_worker._run`**

```python
prompt = self._memory.build_prompt_prefix()
self._memory.append_session_turn("user", "chat", message[:200])
```

(Assistant chat reply logging can wait — user turn is enough for W1; optional: if streaming completion is easy to hook, append bunny/chat — skip if invasive.)

- [ ] **Step 3: Run full Python + npm tests**

- [ ] **Step 4: Commit**

```bash
git add sidecar/voice_worker.py sidecar/chat_worker.py
git commit -m "feat(memory): write voice/chat turns into session table"
```

---

### Task 4: MemoryPanel session UI

**Files:**
- Modify: `src/components/MemoryPanel.tsx`

**Interfaces:**
- Consumes: `memory_list.session`, `memory_delete_session`, `memory_clear_session`

- [ ] **Step 1: Extend state**

```typescript
interface SessionTurn {
  id: number;
  role: string;
  channel: string;
  text: string;
  timestamp: number;
}

const [session, setSession] = useState<SessionTurn[]>([]);
```

In `refresh`:

```typescript
const parsed = JSON.parse(raw) as {
  enabled: boolean;
  facts: Fact[];
  session?: SessionTurn[];
};
setSession(parsed.session ?? []);
```

Clear session button must `await refresh()` after `memory_clear_session`.

- [ ] **Step 2: Render session section above facts**

```tsx
<h3 className={styles.fieldLabel}>Recent session</h3>
<ul className={styles.auditList} aria-label="Session turns">
  {session.map((t) => (
    <li key={t.id} className={styles.auditRow}>
      <span className={styles.auditLabel}>
        [{t.role}/{t.channel}] {t.text}
      </span>
      <button
        className={styles.btnSecondary}
        disabled={busy}
        onClick={() =>
          void (async () => {
            await send({ action: "memory_delete_session", id: t.id });
            await refresh();
          })()
        }
      >
        Remove
      </button>
    </li>
  ))}
  {session.length === 0 && (
    <li className={styles.idleHint}>No session turns yet.</li>
  )}
</ul>
```

Keep facts list labeled “Saved memories”.

- [ ] **Step 3: Lint + test**

```powershell
npm run lint
npm test
```

- [ ] **Step 4: Commit**

```bash
git add src/components/MemoryPanel.tsx
git commit -m "feat(ui): show and delete Memory session turns"
```

---

### Task 5: Smarter app aliases (+ youtube via HTTPS)

**Files:**
- Modify: `sidecar/local_actions.py`, `src-tauri/src/broker.rs`
- Test: `sidecar/tests/test_voice_intents.py` (LocalActions) or new cases in same file

**Interfaces:**
- Produces: expanded `_APP_ALIASES`; `_open_app` special-case `youtube`/`yt` → `open_url` https://www.youtube.com

- [ ] **Step 1: Failing test**

```python
def test_open_app_yt_alias_opens_youtube_https(self):
    with mock.patch("local_actions.open_url_or_file") as start:
        spoken = execute({"action": "open_app", "app_name": "yt"})
    start.assert_called_once()
    self.assertTrue(start.call_args[0][0].startswith("https://www.youtube.com"))
    self.assertIn("YouTube", spoken)

def test_open_app_alias_vscode(self):
    with mock.patch("local_actions._resolve_app", return_value=r"C:\fake\Code.lnk"), mock.patch(
        "local_actions.open_application"
    ) as start:
        execute({"action": "open_app", "app_name": "vscode"})
    start.assert_called_once()
```

- [ ] **Step 2: Run — expect FAIL on yt path if not implemented**

- [ ] **Step 3: Implement in `local_actions.py`**

Expand aliases (add if missing): `code` → visual studio code, `msedge` → microsoft edge, `googledocs` skip, `photos`, `settings` only if catalog-safe — stick to:

```python
"code": "visual studio code",
"ms edge": "microsoft edge",
"msedge": "microsoft edge",
"youtubes": "youtube",  # optional STT plural — skip if noisy
```

In `_open_app` after alias resolve:

```python
alias = _APP_ALIASES.get(key, key)
if alias in ("youtube", "yt") or key in ("youtube", "yt"):
    open_url_or_file("https://www.youtube.com")
    return "Opening YouTube."
```

Mirror in `broker.rs` `app_alias`:

```rust
"yt" | "youtube" => "youtube",
"code" => "visual studio code",
"msedge" | "ms edge" => "microsoft edge",
```

And in Rust `execute_open_app`, if alias is youtube, open HTTPS URL via existing URL opener (same as open_url path) — mirror Python behavior.

- [ ] **Step 4: Tests PASS + full suite**

- [ ] **Step 5: Commit**

```bash
git add sidecar/local_actions.py src-tauri/src/broker.rs sidecar/tests/test_voice_intents.py
git commit -m "feat(apps): expand aliases; open yt via HTTPS"
```

---

### Task 6: W1 phase gate

- [ ] **Step 1: Full automated**

```powershell
npm run lint
npm test
$env:PYTHONPATH = "$PWD\sidecar"
python -m unittest discover -s sidecar/tests
```

All green required.

- [ ] **Step 2: Skills** — run code-reviewer on uncommitted/branch W1 diff; then qa-verifier.

- [ ] **Step 3: Manual smoke checklist**

1. Memory On → voice “what time is it” → Memory panel **Recent session** shows user + bunny lines after poll  
2. Remove one turn; Clear session empties list; restart app → cleared stays cleared; new turn persists across restart  
3. Facts still list auto-facts / manual facts separately  
4. Voice “open yt” / “open vscode” (if installed) behaves; no console shell  
5. Regression: wake toggle, island idle click-through, youtube search domain still work  

- [ ] **Step 4: Update `CLAUDE.md` Current status** one line: W1 session log + aliases done (v0.1.2 pending tag)

- [ ] **Step 5: Human tags `v0.1.2` when ready — do not tag unless asked

---

## Self-review (plan vs program spec W1)

| Spec W1 requirement | Task |
|---|---|
| Persist compact turn summaries | T1–T3 |
| MemoryPanel list/delete | T4 |
| Survives sidecar restart | T1 reopen test |
| Secrets redacted | T1 |
| Aliases Win+Mac | T5 |
| Feature + phase gates | each task + T6 |
| No W2–W4 creep | Out of scope everywhere |

No TBD placeholders in steps above.
