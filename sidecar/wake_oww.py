"""openWakeWord model loading + frame loop (optional advanced path)."""
from __future__ import annotations

import time
from pathlib import Path
from typing import Any, Callable

from paths import wake_dir
from wake_phrase import DEFAULT_PHRASE

SAMPLE_RATE = 16_000
FRAME_SAMPLES = 1280
PRETRAINED_PHRASES = ("hey_jarvis", "hey_mycroft", "alexa", "hey_rhasspy")

_OWW_HINT = (
    "Model-mode wake phrases need openWakeWord in this install. "
    "Use the default text phrase “hey bunny”, or reinstall Bunny OS from GitHub Releases."
)


def custom_model_dir() -> Path:
    return wake_dir()


def discover_custom_models() -> list[Path]:
    directory = custom_model_dir()
    if not directory.is_dir():
        return []
    return sorted(
        p for p in directory.iterdir() if p.suffix.lower() in (".onnx", ".tflite")
    )


def is_model_phrase(phrase: str) -> bool:
    if phrase in PRETRAINED_PHRASES:
        return True
    return any(p.stem == phrase for p in discover_custom_models())


def load_oww_model(phrase: str) -> Any:
    try:
        import openwakeword
        from openwakeword.model import Model
    except ImportError as exc:
        raise RuntimeError(_OWW_HINT) from exc

    target = _resolve_model_ref(openwakeword, phrase)
    return Model(wakeword_models=[target], inference_framework="onnx")


def _resolve_model_ref(openwakeword: Any, phrase: str) -> str:
    for path in discover_custom_models():
        if path.stem == phrase:
            return str(path)
    if phrase not in PRETRAINED_PHRASES:
        raise RuntimeError(
            f"Unknown wake model '{phrase}'. "
            f"Use a text phrase like '{DEFAULT_PHRASE}', or choose "
            f"{', '.join(PRETRAINED_PHRASES)} / a custom .onnx in {custom_model_dir()}"
        )
    try:
        openwakeword.utils.download_models([phrase])
    except Exception as exc:  # noqa: BLE001
        raise RuntimeError(f"Could not fetch the '{phrase}' wake model: {exc}.") from exc
    return phrase


def run_oww_loop(
    model: Any,
    *,
    stop: Any,
    paused: Any,
    sensitivity: float,
    cooldown: float,
    last_detect: Callable[[], float],
    set_last_detect: Callable[[float], None],
    set_state: Callable[[str], None],
    on_fire: Callable[[], None],
    state_loading: str,
    state_listening: str,
) -> None:
    try:
        import numpy as np
        import sounddevice as sd
    except ImportError as exc:
        raise RuntimeError(
            "sounddevice and numpy are required for wake word. "
            "Install with: pip install sounddevice numpy"
        ) from exc

    while not stop.is_set():
        if paused.is_set():
            set_state(state_loading)
            time.sleep(0.2)
            continue
        with sd.InputStream(
            samplerate=SAMPLE_RATE,
            channels=1,
            dtype="int16",
            blocksize=FRAME_SAMPLES,
        ) as stream:
            set_state(state_listening)
            model.reset()
            while not stop.is_set() and not paused.is_set():
                frame, _ = stream.read(FRAME_SAMPLES)
                scores = model.predict(np.squeeze(frame))
                if not scores or max(scores.values()) < sensitivity:
                    continue
                now = time.monotonic()
                if now - last_detect() < cooldown:
                    continue
                set_last_detect(now)
                model.reset()
                on_fire()
