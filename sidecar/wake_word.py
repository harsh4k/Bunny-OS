"""
Wake-word detection — custom phrase (default "hey bunny") on Windows + macOS.

Primary path: VAD + local faster-whisper, match the configured text phrase.
Optional: openWakeWord when the phrase names a pretrained / custom .onnx model.

Detection only *starts a listening session* — it can never approve an action.
"""
from __future__ import annotations

import threading
import time
from typing import Any, Callable

from wake_oww import (
    PRETRAINED_PHRASES,
    discover_custom_models,
    is_model_phrase,
    load_oww_model,
    run_oww_loop,
)
from wake_phrase import (
    DEFAULT_PHRASE,
    load_settings,
    phrase_matches,
    save_settings,
    validate_phrase,
)

SAMPLE_RATE = 16_000
FRAME_SAMPLES = 1280

STATE_OFF = "off"
STATE_LOADING = "loading"
STATE_LISTENING = "listening"
STATE_ERROR = "error"

_INSTALL_HINT = (
    "Wake word needs the speech engine bundled with Bunny OS. "
    "Talk / push-to-talk still work. Reinstall from GitHub Releases if this persists."
)

_RMS_LO = 0.008
_RMS_HI = 0.035
_MIN_SPEECH_SECS = 0.35
_MAX_UTTER_SECS = 3.5
_SILENCE_SECS = 0.45


def _rms_gate(sensitivity: float) -> float:
    t = max(0.0, min(1.0, (0.95 - float(sensitivity)) / 0.85))
    return _RMS_LO + t * (_RMS_HI - _RMS_LO)


class WakeWordDetector:
    def __init__(
        self,
        on_detect: Callable[[], None],
        sensitivity: float | None = None,
        cooldown_secs: float | None = None,
        phrase: str | None = None,
        stt: Any | None = None,
    ) -> None:
        saved = load_settings()
        self._on_detect = on_detect
        self._sensitivity = float(
            sensitivity if sensitivity is not None else saved["sensitivity"]
        )
        self._cooldown = float(
            cooldown_secs if cooldown_secs is not None else saved["cooldown_secs"]
        )
        raw_phrase = phrase if phrase is not None else saved["phrase"]
        try:
            self._phrase = (
                raw_phrase
                if is_model_phrase(raw_phrase)
                else validate_phrase(raw_phrase)
            )
        except ValueError:
            self._phrase = DEFAULT_PHRASE
        self._stt = stt
        self._thread: threading.Thread | None = None
        self._stop = threading.Event()
        self._paused = threading.Event()
        self._state = STATE_OFF
        self._error = ""
        self._last_detect = 0.0
        self._mode = "model" if is_model_phrase(self._phrase) else "text"

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
        model_opts = list(PRETRAINED_PHRASES) + [p.stem for p in discover_custom_models()]
        return {
            "available": self.available,
            "enabled": self.enabled,
            "state": self._state,
            "phrase": self._phrase,
            "mode": self._mode,
            "phrases": model_opts,
            "sensitivity": self._sensitivity,
            "cooldown_secs": self._cooldown,
            "error": self._error,
            "hotkey_fallback": True,
            "default_phrase": DEFAULT_PHRASE,
        }

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
        if phrase is not None:
            cleaned = str(phrase).strip()
            self._phrase = cleaned if is_model_phrase(cleaned) else validate_phrase(cleaned)
            self._mode = "model" if is_model_phrase(self._phrase) else "text"
        self._persist()
        if phrase is not None and self._state in (STATE_LOADING, STATE_LISTENING):
            self.stop()
            self.start()

    def start(self) -> dict:
        if self._state in (STATE_LOADING, STATE_LISTENING):
            return self.status()
        self._stop.clear()
        self._paused.clear()
        self._error = ""
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
        self._paused.set()

    def resume(self) -> None:
        self._paused.clear()

    def _persist(self) -> None:
        try:
            save_settings(self._phrase, self._sensitivity, self._cooldown)
        except (OSError, ValueError):
            pass

    def _run(self) -> None:
        try:
            if self._mode == "model":
                model = load_oww_model(self._phrase)
                run_oww_loop(
                    model,
                    stop=self._stop,
                    paused=self._paused,
                    sensitivity=self._sensitivity,
                    cooldown=self._cooldown,
                    last_detect=lambda: self._last_detect,
                    set_last_detect=lambda v: setattr(self, "_last_detect", v),
                    set_state=lambda s: setattr(self, "_state", s),
                    on_fire=self._fire,
                    state_loading=STATE_LOADING,
                    state_listening=STATE_LISTENING,
                )
            else:
                self._detect_loop_text(self._ensure_stt())
        except Exception as exc:  # noqa: BLE001
            self._state = STATE_ERROR
            self._error = str(exc)
            return
        if self._state != STATE_ERROR:
            self._state = STATE_OFF

    def _ensure_stt(self) -> Any:
        if self._stt is not None:
            return self._stt
        from stt import create_stt

        self._stt = create_stt()
        return self._stt

    def _detect_loop_text(self, stt: Any) -> None:
        try:
            import numpy as np
            import sounddevice as sd
        except ImportError as exc:
            raise RuntimeError(_INSTALL_HINT) from exc

        silence_frames = max(1, int(_SILENCE_SECS * SAMPLE_RATE / FRAME_SAMPLES))
        min_frames = max(1, int(_MIN_SPEECH_SECS * SAMPLE_RATE / FRAME_SAMPLES))
        max_frames = max(min_frames, int(_MAX_UTTER_SECS * SAMPLE_RATE / FRAME_SAMPLES))

        while not self._stop.is_set():
            if self._paused.is_set():
                self._state = STATE_LOADING
                time.sleep(0.2)
                continue

            gate = _rms_gate(self._sensitivity)
            with sd.InputStream(
                samplerate=SAMPLE_RATE,
                channels=1,
                dtype="float32",
                blocksize=FRAME_SAMPLES,
            ) as stream:
                self._state = STATE_LISTENING
                buf: list[float] = []
                speech_frames = 0
                silence = 0
                capturing = False
                while not self._stop.is_set() and not self._paused.is_set():
                    frame, _ = stream.read(FRAME_SAMPLES)
                    samples = np.squeeze(frame).astype("float32").tolist()
                    rms = (sum(s * s for s in samples) / max(1, len(samples))) ** 0.5
                    if rms >= gate:
                        capturing = True
                        silence = 0
                        speech_frames += 1
                        buf.extend(samples)
                    elif capturing:
                        silence += 1
                        buf.extend(samples)
                        if silence >= silence_frames and speech_frames >= min_frames:
                            self._score_utterance(stt, buf)
                            buf, speech_frames, silence, capturing = [], 0, 0, False
                    if speech_frames >= max_frames:
                        self._score_utterance(stt, buf)
                        buf, speech_frames, silence, capturing = [], 0, 0, False

    def _score_utterance(self, stt: Any, samples: list[float]) -> None:
        if not samples:
            return
        now = time.monotonic()
        if now - self._last_detect < self._cooldown:
            return
        try:
            text = stt.transcribe(samples, SAMPLE_RATE)
        except Exception as exc:  # noqa: BLE001
            self._error = f"Wake STT failed: {exc}"
            return
        if not phrase_matches(text, self._phrase):
            return
        self._last_detect = now
        self._fire()

    def _fire(self) -> None:
        try:
            self._on_detect()
        except Exception as exc:  # noqa: BLE001
            self._error = f"Wake handler failed: {exc}"
