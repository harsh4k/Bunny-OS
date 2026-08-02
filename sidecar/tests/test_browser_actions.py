"""Browser tools + confirm queue tests."""
from __future__ import annotations

import unittest
from unittest.mock import patch

import browser_actions


class TestBrowserActions(unittest.TestCase):
    def setUp(self) -> None:
        with browser_actions._lock:
            browser_actions._pending.clear()

    def test_scroll_runs_without_confirm(self) -> None:
        with patch("browser_actions.browser_scroll") as scroll:
            out = browser_actions.handle_browser_action(
                {"action": "browser_scroll", "direction": "down", "steps": 2}
            )
            scroll.assert_called_once_with("down", 2)
            self.assertIn("down", out.lower())

    def test_type_queues_and_needs_confirm(self) -> None:
        events: list[dict] = []

        def write(msg: dict) -> None:
            events.append(msg)

        with patch("browser_actions.browser_type_text") as type_fn:
            out = browser_actions.handle_browser_action(
                {"action": "browser_type", "text": "hello"},
                write_fn=write,
                msg_id="m1",
            )
            type_fn.assert_not_called()
            self.assertIn("confirm", out.lower())
            self.assertEqual(len(events), 1)
            chunk = events[0]["chunk"]
            self.assertIn("browser_confirm_pending", chunk)
            pending_id = __import__("json").loads(chunk)["pending_id"]
            result = browser_actions.confirm(pending_id)
            self.assertTrue(result["ok"])
            type_fn.assert_called_once_with("hello")

    def test_cancel_does_not_execute(self) -> None:
        with patch("browser_actions.browser_type_text") as type_fn:
            browser_actions.handle_browser_action(
                {"action": "browser_type", "text": "nope"}
            )
            pending = browser_actions.pending_snapshot()
            self.assertEqual(len(pending), 1)
            cancelled = browser_actions.cancel(pending[0]["pending_id"])
            self.assertTrue(cancelled["ok"])
            type_fn.assert_not_called()
            again = browser_actions.confirm(pending[0]["pending_id"])
            self.assertFalse(again["ok"])

    def test_focus_search_immediate(self) -> None:
        with patch("browser_actions.browser_focus_search") as focus:
            out = browser_actions.handle_browser_action(
                {"action": "browser_focus_search"}
            )
            focus.assert_called_once()
            self.assertIn("address", out.lower())

    def test_click_role_confirm_then_execute(self) -> None:
        with patch("browser_actions.browser_click_role") as click:
            browser_actions.handle_browser_action(
                {
                    "action": "browser_click_role",
                    "role": "button",
                    "name": "Submit",
                }
            )
            click.assert_not_called()
            pid = browser_actions.pending_snapshot()[0]["pending_id"]
            result = browser_actions.confirm(pid)
            self.assertTrue(result["ok"])
            click.assert_called_once_with("button", "Submit")


if __name__ == "__main__":
    unittest.main()
