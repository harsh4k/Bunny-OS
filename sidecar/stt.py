"""
Speech-to-text adapter. faster-whisper is optional; missing package → clear error.
Never persists audio. Prefers Whisper weights bundled into the frozen sidecar.

Hugging Face caches often use Windows symlinks (snapshots/ → blobs/). Those
break inside a PyInstaller onefile extract and sometimes for the frozen process
even when PowerShell can follow them. We always resolve to a directory that
contains a real, non-empty model.bin.
"""
from __future__ import annotations

import os
import shutil
import sys
from pathlib import Path
from typing import Protocol

from paths import app_data_dir


class SttEngine(Protocol):
    def transcribe(self, samples: list[float], sample_rate: int = 16_000) -> str: ...


def _has_real_model_bin(root: Path) -> bool:
    """True when root contains a non-empty model.bin that is not a broken link."""
    if not root.is_dir():
        return False
    for path in root.rglob("model.bin"):
        try:
            if path.is_symlink():
                # Prefer materialised files; symlinks fail under frozen extract.
                continue
            if path.is_file() and path.stat().st_size > 0:
                return True
        except OSError:
            continue
    return False


def _materialize_snapshot(snapshot: Path) -> bool:
    """Replace symlink entries in a HF snapshot dir with real file copies."""
    if not snapshot.is_dir():
        return False
    changed = False
    for entry in snapshot.iterdir():
        try:
            if not entry.is_symlink():
                continue
            target = entry.resolve(strict=False)
            if not target.is_file() or target.stat().st_size <= 0:
                continue
            tmp = entry.with_name(entry.name + ".bunny-tmp")
            shutil.copy2(target, tmp)
            entry.unlink(missing_ok=True)
            tmp.replace(entry)
            changed = True
        except OSError:
            continue
    return changed


def _repair_hub_cache(root: Path) -> bool:
    """Materialise any HF snapshot under root that still uses symlinks."""
    if not root.is_dir():
        return False
    repaired = False
    for snapshots in root.rglob("snapshots"):
        if not snapshots.is_dir():
            continue
        for snap in snapshots.iterdir():
            if snap.is_dir() and _materialize_snapshot(snap):
                repaired = True
    return repaired


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
        if _has_real_model_bin(bundled):
            return bundled
        # Symlink-only bundle: try to materialise in place before giving up.
        if bundled.is_dir():
            _repair_hub_cache(bundled)
            if _has_real_model_bin(bundled):
                return bundled

    return app_data_dir() / "models" / "whisper"


def _purge_incomplete_cache(root: Path) -> None:
    """Drop a whisper cache that advertises a snapshot but has no usable model.bin."""
    if not root.is_dir():
        return
    if _has_real_model_bin(root):
        return
    try:
        shutil.rmtree(root)
    except OSError:
        pass


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
        # Prefer local files when the packaging step prefetched usable weights.
        local_only = os.environ.get("BUNNY_WHISPER_LOCAL_ONLY", "").strip() in (
            "1",
            "true",
            "yes",
        )
        if not local_only and getattr(sys, "frozen", False):
            local_only = _has_real_model_bin(root) and "whisper_models" in str(root)

        def _load(*, download_root: Path, local_files_only: bool) -> WhisperModel:
            return WhisperModel(
                model_size,
                device=device,
                compute_type=compute,
                download_root=str(download_root),
                local_files_only=local_files_only,
            )

        try:
            self._model = _load(download_root=root, local_files_only=local_only)
        except Exception as first_exc:  # noqa: BLE001
            # Symlink cache that PowerShell can read but CTranslate2 cannot:
            # materialise files, then retry once.
            if _repair_hub_cache(root) and _has_real_model_bin(root):
                try:
                    self._model = _load(download_root=root, local_files_only=True)
                    return
                except Exception:  # noqa: BLE001
                    pass

            # Fall back to one online fetch into app-data if the bundle is unusable.
            fallback = app_data_dir() / "models" / "whisper"
            if local_only or root != fallback:
                _purge_incomplete_cache(fallback)
                fallback.mkdir(parents=True, exist_ok=True)
                try:
                    self._model = _load(download_root=fallback, local_files_only=False)
                    _repair_hub_cache(fallback)
                    return
                except Exception as fallback_exc:  # noqa: BLE001
                    raise RuntimeError(
                        "Could not load the speech model. Check disk space and retry."
                    ) from fallback_exc

            raise RuntimeError(
                "Could not load the speech model. Check disk space and retry."
            ) from first_exc

    def transcribe(self, samples: list[float], sample_rate: int = 16_000) -> str:
        if not samples:
            return ""
        import numpy as np  # type: ignore

        audio = np.asarray(samples, dtype="float32")
        segments, _info = self._model.transcribe(audio, language="en", vad_filter=True)
        return " ".join(seg.text.strip() for seg in segments).strip()


def create_stt() -> SttEngine:
    return FasterWhisperStt(device="cpu")
