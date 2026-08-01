"""
TTS contract tests.

These run without touching the audio device: the SAPI COM object is faked, so
the threading and cancellation behaviour is what gets exercised.
"""
from __future__ import annotations

import sys
import threading
import time
import types
import unittest
from unittest import mock

from tts import SVSF_PURGE_BEFORE_SPEAK, FakeTts, WindowsSapiTts


class FakeVoice:
    """Stands in for SAPI.SpVoice."""

    def __init__(self, speech_polls: int = 3) -> None:
        self.spoken: list[tuple[str, int]] = []
        self.purged = False
        self._polls = speech_polls

    def Speak(self, text: str, flags: int = 0) -> None:  # noqa: N802 — COM name
        self.spoken.append((text, flags))
        if flags & SVSF_PURGE_BEFORE_SPEAK:
            self.purged = True

    def WaitUntilDone(self, ms: int) -> bool:  # noqa: N802 — COM name
        # Block like the real call does, so cancellation timing is meaningful.
        time.sleep(ms / 1000)
        self._polls -= 1
        return self._polls <= 0


def install_fake_com(voice: FakeVoice):
    """Patch pythoncom / win32com.client into sys.modules."""
    pythoncom = types.ModuleType("pythoncom")
    pythoncom.CoInitialize = mock.Mock()
    pythoncom.CoUninitialize = mock.Mock()

    client = types.ModuleType("win32com.client")
    client.Dispatch = mock.Mock(return_value=voice)
    win32com = types.ModuleType("win32com")
    win32com.client = client

    return mock.patch.dict(
        sys.modules,
        {"pythoncom": pythoncom, "win32com": win32com, "win32com.client": client},
    ), pythoncom


class TestWindowsSapiTts(unittest.TestCase):
    def test_speak_returns_when_the_voice_finishes(self):
        voice = FakeVoice(speech_polls=2)
        patch, pythoncom = install_fake_com(voice)
        with patch:
            WindowsSapiTts().speak("hello there")
        self.assertEqual(voice.spoken[0][0], "hello there")
        self.assertFalse(voice.purged)
        # Every COM apartment we open must be closed again.
        self.assertEqual(
            pythoncom.CoInitialize.call_count, pythoncom.CoUninitialize.call_count
        )

    def test_speak_does_not_deadlock_on_repeat_calls(self):
        """Regression: speak() took a lock and then called stop(), which
        wanted the same non-reentrant lock — every reply hung forever."""
        voice = FakeVoice(speech_polls=1)
        patch, _ = install_fake_com(voice)
        engine = WindowsSapiTts()
        with patch:
            done = threading.Event()

            def run() -> None:
                engine.speak("one")
                engine.speak("two")
                done.set()

            threading.Thread(target=run, daemon=True).start()
            self.assertTrue(done.wait(timeout=5), "speak() deadlocked")

    def test_cancel_event_purges_playback(self):
        voice = FakeVoice(speech_polls=10_000)
        patch, _ = install_fake_com(voice)
        cancel = threading.Event()
        cancel.set()
        with patch:
            WindowsSapiTts().speak("a very long sentence", cancel)
        self.assertTrue(voice.purged)

    def test_stop_interrupts_an_active_speak(self):
        voice = FakeVoice(speech_polls=10_000)
        patch, _ = install_fake_com(voice)
        engine = WindowsSapiTts()
        with patch:
            finished = threading.Event()
            threading.Thread(
                target=lambda: (engine.speak("long"), finished.set()), daemon=True
            ).start()
            time.sleep(0.15)
            engine.stop()
            self.assertTrue(finished.wait(timeout=5), "stop() did not interrupt speak")
        self.assertTrue(voice.purged)

    def test_blank_text_never_reaches_the_voice(self):
        voice = FakeVoice()
        patch, _ = install_fake_com(voice)
        with patch:
            WindowsSapiTts().speak("   ")
        self.assertEqual(voice.spoken, [])

    def test_missing_pywin32_reports_how_to_fix_it(self):
        engine = WindowsSapiTts()
        with mock.patch.dict(sys.modules, {"pythoncom": None, "win32com": None}):
            with self.assertRaises(RuntimeError) as ctx:
                engine.speak("hello")
        self.assertIn("pywin32", str(ctx.exception))


class TestFakeTts(unittest.TestCase):
    def test_records_speech_and_honours_cancel(self):
        tts = FakeTts()
        tts.speak("spoken")
        cancelled = threading.Event()
        cancelled.set()
        tts.speak("dropped", cancelled)
        self.assertEqual(tts.spoken, ["spoken"])


if __name__ == "__main__":
    unittest.main()
