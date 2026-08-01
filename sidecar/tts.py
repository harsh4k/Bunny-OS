"""
Local TTS adapters. Default: Windows SAPI through the COM API.

SAPI is driven directly rather than through PowerShell: spawning a shell is
forbidden by the project rules, and it also made every reply pay a process
launch. COM calls stay on the calling thread — SpVoice is apartment-threaded,
so `stop()` only raises a flag that the speaking loop observes.
"""
from __future__ import annotations

import threading
from typing import Protocol

# SpeechVoiceSpeakFlags
SVSF_ASYNC = 1
SVSF_PURGE_BEFORE_SPEAK = 2

MAX_SPOKEN_CHARS = 2000
_POLL_MS = 100

_INSTALL_HINT = (
    "pywin32 is required for speech output. Install with: pip install pywin32"
)


class TtsEngine(Protocol):
    def speak(self, text: str, cancel_event: threading.Event | None = None) -> None: ...
    def stop(self) -> None: ...


class WindowsSapiTts:
    """Speak via the SAPI SpVoice COM object (system default voice)."""

    def __init__(self) -> None:
        self._stop = threading.Event()

    def speak(self, text: str, cancel_event: threading.Event | None = None) -> None:
        cleaned = (text or "").strip()
        if not cleaned:
            return
        if len(cleaned) > MAX_SPOKEN_CHARS:
            cleaned = cleaned[:MAX_SPOKEN_CHARS]

        self._stop.clear()

        try:
            import pythoncom  # type: ignore
            import win32com.client  # type: ignore
        except ImportError as exc:
            raise RuntimeError(_INSTALL_HINT) from exc

        # Each speaking thread needs its own COM apartment.
        pythoncom.CoInitialize()
        try:
            voice = win32com.client.Dispatch("SAPI.SpVoice")
            voice.Speak(cleaned, SVSF_ASYNC)
            while True:
                if self._stop.is_set() or (
                    cancel_event is not None and cancel_event.is_set()
                ):
                    voice.Speak("", SVSF_PURGE_BEFORE_SPEAK)
                    return
                if voice.WaitUntilDone(_POLL_MS):
                    return
        finally:
            pythoncom.CoUninitialize()

    def stop(self) -> None:
        self._stop.set()


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
