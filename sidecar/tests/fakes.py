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
def windows_app_catalog(
    start_menu: list[str] | None = None,
    registry: list[str] | None = None,
    user_entries: list[tuple[str, str, str]] | None = None,
) -> Iterator[None]:
    """Run app_catalog's Windows path on any OS with fixed scanner results.

    Stubs both scanners, winreg, and the user's custom-app file, so tests
    never read the real machine.
    """
    fake_sys = types.SimpleNamespace(**vars(sys))
    fake_sys.platform = "win32"
    with (
        patch("app_catalog.sys", fake_sys),
        patch.dict(sys.modules, {"winreg": types.ModuleType("winreg")}),
        patch("app_catalog._scan_start_menu", return_value=list(start_menu or [])),
        patch("app_catalog._scan_registry_uninstall", return_value=list(registry or [])),
        patch("user_apps.user_catalog_entries", return_value=list(user_entries or [])),
    ):
        yield
