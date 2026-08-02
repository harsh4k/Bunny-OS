"""
Opt-in screen-context helpers for voice/chat prompts.

Probe runs only when screen_context is enabled AND the utterance looks
screen-related. Never silently captures.
"""
from __future__ import annotations

import re
from typing import Any

from platform_screen import get_focused_window_text

_SCREEN_QUERY = re.compile(
    r"\b("
    r"on\s+(my\s+)?screen|"
    r"what('?s|\s+is)\s+on\s+(the\s+|my\s+)?screen|"
    r"what\s+window|"
    r"which\s+window|"
    r"focused\s+window|"
    r"current\s+window|"
    r"front\s+(most\s+)?(window|app)|"
    r"what\s+app\s+is\s+(open|focused|active)|"
    r"what('?s|\s+is)\s+(this|the)\s+(window|app)|"
    r"what\s+am\s+i\s+(looking\s+at|seeing)|"
    r"read\s+(the\s+)?(window\s+)?title|"
    r"window\s+title|"
    r"screen\s+context"
    r")\b",
    re.IGNORECASE,
)


def looks_like_screen_query(text: str) -> bool:
    return bool(_SCREEN_QUERY.search((text or "").strip()))


def enrich_prompt_with_screen(
    memory: Any,
    base_prompt: str,
    utterance: str,
) -> tuple[str, str | None]:
    """
    Returns (prompt, spoken_error).

    spoken_error is set when screen is On, query matches, and the OS probe fails.
    Caller should speak/show that error and skip the model when present.
    """
    if memory is None:
        return base_prompt, None
    try:
        if not memory.is_screen_context_enabled():
            return base_prompt, None
    except Exception:  # noqa: BLE001
        return base_prompt, None
    if not looks_like_screen_query(utterance):
        return base_prompt, None

    probe = get_focused_window_text()
    if not probe.get("ok"):
        err = str(probe.get("error") or "I couldn't read the focused window.")
        spoken = _spoken_probe_error(err)
        return base_prompt, spoken

    try:
        block = memory.build_screen_block(
            str(probe.get("title") or ""),
            str(probe.get("app") or ""),
        )
    except Exception:  # noqa: BLE001
        return base_prompt, "I couldn't prepare screen context."
    return f"{base_prompt}\n\n{block}", None


def _spoken_probe_error(err: str) -> str:
    low = err.lower()
    if "appkit" in low or "accessibility" in low:
        return "Screen context needs Accessibility permission on this Mac."
    if "no focused" in low or "no frontmost" in low:
        return "I couldn't find a focused window."
    if "no title" in low:
        return "That window has no title I can read."
    if "not supported" in low:
        return "Screen context isn't supported on this system."
    return "I couldn't read the focused window."
