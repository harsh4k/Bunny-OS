"""
Wake-word detection built on openWakeWord.

Runs its own 16 kHz capture stream and scores every 80 ms frame locally.
Detection only *starts a listening session* — it can never approve an action.

openWakeWord ships no "Hey Bunny" model, so the phrase is chosen from the
pretrained set. Drop a custom .onnx/.tflite into %LOCALAPPDATA%\\BunnyOS\\wake\\
and it becomes selectable by filename.
"""
from __future__ import annotations

import os
import threading
import time
from pathlib import Path
from typing import Any, Callable

SAMPLE_RATE = 16_000
FRAME_SAMPLES = 1280  # openWakeWord expects 80 ms frames

PRETRAINED_PHRASES = ("hey_jarvis", "hey_mycroft", "alexa", "hey_rhasspy")
DEFAULT_PHRASE = "hey_jarvis"

# State machine: off → loading → listening, or → error from either.
STATE_OFF = "off"
STATE_LOADING = "loading"
STATE_LISTENING = "listening"
STATE_ERROR = "error"

_INSTALL_HINT = (
    "openWakeWord not installed. Talk button and the push-to-talk hotkey still "
    "work. Install with: pip install openwakeword onnxruntime"
)


def custom_model_dir() -> Path:
    base = os.environ.get("LOCALAPPDATA") or os.environ.get("APPDATA") or "."
    return Path(base) / "BunnyOS" / "wake"


def discover_custom_models() -> list[Path]:
    directory = custom_model_dir()
    if not directory.is_dir():
        return []
    return sorted(
        p for p in directory.iterdir() if p.suffix.lower() in (".onnx", ".tflite")
    )


class WakeWordDetector:
    def __init__(
        self,
        on_detect: Callable[[], None],
        sensitivity: float = 0.5,
        cooldown_secs: float = 2.0,
        phrase: str = DEFAULT_PHRASE,
    ) -> None:
        self._on_detect = on_detect
        self._sensitivity = sensitivity
        self._cooldown = cooldown_secs
        self._phrase = phrase
        self._thread: threading.Thread | None = None
        self._stop = threading.Event()
        # Set while a voice session owns the microphone.
        self._paused = threading.Event()
        self._state = STATE_OFF
        self._error = ""
        self._last_detect = 0.0

    # ── Introspection ─────────────────────────────────────────────────────────

    @property
    def available(self) -> bool:
        return self._state in (STATE_LOADING, STATE_LISTENING)

    @property
    def enabled(self) -> bool:
        return self._state in (STATE_LOADING, STATE_LISTENING)

    @property
    def error(self) -> str:
        return self._error

    def status(self) -> dict:
        return {
            "available": self.available,
            "enabled": self.enabled,
            "state": self._state,
            "phrase": self._phrase,
            "phrases": list(PRETRAINED_PHRASES) + [p.stem for p in discover_custom_models()],
            "sensitivity": self._sensitivity,
            "cooldown_secs": self._cooldown,
            "error": self._error,
            "hotkey_fallback": True,
        }

    # ── Control ───────────────────────────────────────────────────────────────

    def configure(
        self,
        sensitivity: float | None = None,
        cooldown_secs: float | None = None,
        phrase: str | None = None,
    ) -> None:
        if sensitivity is not None:
            self._sensitivity = max(0.1, min(0.95, float(sensitivity)))
        if cooldown_secs is not None:
            self._cooldown = max(0.5, min(10.0, float(cooldown_secs)))
        if phrase is not None and phrase != self._phrase:
            self._phrase = str(phrase)
            # A different phrase needs a different model; restart if running.
            if self._state in (STATE_LOADING, STATE_LISTENING):
                self.stop()
                self.start()

    def start(self) -> dict:
        if self._state in (STATE_LOADING, STATE_LISTENING):
            return self.status()

        self._stop.clear()
        self._paused.clear()
        self._error = ""
        # Model load may download weights and take seconds, so the worker owns
        # it — the stdin dispatch loop must stay responsive.
        self._state = STATE_LOADING
        self._thread = threading.Thread(target=self._run, daemon=True, name="wake-word")
        self._thread.start()
        return self.status()

    def stop(self) -> dict:
        self._stop.set()
        thread = self._thread
        if thread is not None and thread is not threading.current_thread():
            thread.join(timeout=2.0)
        self._thread = None
        if self._state != STATE_ERROR:
            self._state = STATE_OFF
        return self.status()

    def pause(self) -> None:
        """Release the microphone while a voice session is active."""
        self._paused.set()

    def resume(self) -> None:
        self._paused.clear()

    # ── Worker ────────────────────────────────────────────────────────────────

    def _run(self) -> None:
        try:
            model = self._load_model()
        except Exception as exc:  # noqa: BLE001 — surfaced through status()
            self._state = STATE_ERROR
            self._error = str(exc)
            return

        try:
            self._detect_loop(model)
        except Exception as exc:  # noqa: BLE001
            self._state = STATE_ERROR
            self._error = f"Wake listener stopped: {exc}"
            return

        if self._state != STATE_ERROR:
            self._state = STATE_OFF

    def _load_model(self) -> Any:
        try:
            import openwakeword
            from openwakeword.model import Model
        except ImportError as exc:
            raise RuntimeError(_INSTALL_HINT) from exc

        target = self._resolve_model_ref(openwakeword)
        return Model(wakeword_models=[target], inference_framework="onnx")

    def _resolve_model_ref(self, openwakeword: Any) -> str:
        """Return a model path (custom) or pretrained name, downloading if needed."""
        for path in discover_custom_models():
            if path.stem == self._phrase:
                return str(path)

        if self._phrase not in PRETRAINED_PHRASES:
            raise RuntimeError(
                f"Unknown wake phrase '{self._phrase}'. "
                f"Choose one of {', '.join(PRETRAINED_PHRASES)} or drop a custom "
                f"model into {custom_model_dir()}"
            )

        try:
            # No-op once the weights are cached on disk.
            openwakeword.utils.download_models([self._phrase])
        except Exception as exc:  # noqa: BLE001
            raise RuntimeError(
                f"Could not fetch the '{self._phrase}' wake model: {exc}. "
                "This one-time download needs internet access."
            ) from exc
        return self._phrase

    def _detect_loop(self, model: Any) -> None:
        try:
            import numpy as np
            import sounddevice as sd
        except ImportError as exc:
            raise RuntimeError(
                "sounddevice and numpy are required for wake word. "
                "Install with: pip install sounddevice numpy"
            ) from exc

        while not self._stop.is_set():
            if self._paused.is_set():
                self._state = STATE_LOADING
                time.sleep(0.2)
                continue

            with sd.InputStream(
                samplerate=SAMPLE_RATE,
                channels=1,
                dtype="int16",
                blocksize=FRAME_SAMPLES,
            ) as stream:
                self._state = STATE_LISTENING
                model.reset()
                while not self._stop.is_set() and not self._paused.is_set():
                    frame, _overflowed = stream.read(FRAME_SAMPLES)
                    scores = model.predict(np.squeeze(frame))
                    if not scores:
                        continue
                    if max(scores.values()) < self._sensitivity:
                        continue
                    now = time.monotonic()
                    if now - self._last_detect < self._cooldown:
                        continue
                    self._last_detect = now
                    model.reset()
                    self._fire()

    def _fire(self) -> None:
        try:
            self._on_detect()
        except Exception as exc:  # noqa: BLE001 — a bad callback must not kill the loop
            self._error = f"Wake handler failed: {exc}"
