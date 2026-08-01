"""Wake phrase normalize / match / persist tests."""
from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parent.parent))

from wake_phrase import (
    DEFAULT_PHRASE,
    load_settings,
    normalize_phrase,
    phrase_matches,
    save_settings,
    validate_phrase,
)
from wake_word import STATE_OFF, WakeWordDetector


class TestWakePhrase(unittest.TestCase):
    def test_default_is_hey_bunny(self) -> None:
        self.assertEqual(DEFAULT_PHRASE, "hey bunny")

    def test_normalize(self) -> None:
        self.assertEqual(normalize_phrase("  Hey, BUNNY!! "), "hey bunny")

    def test_validate_rejects_empty(self) -> None:
        with self.assertRaises(ValueError):
            validate_phrase("   ")

    def test_match_contiguous(self) -> None:
        self.assertTrue(phrase_matches("hey bunny what time is it", "hey bunny"))
        self.assertTrue(phrase_matches("Okay hey bunny", "hey bunny"))
        self.assertFalse(phrase_matches("hey there bunny", "hey bunny"))
        self.assertFalse(phrase_matches("open notepad", "hey bunny"))

    def test_custom_phrase_match(self) -> None:
        self.assertTrue(phrase_matches("ok computer play music", "ok computer"))

    def test_persist_roundtrip(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            with patch.dict("os.environ", {"BUNNY_APP_DATA": tmp}):
                save_settings("Hey Bunny", 0.6, 2.5, enabled=True)
                loaded = load_settings()
                self.assertEqual(loaded["phrase"], "hey bunny")
                self.assertAlmostEqual(loaded["sensitivity"], 0.6)
                self.assertAlmostEqual(loaded["cooldown_secs"], 2.5)
                self.assertTrue(loaded["enabled"])

    def test_enabled_defaults_false(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            with patch.dict("os.environ", {"BUNNY_APP_DATA": tmp}):
                loaded = load_settings()
                self.assertFalse(loaded["enabled"])


class TestWakeWordCustom(unittest.TestCase):
    def test_defaults_to_hey_bunny_text_mode(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            with patch.dict("os.environ", {"BUNNY_APP_DATA": tmp}):
                w = WakeWordDetector(on_detect=lambda: None)
                status = w.status()
                self.assertEqual(status["phrase"], "hey bunny")
                self.assertEqual(status["mode"], "text")
                self.assertEqual(status["default_phrase"], "hey bunny")
                self.assertTrue(status["hotkey_fallback"])

    def test_configure_custom_phrase(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            with patch.dict("os.environ", {"BUNNY_APP_DATA": tmp}):
                w = WakeWordDetector(on_detect=lambda: None)
                w.configure(phrase="OK Computer")
                self.assertEqual(w.status()["phrase"], "ok computer")
                self.assertEqual(w.status()["mode"], "text")
                self.assertEqual(w.status()["state"], STATE_OFF)

    def test_configure_model_phrase(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            with patch.dict("os.environ", {"BUNNY_APP_DATA": tmp}):
                w = WakeWordDetector(on_detect=lambda: None)
                w.configure(phrase="alexa")
                self.assertEqual(w.status()["phrase"], "alexa")
                self.assertEqual(w.status()["mode"], "model")

    def test_text_utterance_fires_on_match(self) -> None:
        fired: list[bool] = []

        class FakeStt:
            def transcribe(self, samples, sample_rate=16_000):  # noqa: ARG002
                return "hey bunny open chrome"

        with tempfile.TemporaryDirectory() as tmp:
            with patch.dict("os.environ", {"BUNNY_APP_DATA": tmp}):
                w = WakeWordDetector(on_detect=lambda: fired.append(True), stt=FakeStt())
                w._score_utterance(w._stt, [0.1] * 1600)
                self.assertEqual(fired, [True])

    def test_text_utterance_ignores_non_match(self) -> None:
        fired: list[bool] = []

        class FakeStt:
            def transcribe(self, samples, sample_rate=16_000):  # noqa: ARG002
                return "open notepad"

        with tempfile.TemporaryDirectory() as tmp:
            with patch.dict("os.environ", {"BUNNY_APP_DATA": tmp}):
                w = WakeWordDetector(on_detect=lambda: None, stt=FakeStt())
                w._on_detect = lambda: fired.append(True)
                w._score_utterance(w._stt, [0.1] * 1600)
                self.assertEqual(fired, [])

    def test_start_persists_enabled(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            with patch.dict("os.environ", {"BUNNY_APP_DATA": tmp}):
                w = WakeWordDetector(on_detect=lambda: None)

                def fake_run() -> None:
                    w._state = STATE_OFF

                w._run = fake_run  # type: ignore[method-assign]
                w.start()
                self.assertTrue(load_settings()["enabled"])
                w.stop()
                self.assertFalse(load_settings()["enabled"])

    def test_stop_without_persist_keeps_enabled(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            with patch.dict("os.environ", {"BUNNY_APP_DATA": tmp}):
                w = WakeWordDetector(on_detect=lambda: None)

                def fake_run() -> None:
                    w._state = STATE_OFF

                w._run = fake_run  # type: ignore[method-assign]
                w.start()
                self.assertTrue(load_settings()["enabled"])
                w.stop(persist=False)
                self.assertTrue(load_settings()["enabled"])
                self.assertTrue(w.status()["enabled"])

    def test_enabled_follows_user_preference_not_only_runtime(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            with patch.dict("os.environ", {"BUNNY_APP_DATA": tmp}):
                w = WakeWordDetector(on_detect=lambda: None)
                self.assertFalse(w.status()["enabled"])
                w._desired_enabled = True
                w._state = STATE_OFF
                self.assertTrue(w.status()["enabled"])


if __name__ == "__main__":
    unittest.main()
