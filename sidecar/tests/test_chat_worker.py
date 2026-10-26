"""Tests for ChatWorker: concurrency, cancel, and non-blocking start."""
from __future__ import annotations

import http.client
import io
import json
import threading
import time
import unittest
from unittest import mock

from chat_worker import ChatWorker, _resolve_tool_result, handle_chat_streaming
from ipc_types import error_msg


class _FakeResp:
    def __init__(self, lines: list[bytes], status: int = 200, delay: float = 0.0):
        self.status = status
        self._lines = list(lines)
        self._delay = delay
        self._idx = 0

    def readline(self, _limit: int = -1) -> bytes:
        if self._delay:
            time.sleep(self._delay)
        if self._idx >= len(self._lines):
            return b""
        line = self._lines[self._idx]
        self._idx += 1
        return line


class _FakeConn:
    def __init__(self, resp: _FakeResp):
        self._resp = resp
        self.sock = mock.Mock()
        self.closed = False

    def connect(self):
        return None

    def request(self, *_a, **_k):
        return None

    def getresponse(self):
        return self._resp

    def close(self):
        self.closed = True


class TestChatWorker(unittest.TestCase):
    def test_second_start_rejected_while_busy(self):
        barrier = threading.Event()
        messages: list[dict] = []

        def write_fn(msg: dict) -> None:
            messages.append(msg)

        worker = ChatWorker(write_fn=write_fn)

        def slow_handler(
            msg_id,
            model,
            message,
            write_fn,
            cancel_event,
            set_active_conn,
            system_prompt=None,
            confirm_links=False,
        ):
            barrier.wait(timeout=2)
            write_fn({"type": "response", "id": msg_id, "result": '{"kind":"respond","text":"ok"}'})

        with mock.patch("chat_worker.handle_chat_streaming", side_effect=slow_handler):
            self.assertTrue(worker.start("a", "model", "hi"))
            self.assertFalse(worker.start("b", "model", "bye"))
            barrier.set()
            # Wait for lock release
            deadline = time.time() + 2
            while worker.is_busy() and time.time() < deadline:
                time.sleep(0.01)
            self.assertFalse(worker.is_busy())

    def test_cancel_closes_connection_and_sends_error(self):
        messages: list[dict] = []
        conn_holder: dict[str, _FakeConn] = {}

        def write_fn(msg: dict) -> None:
            messages.append(msg)

        lines = [
            b'{"message":{"content":"hi"},"done":false}\n',
            b'{"message":{"content":"!","tool_calls":null},"done":true}\n',
        ]
        # Slow enough that cancel can interrupt between reads
        fake = _FakeConn(_FakeResp(lines, delay=0.05))

        def set_conn(conn):
            if conn is not None:
                conn_holder["c"] = fake

        with mock.patch("chat_worker.fetch_tags", return_value={"models": [{"name": "m"}]}), \
             mock.patch("chat_worker.http.client.HTTPConnection", return_value=fake):
            worker = ChatWorker(write_fn=write_fn)
            self.assertTrue(worker.start("req-1", "m", "hello"))
            # Give the thread a moment to register
            time.sleep(0.02)
            worker.cancel("req-1")
            deadline = time.time() + 2
            while worker.is_busy() and time.time() < deadline:
                time.sleep(0.01)

        self.assertTrue(any(m.get("type") == "error" for m in messages))
        self.assertTrue(any("cancel" in str(m.get("error", "")).lower() for m in messages))
        self.assertFalse(worker.is_busy())

    def test_cancel_wrong_id_is_noop(self):
        worker = ChatWorker(write_fn=lambda _m: None)
        # No active chat — wrong id must not raise
        worker.cancel("someone-else")

    def test_handle_chat_streaming_cancelled_before_start(self):
        messages: list[dict] = []
        ev = threading.Event()
        ev.set()
        handle_chat_streaming("id1", "m", "hi", messages.append, ev, lambda _: None)
        self.assertEqual(messages[0]["type"], "error")
        self.assertIn("cancel", messages[0]["error"].lower())

    def _run_stream(self, lines: list[bytes]) -> list[dict]:
        messages: list[dict] = []
        fake = _FakeConn(_FakeResp(lines))
        with mock.patch(
            "chat_worker.fetch_tags", return_value={"models": [{"name": "m"}]}
        ), mock.patch("chat_worker.http.client.HTTPConnection", return_value=fake):
            handle_chat_streaming(
                "req", "m", "hi", messages.append, threading.Event(), lambda _: None
            )
        return messages

    def test_thinking_tokens_excluded_from_spoken_answer(self):
        """Reasoning models stream a 'thinking' field — never speak or show it."""
        lines = [
            b'{"message":{"thinking":"I should reason first"},"done":false}\n',
            b'{"message":{"thinking":" about the clock"},"done":false}\n',
            b'{"message":{"content":"It is afternoon."},"done":false}\n',
            b'{"message":{"content":"","tool_calls":null},"done":true}\n',
        ]
        messages = self._run_stream(lines)
        terminal = next(m for m in messages if m["type"] == "response")
        body = json.loads(terminal["result"])
        self.assertEqual(body["kind"], "respond")
        self.assertEqual(body["text"], "It is afternoon.")
        self.assertNotIn("reason", body["text"].lower())
        streamed = "".join(
            m["chunk"] for m in messages if m["type"] == "stream" and m["chunk"]
        )
        self.assertEqual(streamed, "It is afternoon.")

    def test_reply_survives_old_200_line_cap(self):
        """Regression: reasoning models used to die at 200 NDJSON lines."""
        lines = [
            (
                b'{"message":{"thinking":"x"},"done":false}\n'
                if i < 250
                else b'{"message":{"content":"hi"},"done":false}\n'
            )
            for i in range(250)
        ]
        lines.append(b'{"message":{"content":"","tool_calls":null},"done":true}\n')
        messages = self._run_stream(lines)
        self.assertTrue(
            any(m.get("type") == "response" for m in messages),
            f"expected success, got {messages[-3:]}",
        )

    def test_oversized_reply_raises_bounded_error(self):
        from chat_handler import MAX_REPLY_CHARS

        # Many small tokens that together exceed the char budget (a single fat
        # line would trip MAX_LINE_BYTES first).
        piece = "a" * 100
        need = (MAX_REPLY_CHARS // len(piece)) + 2
        lines = [
            json.dumps({"message": {"content": piece}, "done": False}).encode() + b"\n"
            for _ in range(need)
        ]
        lines.append(b'{"message":{"content":"","tool_calls":null},"done":true}\n')
        messages = self._run_stream(lines)
        errors = [m for m in messages if m.get("type") == "error"]
        self.assertTrue(errors, messages)
        self.assertIn("Reply too long", errors[0]["error"])


class TestScreenContextLinkConfirm(unittest.TestCase):
    """Links the model picks after reading the screen need a user confirm."""

    URL_CALL = {"action": "open_url", "url": "https://example.com/x"}

    def test_open_url_goes_to_host_without_screen(self):
        self.assertEqual(
            _resolve_tool_result(dict(self.URL_CALL)),
            {"kind": "action", "action": self.URL_CALL},
        )

    def test_open_url_held_for_confirm_with_screen(self):
        events: list[dict] = []
        with mock.patch("local_actions.open_url_or_file") as open_fn:
            result = _resolve_tool_result(
                dict(self.URL_CALL), events.append, "m1", confirm_links=True
            )
            open_fn.assert_not_called()
        self.assertEqual(result["kind"], "respond")
        self.assertIn("example.com", result["text"])
        self.assertIn("browser_confirm_pending", events[0]["chunk"])

    def test_other_actions_unchanged_with_screen(self):
        call = {"action": "open_app", "app_name": "Notepad"}
        self.assertEqual(
            _resolve_tool_result(dict(call), confirm_links=True),
            {"kind": "action", "action": call},
        )

    def _run_worker(self, enriched_prompt: str) -> dict:
        memory = mock.Mock()
        memory.build_prompt_prefix.return_value = "BASE"
        seen: dict = {}

        def fake_handler(*args, **kwargs):
            seen.update(kwargs)

        worker = ChatWorker(write_fn=lambda _m: None, memory=memory)
        with mock.patch(
            "screen_context.enrich_prompt_with_screen",
            return_value=(enriched_prompt, None),
        ), mock.patch("chat_worker.handle_chat_streaming", side_effect=fake_handler):
            worker._lock.acquire()  # start() holds it before _run
            worker._run("m1", "model", "what is on my screen")
        return seen

    def test_worker_requests_confirm_when_screen_added(self):
        self.assertTrue(self._run_worker("BASE\n\n[screen] text")["confirm_links"])

    def test_worker_no_confirm_without_screen(self):
        self.assertFalse(self._run_worker("BASE")["confirm_links"])


if __name__ == "__main__":
    unittest.main()
