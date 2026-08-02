"""
Typed message schemas for Bunny OS sidecar.

TS source of truth: contracts/ipc.ts
Rust mirror:        src-tauri/src/ipc.rs
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal, Union

VERSION = "0.1.0"


# ── Lifecycle ─────────────────────────────────────────────────────────────────

AppLifecycle = Literal["starting", "ready", "degraded", "error", "stopped"]


# ── Host → Sidecar ────────────────────────────────────────────────────────────

@dataclass
class ActionMessage:
    type: Literal["action"]
    id: str
    payload: dict[str, Any]


@dataclass
class ShutdownMessage:
    type: Literal["shutdown"]


HostMessage = Union[ActionMessage, ShutdownMessage]


def parse_host_message(obj: dict[str, Any]) -> HostMessage:
    """Validate and convert a raw dict into a typed HostMessage.
    Raises ValueError on unknown or malformed messages.
    """
    msg_type = obj.get("type")
    if msg_type == "action":
        msg_id = obj.get("id")
        payload = obj.get("payload")
        if not isinstance(msg_id, str):
            raise ValueError("action message missing string 'id'")
        if not isinstance(payload, dict):
            raise ValueError("action message missing dict 'payload'")
        action = payload.get("action")
        if action not in ALLOWED_ACTIONS:
            raise ValueError(f"action '{action}' is not in the allowlist")
        if action == "pull_model":
            model_name = payload.get("model_name")
            if not isinstance(model_name, str) or not model_name:
                raise ValueError("pull_model requires a non-empty string 'model_name'")
        if action == "chat":
            # Model is optional: omitted means "use whatever is installed".
            model = payload.get("model")
            if model is not None and (not isinstance(model, str) or len(model) > 200):
                raise ValueError("chat 'model' must be a string of at most 200 chars")
            message = payload.get("message")
            if not isinstance(message, str) or not message or len(message) > 8192:
                raise ValueError("chat requires a non-empty string 'message' (max 8192 chars)")
        if action == "cancel_chat":
            request_id = payload.get("request_id")
            if not isinstance(request_id, str) or len(request_id) > 128:
                raise ValueError(
                    "cancel_chat requires a string 'request_id' (max 128 chars)"
                )
        return ActionMessage(type="action", id=msg_id, payload=payload)
    if msg_type == "shutdown":
        return ShutdownMessage(type="shutdown")
    raise ValueError(f"unknown message type: {msg_type!r}")


# ── Sidecar → Host ────────────────────────────────────────────────────────────

def ready_msg() -> dict[str, Any]:
    return {"type": "ready", "version": VERSION}


def response_msg(msg_id: str, result: str) -> dict[str, Any]:
    return {"type": "response", "id": msg_id, "result": result}


def error_msg(msg_id: str, error: str) -> dict[str, Any]:
    return {"type": "error", "id": msg_id, "error": error}


def stream_msg(msg_id: str, chunk: str, finished: bool) -> dict[str, Any]:
    return {"type": "stream", "id": msg_id, "chunk": chunk, "finished": finished}


# ── Allowlist ─────────────────────────────────────────────────────────────────

ALLOWED_ACTIONS: frozenset[str] = frozenset({
    "open_app",
    "open_url",
    "youtube_search",
    "youtube_play",
    "spotify_open",
    "spotify_search",
    "spotify_play",
    "media_play",
    "media_next",
    "media_prev",
    "show_system_summary",
    "respond",
    "get_inventory",
    "get_advisor",
    "pull_model",
    "get_default_model",
    "chat",
    "cancel_chat",
    # Voice
    "start_listen",
    "stop_listen",
    "cancel_voice",
    "set_mute",
    # Wake word
    "wake_status",
    "wake_start",
    "wake_stop",
    "wake_configure",
    # Memory
    "memory_status",
    "memory_list",
    "memory_add",
    "memory_delete",
    "memory_clear",
    "memory_clear_session",
    "memory_delete_session",
    "memory_set_enabled",
    "memory_export",
})
