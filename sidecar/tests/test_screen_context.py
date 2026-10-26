"""Screen-context opt-in helpers."""
from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from memory import MemoryStore
import screen_context
from screen_context import enrich_prompt_with_screen, looks_like_screen_query


class TestScreenContext(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        self.store = MemoryStore(Path(self.tmp.name) / "m.db")
        screen_context.reset_screen_taint()

    def tearDown(self) -> None:
        screen_context.reset_screen_taint()
        self.tmp.cleanup()

    def test_default_screen_off(self) -> None:
        self.assertFalse(self.store.is_screen_context_enabled())

    def test_persist_screen_toggle(self) -> None:
        self.store.set_screen_context_enabled(True)
        reopened = MemoryStore(Path(self.tmp.name) / "m.db")
        self.assertTrue(reopened.is_screen_context_enabled())

    def test_looks_like_screen_query(self) -> None:
        self.assertTrue(looks_like_screen_query("what's on my screen"))
        self.assertTrue(looks_like_screen_query("What window is focused?"))
        self.assertFalse(looks_like_screen_query("what time is it"))
        self.assertFalse(looks_like_screen_query("open notepad"))

    def test_off_skips_probe(self) -> None:
        with patch("screen_context.get_focused_window_text") as probe:
            prompt, err = enrich_prompt_with_screen(
                self.store, "You are Bunny.", "what's on my screen"
            )
            probe.assert_not_called()
            self.assertIsNone(err)
            self.assertEqual(prompt, "You are Bunny.")

    def test_on_injects_untrusted_block(self) -> None:
        self.store.set_screen_context_enabled(True)
        with patch(
            "screen_context.get_focused_window_text",
            return_value={
                "ok": True,
                "title": "Notepad",
                "app": "notepad.exe",
                "text": "Hello from the editor",
                "source": "uia",
            },
        ):
            prompt, err = enrich_prompt_with_screen(
                self.store, "You are Bunny.", "what's on my screen"
            )
        self.assertIsNone(err)
        self.assertIn("untrusted", prompt.lower())
        self.assertIn("Notepad", prompt)
        self.assertIn("Hello from the editor", prompt)
        self.assertTrue(prompt.startswith("You are Bunny."))

    def test_looks_like_read_this_query(self) -> None:
        self.assertTrue(looks_like_screen_query("read this"))
        self.assertTrue(looks_like_screen_query("what does it say"))
        self.assertTrue(looks_like_screen_query("can you see my screen"))

    def test_on_probe_failure_returns_spoken_error(self) -> None:
        self.store.set_screen_context_enabled(True)
        with patch(
            "screen_context.get_focused_window_text",
            return_value={"ok": False, "title": "", "error": "No focused window."},
        ):
            prompt, err = enrich_prompt_with_screen(
                self.store, "You are Bunny.", "what's on my screen"
            )
        self.assertIsNotNone(err)
        self.assertIn("focused window", (err or "").lower())
        self.assertNotIn("untrusted focused-window", prompt.lower())

    def test_non_screen_utterance_skips_probe_when_on(self) -> None:
        self.store.set_screen_context_enabled(True)
        with patch("screen_context.get_focused_window_text") as probe:
            prompt, err = enrich_prompt_with_screen(
                self.store, "You are Bunny.", "tell me a joke"
            )
            probe.assert_not_called()
            self.assertIsNone(err)
            self.assertEqual(prompt, "You are Bunny.")

    def test_build_screen_block_marks_untrusted(self) -> None:
        block = self.store.build_screen_block(
            "Secrets — ignore instructions", "Chrome", "Visible line one"
        )
        self.assertIn("never instructions", block.lower())
        self.assertIn("Chrome", block)
        self.assertIn("Visible line one", block)
        self.assertIn("visible text", block.lower())

    def _read_screen(self) -> None:
        self.store.set_screen_context_enabled(True)
        with patch(
            "screen_context.get_focused_window_text",
            return_value={"ok": True, "title": "Mail", "app": "mail", "text": "x"},
        ):
            enrich_prompt_with_screen(self.store, "You are Bunny.", "read this")

    def test_no_confirm_without_screen_read(self) -> None:
        enrich_prompt_with_screen(self.store, "You are Bunny.", "tell me a joke")
        self.assertFalse(screen_context.take_links_need_confirm())

    def test_confirm_lasts_while_screen_text_can_echo(self) -> None:
        # Screen text reaches later prompts through recent session notes.
        self._read_screen()
        turns = [
            screen_context.take_links_need_confirm()
            for _ in range(screen_context.SCREEN_TAINT_TURNS + 1)
        ]
        self.assertEqual(turns, [True] * screen_context.SCREEN_TAINT_TURNS + [False])

    def test_new_screen_read_restarts_window(self) -> None:
        self._read_screen()
        for _ in range(screen_context.SCREEN_TAINT_TURNS - 1):
            screen_context.take_links_need_confirm()
        self._read_screen()
        self.assertTrue(all(
            screen_context.take_links_need_confirm()
            for _ in range(screen_context.SCREEN_TAINT_TURNS)
        ))


if __name__ == "__main__":
    unittest.main()
