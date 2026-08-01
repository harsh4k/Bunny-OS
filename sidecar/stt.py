"""
Speech-to-text adapter. faster-whisper is optional; missing package → clear error.
Never persists audio.
"""
from __future__ import annotations

from typing import Protocol


class SttEngine(Protocol):
    def transcribe(self, samples: list[float], sample_rate: int = 16_000) -> str: ...


class FasterWhisperStt:
    def __init__(self, model_size: str = "base", device: str = "cpu") -> None:
        try:
            from faster_whisper import WhisperModel  # type: ignore
        except ImportError as exc:
            raise RuntimeError(
                "faster-whisper not installed. pip install faster-whisper"
            ) from exc
        compute = "int8" if device == "cpu" else "float16"
        self._model = WhisperModel(model_size, device=device, compute_type=compute)

    def transcribe(self, samples: list[float], sample_rate: int = 16_000) -> str:
        if not samples:
            return ""
        import numpy as np  # type: ignore

        audio = np.asarray(samples, dtype="float32")
        segments, _info = self._model.transcribe(audio, language="en", vad_filter=True)
        return " ".join(seg.text.strip() for seg in segments).strip()


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


def create_stt(prefer_cuda: bool = False) -> SttEngine:
    device = "cpu"
    if prefer_cuda:
        try:
            import ctranslate2  # type: ignore  # noqa: F401

            device = "cuda"
        except Exception:  # noqa: BLE001
            device = "cpu"
    return FasterWhisperStt(device=device)
