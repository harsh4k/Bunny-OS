"""Test doubles for STT / TTS and the app catalog — kept out of production modules."""
from __future__ import annotations

import contextlib
import sys
import threading
import types
from collections.abc import Iterator
from unittest.mock import patch


class FakeStt:
    """Deterministic STT for tests."""

    def __init__(self, text: str = "hello bunny") -> None:
        self.text = text
        self.calls = 0

    def transcribe(self, samples: list[float], sample_rate: int = 16_000) -> str:
        self.calls += 1
        if not samples:
            return ""
        return self.text


class FakeTts:
    def __init__(self) -> None:
        self.spoken: list[str] = []
        self.stopped = 0

    def speak(self, text: str, cancel_event: threading.Event | None = None) -> None:
        if cancel_event is not None and cancel_event.is_set():
            return
        self.spoken.append(text)

    def stop(self) -> None:
        self.stopped += 1


@contextlib.contextmanager
def windows_app_catalog() -> Iterator[None]:
    """Run app_catalog's Windows path on any OS with no real user data.

    Callers still patch `_scan_start_menu` / `_scan_registry_uninstall`.
    """
    fake_sys = types.SimpleNamespace(platform="win32")
    with (
        patch("app_catalog.sys", fake_sys),
        patch.dict(sys.modules, {"winreg": types.ModuleType("winreg")}),
        patch("user_apps.user_catalog_entries", return_value=[]),
    ):
        yield
