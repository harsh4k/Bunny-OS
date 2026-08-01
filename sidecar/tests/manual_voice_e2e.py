"""
Manual end-to-end voice check (not part of the automated suite).

Synthesises speech with SAPI, feeds it through the real VoiceWorker (real STT,
real Ollama chat, fake TTS) and prints every message the worker emits. Use it to
see the actual error text behind a "Voice error" label in the pill.

    python tests/manual_voice_e2e.py
"""
from __future__ import annotations

import json
import sys
import time
import wave
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from audio_pipeline import AudioPipeline  # noqa: E402
from stt import create_stt  # noqa: E402
from tts import WindowsSapiTts  # noqa: E402
from voice_worker import VoiceWorker  # noqa: E402

PHRASE = "What is two plus two?"


def synth_speech(path: Path, phrase: str) -> None:
    """Render the prompt to a WAV with SAPI so STT has real speech to chew on."""
    import pythoncom  # type: ignore
    import win32com.client  # type: ignore

    pythoncom.CoInitialize()
    try:
        stream = win32com.client.Dispatch("SAPI.SpFileStream")
        stream.Open(str(path), 3)  # SSFMCreateForWrite
        voice = win32com.client.Dispatch("SAPI.SpVoice")
        voice.AudioOutputStream = stream
        voice.Speak(phrase)
        stream.Close()
    finally:
        pythoncom.CoUninitialize()


def load_16k_mono(path: Path) -> list[float]:
    import numpy as np

    with wave.open(str(path), "rb") as w:
        rate = w.getframerate()
        frames = w.readframes(w.getnframes())
        channels = w.getnchannels()
        width = w.getsampwidth()

    dtype = {1: np.uint8, 2: np.int16, 4: np.int32}[width]
    data = np.frombuffer(frames, dtype=dtype).astype("float32")
    if width == 2:
        data /= 32768.0
    elif width == 4:
        data /= 2147483648.0
    else:
        data = (data - 128.0) / 128.0
    if channels > 1:
        data = data.reshape(-1, channels).mean(axis=1)
    if rate != 16_000:
        idx = np.linspace(0, len(data) - 1, int(len(data) * 16_000 / rate))
        data = np.interp(idx, np.arange(len(data)), data).astype("float32")
    return data.tolist()


class PlaybackAudio(AudioPipeline):
    """Feeds pre-recorded speech instead of opening a microphone."""

    def __init__(self, samples: list[float]) -> None:
        super().__init__()
        self._samples = samples

    def start(self) -> None:
        self._recording = True
        with self._lock:
            self._buf.clear()
            self._buf.extend(self._samples)

    def stop(self) -> list[float]:
        self._recording = False
        return list(self._samples)


def main() -> int:
    wav = Path(__file__).parent / "_voice_probe.wav"
    print(f"synthesising: {PHRASE!r}")
    synth_speech(wav, PHRASE)
    samples = load_16k_mono(wav)
    wav.unlink(missing_ok=True)
    print(f"audio: {len(samples) / 16_000:.1f}s")

    messages: list[dict] = []

    def write(msg: dict) -> None:
        messages.append(msg)
        kind = msg.get("type")
        if kind == "stream":
            chunk = msg.get("chunk", "")
            if chunk.startswith("{"):
                print("  stream:", chunk)
            else:
                print("  token:", chunk[:80])
        else:
            print(f"  {kind}:", json.dumps(msg)[:400])

    busy: list[bool] = []
    tts = WindowsSapiTts()
    worker = VoiceWorker(
        write_fn=write,
        stt=create_stt(prefer_cuda=False),
        tts=tts,
        audio=PlaybackAudio(samples),
        on_busy_change=busy.append,
    )
    worker.set_mute(False)

    print("\n--- push-to-talk press ---")
    assert worker.start_listen("probe-1", None)
    time.sleep(0.4)

    print("--- push-to-talk release ---")
    worker.stop_listen("probe-1")

    # This is exactly what the F9 hotkey does on release.
    print("--- re-mute (what F9 does after release) ---")
    worker.set_mute(True)

    # Wait for the session thread to release: the state machine can already
    # read IDLE while STT/chat/TTS are still running.
    deadline = time.time() + 240
    while busy[-1:] != [False] and time.time() < deadline:
        time.sleep(0.2)

    print("\n--- result ---")
    errors = [m for m in messages if m.get("type") == "error"]
    replies = [
        m.get("result") for m in messages if m.get("type") == "response"
    ]
    print("errors :", [m.get("error") for m in errors] or "none")
    print("reply  :", replies or "none")
    print("(the reply should also have been spoken aloud)")
    return 0 if replies and not errors else 1


if __name__ == "__main__":
    raise SystemExit(main())
