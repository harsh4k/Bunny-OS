"""Test doubles for STT / TTS — kept out of production modules."""
from __future__ import annotations

import threading


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
