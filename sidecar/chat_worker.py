"""
Background chat worker for Bunny OS sidecar.

Design (mirrors PullWorker):
  - Exactly one active chat (Lock as try-acquire gate).
  - Daemon thread — cannot outlive the sidecar process.
  - Cancellable: cancel(target_id) sets Event + best-effort closes the live
    HTTP connection so readline() unblocks immediately rather than waiting for
    the socket read timeout.
  - Exactly one terminal message (response or error) per request regardless of
    how the session ends.  Locks released in finally blocks.
  - No cross-request cancellation: cancel(target_id) is a no-op if target_id
    doesn't match the active request.
"""
from __future__ import annotations

import http.client
import json
import threading
from typing import Any, Callable

from chat_handler import (
    CONNECT_TIMEOUT_SECS,
    FIRST_TOKEN_TIMEOUT_SECS,
    MAX_LINE_BYTES,
    MAX_LINES,
    MAX_REPLY_CHARS,
    OLLAMA_HOST,
    OLLAMA_PORT,
    PER_READ_TIMEOUT_SECS,
    SYSTEM_PROMPT,
    TOOL_DEFINITIONS,
    _parse_chunk,
    _validate_tool_calls,
    _verify_model,
    fetch_tags,
    pick_default_model,
)
from ipc_types import error_msg, response_msg, stream_msg

_WriteFn = Callable[[dict], None]
_SetConnFn = Callable[[http.client.HTTPConnection | None], None]


def handle_chat_streaming(
    msg_id: str,
    model: str | None,
    message: str,
    write_fn: _WriteFn,
    cancel_event: threading.Event,
    set_active_conn: _SetConnFn,
    system_prompt: str | None = None,
    *,
    think: bool | None = None,
) -> None:
    """
    Always sends exactly one terminal message (response_msg or error_msg).
    Designed to run on a ChatWorker daemon thread.

    An empty `model` means "pick one that's installed" — the voice path has no
    model picker, so it defers the choice to here where /api/tags is already in
    hand.

    `think=False` disables reasoning tokens (faster voice replies on models that
    support it). `None` leaves Ollama's default alone.
    """
    if cancel_event.is_set():
        write_fn(error_msg(msg_id, "cancelled"))
        return

    try:
        tags = fetch_tags()
        if model:
            _verify_model(model, tags)
        else:
            model = pick_default_model(tags)
            if model is None:
                raise ValueError(
                    "No chat model installed in Ollama. "
                    "Pull one with: ollama pull llama3.2:3b"
                )
    except ValueError as exc:
        write_fn(error_msg(msg_id, str(exc)))
        return

    if cancel_event.is_set():
        write_fn(error_msg(msg_id, "cancelled"))
        return

    prompt = system_prompt or SYSTEM_PROMPT
    messages = [
        {"role": "system", "content": prompt},
        {"role": "user", "content": message},
    ]

    try:
        result = _stream_chat(
            model=model,
            messages=messages,
            msg_id=msg_id,
            write_fn=write_fn,
            cancel_event=cancel_event,
            set_active_conn=set_active_conn,
            think=think,
        )
    except (OSError, http.client.HTTPException):
        if cancel_event.is_set():
            write_fn(error_msg(msg_id, "cancelled"))
        else:
            write_fn(error_msg(msg_id, "Network error during chat"))
        return
    except ValueError as exc:
        write_fn(error_msg(msg_id, f"Chat error: {exc}"))
        return
    except Exception as exc:  # noqa: BLE001
        write_fn(error_msg(msg_id, f"Chat error: {exc}"))
        return

    if result is None:
        write_fn(error_msg(msg_id, "cancelled"))
        return

    write_fn(response_msg(msg_id, json.dumps(result, separators=(",", ":"))))


def _stream_chat(
    model: str,
    messages: list[dict],
    msg_id: str,
    write_fn: _WriteFn,
    cancel_event: threading.Event,
    set_active_conn: _SetConnFn,
    think: bool | None = None,
) -> dict | None:
    """
    POST /api/chat, stream NDJSON. Returns AssistantResult dict or None if cancelled.
    Uses bounded readline(MAX_LINE_BYTES + 1) to prevent allocation before size check.
    """
    payload: dict[str, Any] = {
        "model": model,
        "messages": messages,
        "tools": TOOL_DEFINITIONS,
        "stream": True,
    }
    if think is not None:
        payload["think"] = think
    body = json.dumps(payload, separators=(",", ":")).encode("utf-8")

    conn = http.client.HTTPConnection(OLLAMA_HOST, OLLAMA_PORT, timeout=CONNECT_TIMEOUT_SECS)
    try:
        # Reaching Ollama must be quick, but waiting for it to load a cold model
        # must not be — so the two budgets are set separately.
        conn.connect()
        if conn.sock is not None:
            conn.sock.settimeout(FIRST_TOKEN_TIMEOUT_SECS)
        conn.request(
            "POST", "/api/chat", body=body,
            headers={"Content-Type": "application/json", "Accept": "application/x-ndjson"},
        )
        resp = conn.getresponse()
        if resp.status != 200:
            raise ValueError(f"Ollama /api/chat returned HTTP {resp.status}")
        if conn.sock is not None:
            conn.sock.settimeout(PER_READ_TIMEOUT_SECS)

        set_active_conn(conn)  # register for best-effort cancel-close

        accumulated_text = ""
        # Reasoning tokens count toward the char budget but are never spoken
        # or shown — they exist only so a long think block cannot DoS memory.
        budget_chars = 0
        line_count = 0
        tool_call: dict | None = None

        while True:
            if cancel_event.is_set():
                return None

            # Bounded read: at most MAX_LINE_BYTES+1 bytes allocated per iteration
            line_bytes = resp.readline(MAX_LINE_BYTES + 1)
            if not line_bytes:
                break
            if len(line_bytes) > MAX_LINE_BYTES:
                raise ValueError(f"NDJSON line too long ({len(line_bytes)} bytes, max {MAX_LINE_BYTES})")

            line_count += 1
            if line_count > MAX_LINES:
                raise ValueError(f"Response exceeds {MAX_LINES} NDJSON lines")

            line = line_bytes.strip()
            if not line:
                continue

            chunk = _parse_chunk(line)
            if chunk is None:
                continue

            err = chunk.get("error")
            if isinstance(err, str):
                raise ValueError(f"Ollama error: {err}")

            msg = chunk.get("message")
            if isinstance(msg, dict):
                thinking = msg.get("thinking")
                if isinstance(thinking, str) and thinking:
                    budget_chars += len(thinking)
                    if budget_chars > MAX_REPLY_CHARS:
                        raise ValueError("Reply too long")

                content = msg.get("content")
                if isinstance(content, str) and content:
                    budget_chars += len(content)
                    if budget_chars > MAX_REPLY_CHARS:
                        raise ValueError("Reply too long")
                    accumulated_text += content
                    write_fn(stream_msg(msg_id, content, False))

            if chunk.get("done") is True:
                if isinstance(msg, dict):
                    calls = msg.get("tool_calls")
                    if calls is not None:
                        tool_call = _validate_tool_calls(calls)
                break

        write_fn(stream_msg(msg_id, "", True))

        if tool_call is not None:
            return _resolve_tool_result(tool_call)
        return {"kind": "respond", "text": accumulated_text}

    finally:
        set_active_conn(None)
        conn.close()


# Tools the sidecar can answer without the Rust broker. Time/date must be
# resolved here — otherwise the model "calls" them and voice hears nothing.
_LOCAL_RESOLVE = frozenset(
    {
        "get_local_time",
        "get_local_date",
        "show_system_summary",
        "media_play",
        "media_next",
        "media_prev",
    }
)


def _resolve_tool_result(tool_call: dict) -> dict:
    name = tool_call.get("action")
    if name in _LOCAL_RESOLVE:
        from local_actions import execute

        return {"kind": "respond", "text": execute(tool_call)}
    return {"kind": "action", "action": tool_call}


# ── ChatWorker class ──────────────────────────────────────────────────────────


class ChatWorker:
    """
    Non-blocking chat initiator.  start() returns immediately; the actual HTTP
    streaming runs on a daemon thread and writes its terminal response/error
    through write_fn (which holds the IPC write-lock).
    """

    def __init__(self, write_fn: _WriteFn, memory: Any | None = None) -> None:
        self._write = write_fn
        self._memory = memory
        self._lock = threading.Lock()         # exactly-one-chat gate
        self._cancel = threading.Event()
        self._active_id: str | None = None    # set before thread start, cleared in finally
        self._active_conn: http.client.HTTPConnection | None = None
        self._conn_lock = threading.Lock()    # protects _active_conn

    def is_busy(self) -> bool:
        return self._lock.locked()

    def cancel(self, target_id: str | None = None) -> None:
        """
        Signal the active chat to abort.
        target_id: only cancel if this matches the active request (None = unconditional).
        Best-effort closes the HTTP socket so readline() unblocks immediately.
        """
        if target_id is not None and self._active_id != target_id:
            return
        self._cancel.set()
        with self._conn_lock:
            if self._active_conn is not None:
                try:
                    self._active_conn.close()
                except Exception:  # noqa: BLE001
                    pass

    def start(self, msg_id: str, model: str, message: str) -> bool:
        """
        Launch a chat in the background.  Returns True if accepted, False if busy.
        The terminal response/error is written asynchronously via write_fn.
        """
        if not self._lock.acquire(blocking=False):
            return False
        self._cancel.clear()
        self._active_id = msg_id
        t = threading.Thread(
            target=self._run,
            args=(msg_id, model, message),
            daemon=True,
            name=f"chat-{msg_id[:12]}",
        )
        t.start()
        return True

    def _run(self, msg_id: str, model: str, message: str) -> None:
        try:
            prompt = SYSTEM_PROMPT
            if self._memory is not None:
                try:
                    prompt = self._memory.build_prompt_prefix()
                    self._memory.remember_session(f"user: {message[:200]}")
                except Exception:  # noqa: BLE001
                    prompt = SYSTEM_PROMPT
            handle_chat_streaming(
                msg_id,
                model,
                message,
                self._write,
                self._cancel,
                self._set_conn,
                system_prompt=prompt,
            )
        except Exception as exc:  # noqa: BLE001 — safety net; handler should catch all
            try:
                self._write(error_msg(msg_id, f"internal error: {exc}"))
            except Exception:  # noqa: BLE001
                pass
        finally:
            self._active_id = None
            with self._conn_lock:
                self._active_conn = None
            self._lock.release()

    def _set_conn(self, conn: http.client.HTTPConnection | None) -> None:
        with self._conn_lock:
            self._active_conn = conn
