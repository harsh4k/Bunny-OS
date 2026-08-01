"""
Platform seams for cross-OS support (P4 scaffolding).

Windows is the supported path today. macOS stubs raise NotImplementedError
with an actionable message so call sites can degrade gracefully.
"""
from __future__ import annotations

import sys
from typing import Protocol


class MediaKeys(Protocol):
    def play_pause(self) -> None: ...
    def next_track(self) -> None: ...
    def prev_track(self) -> None: ...


class TtsEngine(Protocol):
    def speak(self, text: str) -> None: ...
    def stop(self) -> None: ...


def is_windows() -> bool:
    return sys.platform.startswith("win")


def is_macos() -> bool:
    return sys.platform == "darwin"


def require_windows(feature: str) -> None:
    if not is_windows():
        raise NotImplementedError(
            f"{feature} is Windows-only for now. macOS support is planned (P4)."
        )


def media_keys() -> MediaKeys:
    """Return the OS media-key backend."""
    if is_windows():
        from media_keys import media_next, media_play_pause, media_prev

        class _Win:
            def play_pause(self) -> None:
                media_play_pause()

            def next_track(self) -> None:
                media_next()

            def prev_track(self) -> None:
                media_prev()

        return _Win()
    raise NotImplementedError(
        "Media keys are not implemented on this OS yet (P4 — use AppKit / HID)."
    )


def discover_apps() -> list[str]:
    """Installed app names the assistant may open."""
    if is_windows():
        from app_catalog import get_app_catalog

        return [a.name for a in get_app_catalog()]
    raise NotImplementedError(
        "App discovery is not implemented on this OS yet (P4 — Spotlight / LS)."
    )
