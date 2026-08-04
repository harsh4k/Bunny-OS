#!/usr/bin/env python3
"""Prefetch faster-whisper 'base' weights with Hugging Face rate-limit retries."""

from __future__ import annotations

import os
import sys
import time
from pathlib import Path


def _valid_bins(root: Path) -> list[Path]:
    out: list[Path] = []
    for p in root.rglob("model.bin"):
        if not p.is_file():
            continue
        try:
            if p.is_symlink():
                continue
        except OSError:
            pass
        if p.stat().st_size > 0:
            out.append(p)
    return out


def main() -> int:
    if len(sys.argv) > 1:
        root = Path(sys.argv[1])
    else:
        root = Path(os.environ.get("WHISPER_DIR", "build/sidecar/whisper_models"))
    root.mkdir(parents=True, exist_ok=True)
    os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS", "1")

    cached = _valid_bins(root)
    if cached and os.environ.get("BUNNY_WHISPER_FORCE") != "1":
        hit = cached[0]
        print(f"whisper cache hit ({hit} {hit.stat().st_size} bytes)", flush=True)
        return 0

    from faster_whisper import WhisperModel

    last_err: Exception | None = None
    for attempt in range(6):
        try:
            WhisperModel(
                "base",
                device="cpu",
                compute_type="int8",
                download_root=str(root),
            )
            bins = _valid_bins(root)
            if not bins:
                raise RuntimeError(
                    "prefetch produced no real model.bin (symlink-only cache?)"
                )
            ok = bins[0]
            print(f"whisper prefetch ok ({ok} {ok.stat().st_size} bytes)", flush=True)
            return 0
        except Exception as err:
            last_err = err
            msg = str(err).lower()
            retryable = (
                "429" in msg
                or "too many requests" in msg
                or "rate limit" in msg
                or "connection" in msg
                or "timeout" in msg
            )
            if not retryable or attempt >= 5:
                raise
            wait = min(120, 15 * (2**attempt))
            print(
                f"Whisper download failed (attempt {attempt + 1}/6): {err}",
                flush=True,
            )
            print(f"Retrying in {wait}s…", flush=True)
            time.sleep(wait)

    if last_err:
        raise last_err
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
