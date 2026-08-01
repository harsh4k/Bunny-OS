"""
Tests for sidecar/pull_worker.py.

Covers:
  - Concurrent pull rejection (second start() returns False)
  - IPC responsiveness: start() is non-blocking; caller returns immediately
  - HTTP success: "status":"success" line → response_msg sent
  - HTTP error payload: {"error":"..."} → error_msg sent
  - Per-line size limit: line > 4 KB → error_msg sent
  - Total line cap: > MAX_PULL_LINES → error_msg sent
  - Cancel signal stops streaming loop
"""
import json
import sys
import threading
import time
import unittest
import urllib.error
from io import BytesIO
from pathlib import Path
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).parent.parent))

from pull_worker import PullWorker, MAX_LINE_BYTES, MAX_PULL_LINES


MODEL = "llama3.2:1b-instruct-q4_K_M"


def _make_worker():
    messages: list[dict] = []
    worker = PullWorker(write_fn=messages.append)
    return worker, messages


def _streaming_resp(lines: list[bytes]):
    """Build a mock urlopen context manager yielding the given byte lines."""
    mock_resp = MagicMock()
    mock_resp.__enter__ = MagicMock(return_value=mock_resp)
    mock_resp.__exit__ = MagicMock(return_value=False)
    mock_resp.__iter__ = MagicMock(return_value=iter(lines))
    return mock_resp


# ── Concurrent rejection ───────────────────────────────────────────────────────

class TestConcurrentPullRejection(unittest.TestCase):

    def test_second_start_rejected_when_lock_held(self):
        worker, _ = _make_worker()
        # Manually hold the lock to simulate a running pull
        acquired = worker._lock.acquire(blocking=False)
        self.assertTrue(acquired)
        try:
            result = worker.start("req-2", MODEL)
            self.assertFalse(result)
        finally:
            worker._lock.release()

    def test_start_succeeds_after_lock_released(self):
        worker, messages = _make_worker()
        # Hold lock, verify rejection, release, verify acceptance
        worker._lock.acquire(blocking=False)
        self.assertFalse(worker.start("req-a", MODEL))
        worker._lock.release()

        success_line = json.dumps({"status": "success"}).encode() + b"\n"
        resp = _streaming_resp([success_line])
        with patch("urllib.request.urlopen", return_value=resp):
            accepted = worker.start("req-b", MODEL)
        self.assertTrue(accepted)


# ── IPC responsiveness ─────────────────────────────────────────────────────────

class TestIpcResponsiveness(unittest.TestCase):

    def test_start_returns_immediately(self):
        """start() must not block — actual pull runs on a daemon thread."""
        worker, _ = _make_worker()
        gate = threading.Event()

        def slow_urlopen(*args, **kwargs):
            gate.wait()  # block until test releases
            raise urllib.error.URLError("cancelled")

        with patch("urllib.request.urlopen", side_effect=slow_urlopen):
            t0 = time.monotonic()
            started = worker.start("req-1", MODEL)
            elapsed = time.monotonic() - t0

        self.assertTrue(started)
        self.assertLess(elapsed, 0.1, f"start() blocked for {elapsed:.3f}s")
        gate.set()  # release the background thread

    def test_is_busy_reflects_running_state(self):
        worker, _ = _make_worker()
        self.assertFalse(worker.is_busy())
        worker._lock.acquire(blocking=False)
        self.assertTrue(worker.is_busy())
        worker._lock.release()
        self.assertFalse(worker.is_busy())


# ── HTTP streaming ─────────────────────────────────────────────────────────────

class TestPullHttpStreaming(unittest.TestCase):

    def _wait_for_message(self, messages: list, timeout: float = 2.0) -> dict | None:
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            if messages:
                return messages[0]
            time.sleep(0.01)
        return None

    def test_success_status_sends_response(self):
        worker, messages = _make_worker()
        lines = [
            b'{"status":"pulling manifest"}\n',
            b'{"status":"success"}\n',
        ]
        with patch("urllib.request.urlopen", return_value=_streaming_resp(lines)):
            worker.start("req-1", MODEL)
        msg = self._wait_for_message(messages)
        self.assertIsNotNone(msg)
        self.assertEqual(msg.get("type"), "response")
        self.assertIn("pulled", msg.get("result", ""))

    def test_error_payload_sends_error(self):
        worker, messages = _make_worker()
        lines = [b'{"error":"pull model manifest: file does not exist"}\n']
        with patch("urllib.request.urlopen", return_value=_streaming_resp(lines)):
            worker.start("req-2", MODEL)
        msg = self._wait_for_message(messages)
        self.assertIsNotNone(msg)
        self.assertEqual(msg.get("type"), "error")
        self.assertIn("file does not exist", msg.get("error", ""))

    def test_oversized_line_sends_error(self):
        worker, messages = _make_worker()
        big_line = b"x" * (MAX_LINE_BYTES + 1)
        with patch("urllib.request.urlopen", return_value=_streaming_resp([big_line])):
            worker.start("req-3", MODEL)
        msg = self._wait_for_message(messages)
        self.assertIsNotNone(msg)
        self.assertEqual(msg.get("type"), "error")
        self.assertIn("4 KB", msg.get("error", ""))

    def test_too_many_lines_sends_error(self):
        worker, messages = _make_worker()
        # One more line than allowed
        lines = [b'{"status":"pulling"}\n'] * (MAX_PULL_LINES + 1)
        with patch("urllib.request.urlopen", return_value=_streaming_resp(lines)):
            worker.start("req-4", MODEL)
        msg = self._wait_for_message(messages, timeout=5.0)
        self.assertIsNotNone(msg)
        self.assertEqual(msg.get("type"), "error")

    def test_url_error_sends_error(self):
        worker, messages = _make_worker()
        with patch("urllib.request.urlopen",
                   side_effect=urllib.error.URLError("connection refused")):
            worker.start("req-5", MODEL)
        msg = self._wait_for_message(messages)
        self.assertIsNotNone(msg)
        self.assertEqual(msg.get("type"), "error")
        self.assertIn("ollama", msg.get("error", "").lower())


# ── Cancel ─────────────────────────────────────────────────────────────────────

class TestPullCancel(unittest.TestCase):

    def test_cancel_sends_error_and_releases_lock(self):
        worker, messages = _make_worker()
        gate = threading.Event()
        proceed = threading.Event()

        def line_iter():
            gate.set()           # signal that iteration started
            proceed.wait()       # wait for cancel signal
            yield b'{"status":"pulling"}\n'

        mock_resp = MagicMock()
        mock_resp.__enter__ = MagicMock(return_value=mock_resp)
        mock_resp.__exit__ = MagicMock(return_value=False)
        mock_resp.__iter__ = MagicMock(side_effect=line_iter)

        with patch("urllib.request.urlopen", return_value=mock_resp):
            worker.start("req-cancel", MODEL)
            gate.wait(timeout=2.0)
            worker.cancel()
            proceed.set()

        # Wait for the thread to finish
        deadline = time.monotonic() + 3.0
        while worker.is_busy() and time.monotonic() < deadline:
            time.sleep(0.05)

        self.assertFalse(worker.is_busy(), "Lock should be released after cancel")
        # Cancel must also have sent an error message to the client
        self.assertEqual(len(messages), 1, "Expected exactly one error message after cancel")
        self.assertEqual(messages[0].get("type"), "error")
        self.assertIn("cancel", messages[0].get("error", "").lower())


if __name__ == "__main__":
    unittest.main()
