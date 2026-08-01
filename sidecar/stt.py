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


def create_stt() -> SttEngine:
    return FasterWhisperStt(device="cpu")
