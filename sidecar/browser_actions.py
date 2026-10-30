"""
Allowlisted browser tools with confirm for risky steps.

Low-risk (scroll, focus search): run immediately.
Risky (type, click-by-role): queue pending → UI confirm → execute or cancel.

Links and searches (open_url, youtube_*, spotify_search/play) also go through
this queue when screen text is in the prompt: that text is untrusted, so what the
model picks from it needs a confirm before it leaves the machine.
"""
from __future__ import annotations

import json
import threading
import time
import uuid
from typing import Any, Callable

from ipc_types import stream_msg
from platform_browser import (
    browser_click_role,
    browser_focus_search,
    browser_scroll,
    browser_type_text,
    foreground_handle,
    restore_foreground,
)

_WriteFn = Callable[[dict], None]

# Run through local_actions after confirm; queued only after screen context.
SCREEN_GATED = frozenset({
    "open_url",
    "youtube_search",
    "youtube_play",
    "spotify_search",
    "spotify_play",
})
_RISKY = frozenset({"browser_type", "browser_click_role"}) | SCREEN_GATED
_ALLOWED = frozenset({
    "browser_scroll",
    "browser_type",
    "browser_click_role",
    "browser_focus_search",
}) | SCREEN_GATED

_lock = threading.Lock()
_pending: dict[str, dict[str, Any]] = {}
_PENDING_TTL_SECS = 120.0


def _preview(text: str, limit: int) -> str:
    return text if len(text) <= limit else text[: limit - 1] + "…"


def summarize(action: dict[str, Any]) -> str:
    kind = action.get("action")
    query = _preview(str(action.get("query") or ""), 60)
    if kind == "browser_scroll":
        return f"Scroll {action.get('direction', 'down')} in the focused window"
    if kind == "browser_type":
        text = str(action.get("text") or "")
        preview = text if len(text) <= 40 else text[:37] + "…"
        return f"Type “{preview}” into the focused window"
    if kind == "browser_click_role":
        return f"Click window matching “{action.get('name') or ''}”"
    if kind == "browser_focus_search":
        return "Focus the browser address bar"
    if kind == "open_url":
        from local_actions import display_host

        return f"Open a link to {display_host(str(action.get('url') or ''))}"
    if kind == "youtube_search":
        return f"Search YouTube for “{query}”"
    if kind == "youtube_play":
        return f"Play “{query}” on YouTube"
    if kind == "spotify_search":
        return f"Search Spotify for “{query}”"
    if kind == "spotify_play":
        return f"Open “{query}” in Spotify"
    return "Browser action"


def detail(action: dict[str, Any]) -> str:
    """Full link or search text for the confirm banner (the summary is shortened)."""
    kind = action.get("action")
    if kind == "open_url":
        return _preview(str(action.get("url") or ""), 300)
    if kind in SCREEN_GATED:
        return _preview(str(action.get("query") or ""), 300)
    return ""


def handle_browser_action(
    action: dict[str, Any],
    write_fn: _WriteFn | None = None,
    msg_id: str = "browser",
) -> str:
    """
    Run or queue one browser action. Returns a short status string for respond/TTS.
    """
    kind = action.get("action")
    if kind not in _ALLOWED:
        raise ValueError(f"Not an allowlisted browser action: {kind!r}")

    if kind in _RISKY:
        pending_id = _queue(action)
        if write_fn is not None:
            write_fn(
                stream_msg(
                    msg_id,
                    json.dumps(
                        {
                            "browser_confirm_pending": True,
                            "pending_id": pending_id,
                            "summary": summarize(action),
                            "detail": detail(action),
                            "action_kind": kind,
                        },
                        separators=(",", ":"),
                    ),
                    False,
                )
            )
        return f"Confirm in Bunny OS: {summarize(action)}."

    return _execute(action)


def confirm(pending_id: str) -> dict[str, Any]:
    body = _take_body(pending_id)
    if body is None:
        return {"ok": False, "error": "That confirm expired or was already handled."}
    # Restore the window that was focused when the action was queued so type/click
    # land in the browser, not Bunny (user click focuses the confirm UI).
    restore_foreground(body.get("foreground"))
    try:
        result = _execute(body["action"])
        return {"ok": True, "result": result}
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": str(exc)}


def cancel(pending_id: str) -> dict[str, Any]:
    body = _take_body(pending_id)
    if body is None:
        return {"ok": False, "error": "Nothing to cancel."}
    return {"ok": True, "result": f"Cancelled: {summarize(body['action'])}."}


def pending_snapshot() -> list[dict[str, Any]]:
    _sweep()
    with _lock:
        return [
            {
                "pending_id": pid,
                "summary": summarize(body["action"]),
                "action_kind": body["action"].get("action"),
            }
            for pid, body in _pending.items()
        ]


def _queue(action: dict[str, Any]) -> str:
    _sweep()
    pending_id = str(uuid.uuid4())
    with _lock:
        _pending[pending_id] = {
            "action": dict(action),
            "created": time.time(),
            "foreground": foreground_handle(),
        }
    return pending_id


def _take_body(pending_id: str) -> dict[str, Any] | None:
    _sweep()
    with _lock:
        return _pending.pop(pending_id, None)


def _sweep() -> None:
    now = time.time()
    with _lock:
        dead = [
            pid
            for pid, body in _pending.items()
            if now - float(body.get("created", 0)) > _PENDING_TTL_SECS
        ]
        for pid in dead:
            _pending.pop(pid, None)


def _execute(action: dict[str, Any]) -> str:
    kind = action.get("action")
    if kind == "browser_scroll":
        direction = str(action.get("direction") or "down").lower()
        if direction not in ("up", "down"):
            raise ValueError("Scroll direction must be up or down.")
        steps = int(action.get("steps") or 3)
        browser_scroll(direction, steps)  # type: ignore[arg-type]
        return f"Scrolled {direction}."
    if kind == "browser_type":
        text = str(action.get("text") or "")
        browser_type_text(text)
        return "Typed into the focused window."
    if kind == "browser_focus_search":
        browser_focus_search()
        return "Focused the address bar."
    if kind == "browser_click_role":
        browser_click_role(str(action.get("role") or ""), str(action.get("name") or ""))
        return f"Clicked “{action.get('name')}”."
    if kind in SCREEN_GATED:
        from local_actions import execute as execute_local

        return execute_local(dict(action))
    raise ValueError(f"Unhandled browser action: {kind!r}")
