"""
Tests for the sidecar framed-JSON IPC protocol.
All frame round-trip tests call the PRODUCTION write_frame / read_frame
functions from protocol.py (not inline struct.pack).
Mirrors the Rust tests in src-tauri/src/protocol.rs.
"""
import io
import json
import struct
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from protocol import (
    write_frame,
    read_frame,
    send_message,
    recv_message,
    MAX_FRAME_BYTES,
)
from ipc_types import (
    parse_host_message,
    ready_msg,
    response_msg,
    error_msg,
    stream_msg,
    ActionMessage,
    ShutdownMessage,
    ALLOWED_ACTIONS,
    VERSION,
)


# ── Test infrastructure ───────────────────────────────────────────────────────

class CaptureStdout:
    """Redirect sys.stdout to a BytesIO buffer for the duration of the block."""

    def __init__(self) -> None:
        self.buf = io.BytesIO()
        self._orig: object = None

    def __enter__(self) -> "CaptureStdout":
        self._orig = sys.stdout
        sys.stdout = _FakeStdout(self.buf)  # type: ignore[assignment]
        return self

    def __exit__(self, *_: object) -> None:
        sys.stdout = self._orig  # type: ignore[assignment]

    def getvalue(self) -> bytes:
        return self.buf.getvalue()


class _FakeStdout:
    def __init__(self, buf: io.BytesIO) -> None:
        self.buffer = _FlushableBuf(buf)


class _FlushableBuf:
    def __init__(self, buf: io.BytesIO) -> None:
        self._buf = buf

    def write(self, data: bytes) -> int:
        return self._buf.write(data)

    def flush(self) -> None:
        pass


class FeedStdin:
    """Inject bytes into sys.stdin for the duration of the block."""

    def __init__(self, data: bytes) -> None:
        self._data = data
        self._orig: object = None

    def __enter__(self) -> "FeedStdin":
        self._orig = sys.stdin
        sys.stdin = _FakeStdin(io.BytesIO(self._data))  # type: ignore[assignment]
        return self

    def __exit__(self, *_: object) -> None:
        sys.stdin = self._orig  # type: ignore[assignment]


class _FakeStdin:
    def __init__(self, buf: io.BytesIO) -> None:
        self.buffer = buf


# ── Frame round-trip tests (use production functions) ─────────────────────────

class TestFrameRoundtrip(unittest.TestCase):

    def _roundtrip(self, payload: bytes) -> bytes:
        """Write via production write_frame, read back via production read_frame."""
        with CaptureStdout() as cap:
            write_frame(payload)
        with FeedStdin(cap.getvalue()):
            return read_frame()

    def test_empty_payload(self) -> None:
        self.assertEqual(self._roundtrip(b""), b"")

    def test_json_payload(self) -> None:
        payload = json.dumps({"type": "ready", "version": "0.1.0"}).encode()
        result = self._roundtrip(payload)
        self.assertEqual(json.loads(result), {"type": "ready", "version": "0.1.0"})

    def test_header_is_little_endian(self) -> None:
        payload = b"hello"
        with CaptureStdout() as cap:
            write_frame(payload)
        raw = cap.getvalue()
        (length_le,) = struct.unpack("<I", raw[:4])
        self.assertEqual(length_le, len(payload))

    def test_multiple_frames_sequential(self) -> None:
        frames = [b"alpha", b"beta", b"gamma"]
        with CaptureStdout() as cap:
            for f in frames:
                write_frame(f)
        with FeedStdin(cap.getvalue()):
            for expected in frames:
                self.assertEqual(read_frame(), expected)

    def test_send_then_recv(self) -> None:
        msg = {"type": "shutdown"}
        with CaptureStdout() as cap:
            send_message(msg)
        with FeedStdin(cap.getvalue()):
            self.assertEqual(recv_message(), msg)

    def test_oversized_outgoing_rejected(self) -> None:
        """write_frame must refuse payloads larger than MAX_FRAME_BYTES."""
        oversized = b"x" * (MAX_FRAME_BYTES + 1)
        with self.assertRaises(ValueError):
            with CaptureStdout():
                write_frame(oversized)

    def test_oversized_incoming_rejected(self) -> None:
        """read_frame must refuse an incoming length > MAX_FRAME_BYTES."""
        fake_header = struct.pack("<I", MAX_FRAME_BYTES + 1)
        with FeedStdin(fake_header):
            with self.assertRaises(ValueError):
                read_frame()

    def test_max_frame_size_constant(self) -> None:
        self.assertGreater(MAX_FRAME_BYTES, 0)
        self.assertLessEqual(MAX_FRAME_BYTES, 16 * 1024 * 1024)


# ── IPC type / schema tests ───────────────────────────────────────────────────

class TestIpcTypes(unittest.TestCase):

    def test_ready_msg_shape(self) -> None:
        msg = ready_msg()
        self.assertEqual(msg["type"], "ready")
        self.assertEqual(msg["version"], VERSION)

    def test_response_msg_shape(self) -> None:
        msg = response_msg("abc", "done")
        self.assertEqual(msg["type"], "response")
        self.assertEqual(msg["id"], "abc")
        self.assertEqual(msg["result"], "done")

    def test_error_msg_shape(self) -> None:
        msg = error_msg("x1", "something went wrong")
        self.assertEqual(msg["type"], "error")
        self.assertEqual(msg["error"], "something went wrong")

    def test_stream_msg_shape(self) -> None:
        msg = stream_msg("s1", "chunk", False)
        self.assertEqual(msg["type"], "stream")
        self.assertIs(msg["finished"], False)

    def test_parse_action_message(self) -> None:
        raw = {"type": "action", "id": "id-1", "payload": {"action": "show_system_summary"}}
        msg = parse_host_message(raw)
        self.assertIsInstance(msg, ActionMessage)
        self.assertEqual(msg.id, "id-1")

    def test_parse_shutdown_message(self) -> None:
        msg = parse_host_message({"type": "shutdown"})
        self.assertIsInstance(msg, ShutdownMessage)

    def test_rejects_unknown_action(self) -> None:
        raw = {"type": "action", "id": "id-2", "payload": {"action": "rm_rf"}}
        with self.assertRaises(ValueError):
            parse_host_message(raw)

    def test_rejects_unknown_type(self) -> None:
        with self.assertRaises(ValueError):
            parse_host_message({"type": "malicious_event"})

    def test_allowlist_contents(self) -> None:
        required = {
            "open_app", "open_url", "youtube_search", "youtube_play",
            "spotify_open", "spotify_search", "spotify_play",
            "media_play", "media_next", "media_prev",
            "show_system_summary", "respond",
            "get_inventory", "get_advisor", "pull_model",
            "chat", "cancel_chat",
            "start_listen", "stop_listen", "cancel_voice", "set_mute",
            "wake_status", "wake_start", "wake_stop", "wake_configure",
            "memory_status", "memory_list", "memory_add", "memory_delete",
            "memory_clear", "memory_clear_session", "memory_set_enabled", "memory_export",
        }
        self.assertTrue(required.issubset(ALLOWED_ACTIONS))

    def test_action_requires_id(self) -> None:
        with self.assertRaises(ValueError):
            parse_host_message({"type": "action", "payload": {"action": "respond", "input": "hi"}})


if __name__ == "__main__":
    unittest.main()
