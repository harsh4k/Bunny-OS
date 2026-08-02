"""
Bunny OS sidecar — main entry point.

Keeps the stdin loop responsive. Long work runs on daemon workers.
"""
from __future__ import annotations

import json
import os
import sys
import threading
import traceback
from pathlib import Path

from protocol import claim_stdout, recv_message, send_message
from ipc_types import (
    parse_host_message,
    ready_msg,
    response_msg,
    error_msg,
    ActionMessage,
    ShutdownMessage,
)
from chat_handler import fetch_tags, installed_models, pick_default_model
from inventory import get_inventory
from advisor import advise, KNOWN_MODEL_NAMES
from pull_worker import PullWorker
from chat_worker import ChatWorker
from voice_worker import VoiceWorker
from wake_word import WakeWordDetector
from memory import MemoryStore

_write_lock = threading.Lock()
_ASYNC = object()


def _locked_send(msg: dict) -> None:
    with _write_lock:
        send_message(msg)


from paths import memory_db_path


def _memory_path() -> Path:
    return memory_db_path()


def main() -> int:
    claim_stdout()
    memory = MemoryStore(_memory_path())
    pull_worker = PullWorker(write_fn=_locked_send)
    chat_worker = ChatWorker(write_fn=_locked_send, memory=memory)

    # Wake and voice both want the microphone, so they hand it back and forth:
    # a voice session pauses the wake listener for its duration.
    wake_ref: dict[str, WakeWordDetector] = {}

    def _on_voice_busy(busy: bool) -> None:
        detector = wake_ref.get("wake")
        if detector is None:
            return
        detector.pause() if busy else detector.resume()

    voice_worker = VoiceWorker(
        write_fn=_locked_send, memory=memory, on_busy_change=_on_voice_busy
    )
    wake = WakeWordDetector(on_detect=voice_worker.start_wake_session)
    wake_ref["wake"] = wake
    try:
        from wake_phrase import load_settings as _load_wake_settings

        if _load_wake_settings().get("enabled"):
            wake.start(persist=False)
    except Exception as exc:  # noqa: BLE001
        _log_err(f"wake auto-start skipped: {exc}")

    ctx = {
        "pull": pull_worker,
        "chat": chat_worker,
        "voice": voice_worker,
        "wake": wake,
        "memory": memory,
    }
    _locked_send(ready_msg())

    while True:
        try:
            raw = recv_message()
        except EOFError:
            _shutdown_all(ctx)
            return 0
        except Exception as exc:
            _log_err(f"recv error: {exc}")
            _shutdown_all(ctx)
            return 1

        try:
            msg = parse_host_message(raw)
        except ValueError as exc:
            _log_err(f"parse error: {exc}")
            # Reply so the caller fails fast instead of waiting on a watchdog.
            _reject(raw, str(exc))
            continue

        if isinstance(msg, ShutdownMessage):
            _shutdown_all(ctx)
            return 0

        if isinstance(msg, ActionMessage):
            handle_action(msg, ctx)


def _shutdown_all(ctx: dict) -> None:
    ctx["pull"].cancel()
    ctx["chat"].cancel()
    ctx["voice"].cancel()
    # Stop the mic loop only — do not wipe the user's saved wake-enabled preference.
    ctx["wake"].stop(persist=False)


def handle_action(msg: ActionMessage, ctx: dict) -> None:
    action = msg.payload.get("action", "")
    try:
        result = dispatch(action, msg.payload, msg.id, ctx)
        if result is not _ASYNC:
            _locked_send(response_msg(msg.id, result))
    except NotImplementedError as exc:
        _locked_send(error_msg(msg.id, f"not_implemented: {exc}"))
    except Exception as exc:
        _log_err(f"action error [{action}]: {traceback.format_exc()}")
        _locked_send(error_msg(msg.id, str(exc)))


def dispatch(action: str, payload: dict, msg_id: str, ctx: dict) -> object:
    pull_worker: PullWorker = ctx["pull"]
    chat_worker: ChatWorker = ctx["chat"]
    voice_worker: VoiceWorker = ctx["voice"]
    wake: WakeWordDetector = ctx["wake"]
    memory: MemoryStore = ctx["memory"]

    if action == "get_inventory":
        return json.dumps(get_inventory(), separators=(",", ":"))

    if action == "get_advisor":
        inv = get_inventory()
        return json.dumps(
            {"hardware": inv["hardware"], "ollama": inv["ollama"], "advisor": advise(inv)},
            separators=(",", ":"),
        )

    if action == "pull_model":
        model_name = payload.get("model_name", "")
        if not isinstance(model_name, str) or model_name not in KNOWN_MODEL_NAMES:
            raise ValueError("model not in known catalog")
        if not pull_worker.start(msg_id, model_name):
            raise RuntimeError("a model pull is already in progress")
        return _ASYNC

    if action == "get_default_model":
        tags = fetch_tags()
        return json.dumps(
            {"model": pick_default_model(tags), "installed": installed_models(tags)},
            separators=(",", ":"),
        )

    if action == "chat":
        model = payload.get("model", "")
        message = payload.get("message", "")
        if not chat_worker.start(msg_id, model, message):
            raise RuntimeError("a chat is already in progress")
        return _ASYNC

    if action == "cancel_chat":
        chat_worker.cancel(payload.get("request_id", ""))
        return json.dumps({"status": "cancel_requested"})

    if action == "start_listen":
        # The hotkey path sends model:null, so fall back rather than pass None on.
        if not voice_worker.start_listen(msg_id, payload.get("model") or None):
            raise RuntimeError(voice_worker.reject_reason or "Could not start listening")
        return _ASYNC

    if action == "stop_listen":
        return json.dumps(voice_worker.stop_listen(msg_id))

    if action == "cancel_voice":
        return json.dumps(voice_worker.cancel(payload.get("request_id")))

    if action == "set_mute":
        muted = bool(payload.get("muted", True))
        return json.dumps(voice_worker.set_mute(muted))

    if action == "wake_status":
        return json.dumps(wake.status())

    if action == "wake_start":
        return json.dumps(wake.start())

    if action == "wake_stop":
        return json.dumps(wake.stop())

    if action == "wake_configure":
        wake.configure(
            payload.get("sensitivity"),
            payload.get("cooldown_secs"),
            payload.get("phrase"),
            payload.get("profile"),
        )
        return json.dumps(wake.status())

    if action == "memory_status":
        return json.dumps({"enabled": memory.is_enabled(), "count": len(memory.list_facts())})

    if action == "memory_list":
        return json.dumps({
            "enabled": memory.is_enabled(),
            "facts": memory.list_facts(),
            "session": memory.list_session(),
        })

    if action == "memory_add":
        return json.dumps(memory.add_fact(payload.get("text", ""), payload.get("source", "user")))

    if action == "memory_delete":
        return json.dumps(memory.delete_fact(int(payload.get("id", 0))))

    if action == "memory_clear":
        return json.dumps(memory.clear_all())

    if action == "memory_clear_session":
        return json.dumps(memory.clear_session())

    if action == "memory_delete_session":
        return json.dumps(memory.delete_session_turn(int(payload.get("id", 0))))

    if action == "memory_set_enabled":
        memory.set_enabled(bool(payload.get("enabled", True)))
        return json.dumps({"enabled": memory.is_enabled()})

    if action == "memory_export":
        return memory.export_json()

    _SIDECAR_LOCAL = frozenset({
        "open_app", "open_url", "youtube_search", "youtube_play",
        "spotify_open", "spotify_search", "spotify_play",
        "media_play", "media_next", "media_prev",
        "show_system_summary", "get_local_time", "get_local_date",
    })
    if action in _SIDECAR_LOCAL:
        from local_actions import execute
        body = payload if "action" in payload else {**payload, "action": action}
        return execute(body)
    if action == "respond":
        return str(payload.get("input") or "")
    raise ValueError(f"action '{action}' not in allowlist")


def _reject(raw: object, reason: str) -> None:
    """Send a terminal error for a malformed message that still carries an id."""
    if isinstance(raw, dict) and isinstance(raw.get("id"), str):
        _locked_send(error_msg(raw["id"], f"rejected: {reason}"))


def _log_err(msg: str) -> None:
    print(f"[bunny-sidecar] ERROR: {msg}", file=sys.stderr, flush=True)


if __name__ == "__main__":
    sys.exit(main())
