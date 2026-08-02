"""
Local TTS adapters.

Windows: SAPI via pywin32 COM.
macOS: NSSpeechSynthesizer via PyObjC AppKit.
"""
from __future__ import annotations

import re
import sys
import threading
import time
from typing import Protocol

SVSF_ASYNC = 1
SVSF_PURGE_BEFORE_SPEAK = 2

# Hard spoken budget — long essays feel robotic; short turns feel human.
MAX_SPOKEN_CHARS = 280
# Mildly brisker than OS default (−10…+10 on SAPI; ~175 default on macOS).
_SAPI_RATE = 2
_MAC_RATE = 195
_POLL_MS = 100

_WIN_HINT = "pywin32 is required for speech output. Install with: pip install pywin32"
_MAC_HINT = (
    "PyObjC is required for speech on macOS. "
    "pip install pyobjc-framework-Cocoa"
)

_SENTENCE_END = re.compile(r"[.!?…](?=\s|$)")


class TtsEngine(Protocol):
    def speak(self, text: str, cancel_event: threading.Event | None = None) -> None: ...
    def stop(self) -> None: ...


def create_tts() -> TtsEngine:
    if sys.platform == "darwin":
        return MacNsSpeechTts()
    if sys.platform.startswith("win"):
        return WindowsSapiTts()
    raise NotImplementedError(f"TTS not supported on {sys.platform}")


class WindowsSapiTts:
    """Speak via the SAPI SpVoice COM object (system default voice)."""

    def __init__(self) -> None:
        self._stop = threading.Event()

    def speak(self, text: str, cancel_event: threading.Event | None = None) -> None:
        cleaned = _clean(text)
        if not cleaned:
            return
        self._stop.clear()
        try:
            import pythoncom  # type: ignore
            import win32com.client  # type: ignore
        except ImportError as exc:
            raise RuntimeError(_WIN_HINT) from exc

        pythoncom.CoInitialize()
        try:
            voice = win32com.client.Dispatch("SAPI.SpVoice")
            try:
                voice.Rate = _SAPI_RATE
            except Exception:  # noqa: BLE001 — some voices reject Rate
                pass
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


class MacNsSpeechTts:
    """Speak via AppKit NSSpeechSynthesizer (system default voice)."""

    def __init__(self) -> None:
        self._stop = threading.Event()

    def speak(self, text: str, cancel_event: threading.Event | None = None) -> None:
        cleaned = _clean(text)
        if not cleaned:
            return
        self._stop.clear()
        try:
            from AppKit import NSSpeechSynthesizer  # type: ignore
        except ImportError as exc:
            raise RuntimeError(_MAC_HINT) from exc

        voice = NSSpeechSynthesizer.alloc().initWithVoice_(None)
        try:
            voice.setRate_(_MAC_RATE)
        except Exception:  # noqa: BLE001
            pass
        voice.startSpeakingString_(cleaned)
        while voice.isSpeaking():
            if self._stop.is_set() or (
                cancel_event is not None and cancel_event.is_set()
            ):
                voice.stopSpeaking()
                return
            time.sleep(_POLL_MS / 1000.0)

    def stop(self) -> None:
        self._stop.set()


def _clean(text: str) -> str:
    cleaned = (text or "").strip()
    if len(cleaned) <= MAX_SPOKEN_CHARS:
        return cleaned
    return _trim_spoken(cleaned, MAX_SPOKEN_CHARS)


def _trim_spoken(text: str, limit: int) -> str:
    """Cut on a sentence boundary when possible; never mid-word if avoidable."""
    window = text[:limit]
    ends = [m.end() for m in _SENTENCE_END.finditer(window)]
    if ends:
        cut = ends[-1]
        if cut >= limit // 3:
            return text[:cut].rstrip()
    space = window.rfind(" ")
    if space >= limit // 3:
        return text[:space].rstrip()
    return window.rstrip()
