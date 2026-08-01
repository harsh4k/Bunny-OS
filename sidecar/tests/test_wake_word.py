"""Wake-word detector status tests."""
from __future__ import annotations

import time
import unittest

from wake_word import (
    DEFAULT_PHRASE,
    STATE_ERROR,
    STATE_LISTENING,
    STATE_OFF,
    WakeWordDetector,
)


class TestWakeWord(unittest.TestCase):
    def test_status_includes_hotkey_fallback(self):
        w = WakeWordDetector(on_detect=lambda: None)
        status = w.status()
        self.assertTrue(status["hotkey_fallback"])
        self.assertFalse(status["enabled"])

    def test_configure_clamps(self):
        w = WakeWordDetector(on_detect=lambda: None)
        w.configure(sensitivity=5.0, cooldown_secs=0.01)
        self.assertLessEqual(w.status()["sensitivity"], 0.95)
        self.assertGreaterEqual(w.status()["cooldown_secs"], 0.5)

    def test_offers_pretrained_phrases(self):
        w = WakeWordDetector(on_detect=lambda: None)
        status = w.status()
        self.assertIn(DEFAULT_PHRASE, status["phrases"])
        self.assertEqual(status["phrase"], DEFAULT_PHRASE)

    def test_configure_switches_phrase_while_off(self):
        w = WakeWordDetector(on_detect=lambda: None)
        w.configure(phrase="alexa")
        self.assertEqual(w.status()["phrase"], "alexa")
        self.assertEqual(w.status()["state"], STATE_OFF)

    def test_unknown_phrase_reports_error_instead_of_crashing(self):
        w = WakeWordDetector(on_detect=lambda: None, phrase="hey_bunny")
        w.start()
        deadline = time.time() + 5
        while w.status()["state"] not in (STATE_ERROR, STATE_LISTENING) and time.time() < deadline:
            time.sleep(0.05)
        status = w.status()
        self.assertEqual(status["state"], STATE_ERROR)
        self.assertTrue(status["error"])
        self.assertTrue(status["hotkey_fallback"])
        w.stop()

    def test_detection_invokes_callback(self):
        """A firing detector must start a listening session, not swallow it."""
        fired = []
        w = WakeWordDetector(on_detect=lambda: fired.append(True))
        w._fire()
        self.assertEqual(fired, [True])

    def test_bad_callback_does_not_kill_the_loop(self):
        def boom() -> None:
            raise RuntimeError("handler exploded")

        w = WakeWordDetector(on_detect=boom)
        w._fire()
        self.assertIn("handler exploded", w.status()["error"])


if __name__ == "__main__":
    unittest.main()
