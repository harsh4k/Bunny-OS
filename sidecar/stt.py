"""
Speech-to-text adapter. faster-whisper is optional; missing package → clear error.
Never persists audio. Prefers Whisper weights bundled into the frozen sidecar.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path
from typing import Protocol

from paths import app_data_dir


class SttEngine(Protocol):
    def transcribe(self, samples: list[float], sample_rate: int = 16_000) -> str: ...


def whisper_download_root() -> Path:
    """
    Resolve where faster-whisper looks for model files.
    Frozen builds prefer the bundled `whisper_models` folder (no surprise download).
    """
    override = os.environ.get("BUNNY_WHISPER_DIR")
    if override:
        return Path(override)

    if getattr(sys, "frozen", False):
        meipass = Path(getattr(sys, "_MEIPASS", ""))
        bundled = meipass / "whisper_models"
        if bundled.is_dir() and any(bundled.iterdir()):
            return bundled

    return app_data_dir() / "models" / "whisper"


class FasterWhisperStt:
    def __init__(self, model_size: str = "base", device: str = "cpu") -> None:
        try:
            from faster_whisper import WhisperModel  # type: ignore
        except ImportError as exc:
            raise RuntimeError(
                "Speech engine missing from this Bunny OS install. "
                "Reinstall from https://github.com/harsh4k/Bunny-OS/releases"
            ) from exc
        compute = "int8" if device == "cpu" else "float16"
        root = whisper_download_root()
        root.mkdir(parents=True, exist_ok=True)
        # Prefer local files when the packaging step prefetched weights.
        local_only = os.environ.get("BUNNY_WHISPER_LOCAL_ONLY", "").strip() in (
            "1",
            "true",
            "yes",
        )
        if not local_only and getattr(sys, "frozen", False):
            bundled = Path(getattr(sys, "_MEIPASS", "")) / "whisper_models"
            local_only = bundled.is_dir() and any(bundled.iterdir())
        try:
            self._model = WhisperModel(
                model_size,
                device=device,
                compute_type=compute,
                download_root=str(root),
                local_files_only=local_only,
            )
        except Exception as exc:  # noqa: BLE001
            # Fall back to one online fetch into app-data if bundle missing.
            if local_only:
                fallback = app_data_dir() / "models" / "whisper"
                fallback.mkdir(parents=True, exist_ok=True)
                self._model = WhisperModel(
                    model_size,
                    device=device,
                    compute_type=compute,
                    download_root=str(fallback),
                    local_files_only=False,
                )
            else:
                raise RuntimeError(
                    "Could not load the speech model. Check disk space and retry."
                ) from exc

    def transcribe(self, samples: list[float], sample_rate: int = 16_000) -> str:
        if not samples:
            return ""
        import numpy as np  # type: ignore

        audio = np.asarray(samples, dtype="float32")
        segments, _info = self._model.transcribe(audio, language="en", vad_filter=True)
        return " ".join(seg.text.strip() for seg in segments).strip()


def create_stt() -> SttEngine:
    return FasterWhisperStt(device="cpu")
