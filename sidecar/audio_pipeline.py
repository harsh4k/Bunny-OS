"""
In-memory 16 kHz mono audio capture. Never writes raw audio to disk.
"""
from __future__ import annotations

import threading
from collections import deque
from typing import Any

SAMPLE_RATE = 16_000
CHANNELS = 1
MAX_SECONDS = 30  # hard cap on buffered audio
MAX_SAMPLES = SAMPLE_RATE * MAX_SECONDS


class AudioPipeline:
    """Rolling PCM buffer. Uses sounddevice when available; otherwise stubs."""

    def __init__(self) -> None:
        self._buf: deque[float] = deque(maxlen=MAX_SAMPLES)
        self._lock = threading.Lock()
        self._stream: Any = None
        self._recording = False

    @property
    def is_recording(self) -> bool:
        return self._recording

    def start(self) -> None:
        if self._recording:
            return
        try:
            import sounddevice as sd  # type: ignore
        except ImportError as exc:
            raise RuntimeError(
                "sounddevice not installed. pip install sounddevice"
            ) from exc

        self.clear()

        def _callback(indata, frames, time_info, status):  # noqa: ARG001
            with self._lock:
                self._buf.extend(indata[:, 0].tolist())

        self._stream = sd.InputStream(
            samplerate=SAMPLE_RATE,
            channels=CHANNELS,
            dtype="float32",
            callback=_callback,
        )
        self._stream.start()
        self._recording = True

    def stop(self) -> list[float]:
        if self._stream is not None:
            try:
                self._stream.stop()
                self._stream.close()
            except Exception:  # noqa: BLE001
                pass
            self._stream = None
        self._recording = False
        with self._lock:
            return list(self._buf)

    def clear(self) -> None:
        with self._lock:
            self._buf.clear()

    def snapshot(self) -> list[float]:
        with self._lock:
            return list(self._buf)

    def sample_count(self) -> int:
        with self._lock:
            return len(self._buf)

    def recent_rms(self, window_samples: int) -> float:
        """Loudness of the newest `window_samples`. Used for silence detection."""
        if window_samples <= 0:
            return 0.0
        with self._lock:
            if not self._buf:
                return 0.0
            window = list(self._buf)[-window_samples:]
        if not window:
            return 0.0
        return (sum(s * s for s in window) / len(window)) ** 0.5
