"""
Tests for sidecar/chat_handler.py.

Coverage:
  - Model verification (_verify_model, _fetch_tags error paths)
  - Tool call validation (_validate_tool_calls)
  - Action building (_build_action) — each tool type + edge cases
  - Prompt-injection / adversarial corpus
  - handle_chat() with faked HTTP responses (fake Ollama streaming)
  - NDJSON streaming: text response, tool call response, error response
"""
from __future__ import annotations

import io
import json
import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).parent.parent))

from chat_handler import (
    MAX_APP_NAME_LEN,
    MAX_LINE_BYTES,
    MAX_LINES,
    MAX_QUERY_LEN,
    MAX_TOOL_ARG_LEN,
    _build_action,
    _parse_chunk,
    _validate_tool_calls,
    _verify_model,
    handle_chat,
)


# ── Fixtures ───────────────────────────────────────────────────────────────────

VALID_TAGS = {
    "models": [
        {"name": "llama3.2:1b-instruct-q4_K_M", "size": 800_000_000},
        {"name": "mistral:7b-instruct-q4_K_M", "size": 4_400_000_000},
    ]
}

EMPTY_TAGS = {"models": []}


def _ndjson_bytes(*objs: dict) -> bytes:
    return b"".join(json.dumps(o).encode() + b"\n" for o in objs)


def _make_fake_resp(status: int, body: bytes) -> MagicMock:
    """Build a fake HTTPResponse-like object."""
    resp = MagicMock()
    resp.status = status
    buf = io.BytesIO(body)
    resp.readline.side_effect = buf.readline
    resp.read.side_effect = buf.read
    return resp


def _make_conn(tags_resp: MagicMock, chat_resp: MagicMock) -> MagicMock:
    conn = MagicMock()
    conn.sock = MagicMock()
    conn.getresponse.side_effect = [tags_resp, chat_resp]
    return conn


# ── _verify_model ──────────────────────────────────────────────────────────────


class TestVerifyModel(unittest.TestCase):

    def test_present_model_passes(self):
        _verify_model("llama3.2:1b-instruct-q4_K_M", VALID_TAGS)  # no exception

    def test_absent_model_raises_with_available_list(self):
        with self.assertRaises(ValueError) as ctx:
            _verify_model("nonexistent:model", VALID_TAGS)
        msg = str(ctx.exception)
        self.assertIn("nonexistent:model", msg)
        self.assertIn("llama3.2", msg)
        self.assertIn("ollama pull", msg.lower())

    def test_empty_models_list_raises(self):
        with self.assertRaises(ValueError) as ctx:
            _verify_model("any:model", EMPTY_TAGS)
        self.assertIn("not found", str(ctx.exception))

    def test_malformed_tags_not_dict_raises(self):
        with self.assertRaises(ValueError):
            _verify_model("any:model", [])

    def test_tags_missing_models_key_raises(self):
        with self.assertRaises(ValueError):
            _verify_model("any:model", {})

    def test_model_name_in_available_set_case_sensitive(self):
        """Model names are case-sensitive in Ollama."""
        with self.assertRaises(ValueError):
            _verify_model("LLama3.2:1B-Instruct-Q4_K_M", VALID_TAGS)


# ── _validate_tool_calls ───────────────────────────────────────────────────────


class TestValidateToolCalls(unittest.TestCase):

    def _make_call(self, name: str, args: dict) -> list:
        return [{"function": {"name": name, "arguments": args}}]

    def test_valid_open_url(self):
        result = _validate_tool_calls(self._make_call("open_url", {"url": "https://example.com"}))
        self.assertEqual(result, {"action": "open_url", "url": "https://example.com"})

    def test_valid_open_app(self):
        result = _validate_tool_calls(self._make_call("open_app", {"app_name": "Notepad"}))
        self.assertEqual(result, {"action": "open_app", "app_name": "Notepad"})

    def test_valid_youtube_search(self):
        result = _validate_tool_calls(
            self._make_call("youtube_search", {"query": "python tutorials"})
        )
        self.assertEqual(result["action"], "youtube_search")
        self.assertEqual(result["query"], "python tutorials")

    def test_valid_show_system_summary(self):
        result = _validate_tool_calls(self._make_call("show_system_summary", {}))
        self.assertEqual(result, {"action": "show_system_summary"})

    def test_empty_list_rejected(self):
        with self.assertRaises(ValueError):
            _validate_tool_calls([])

    def test_multiple_calls_rejected(self):
        two = self._make_call("open_url", {"url": "https://a.com"}) + \
              self._make_call("open_url", {"url": "https://b.com"})
        with self.assertRaises(ValueError):
            _validate_tool_calls(two)

    def test_non_list_rejected(self):
        with self.assertRaises(ValueError):
            _validate_tool_calls("not-a-list")

    def test_call_not_dict_rejected(self):
        with self.assertRaises(ValueError):
            _validate_tool_calls(["not-a-dict"])

    def test_missing_function_key_rejected(self):
        with self.assertRaises(ValueError):
            _validate_tool_calls([{"no_function": {}}])

    def test_arguments_as_string_rejected(self):
        with self.assertRaises(ValueError):
            _validate_tool_calls(
                [{"function": {"name": "open_url", "arguments": '{"url":"https://x.com"}'}}]
            )


# ── _build_action — per-tool edge cases ───────────────────────────────────────


class TestBuildAction(unittest.TestCase):

    # open_app
    def test_open_app_valid(self):
        r = _build_action("open_app", {"app_name": "Notepad"})
        self.assertEqual(r["action"], "open_app")
        self.assertEqual(r["app_name"], "Notepad")

    def test_open_app_too_long_raises(self):
        with self.assertRaises(ValueError):
            _build_action("open_app", {"app_name": "A" * (MAX_APP_NAME_LEN + 1)})

    def test_open_app_empty_raises(self):
        with self.assertRaises(ValueError):
            _build_action("open_app", {"app_name": ""})

    def test_open_app_missing_key_raises(self):
        with self.assertRaises(ValueError):
            _build_action("open_app", {})

    def test_open_app_non_string_raises(self):
        with self.assertRaises(ValueError):
            _build_action("open_app", {"app_name": 42})

    # open_url
    def test_open_url_https_valid(self):
        r = _build_action("open_url", {"url": "https://example.com"})
        self.assertEqual(r["url"], "https://example.com")

    def test_open_url_http_rejected(self):
        with self.assertRaises(ValueError):
            _build_action("open_url", {"url": "http://example.com"})

    def test_open_url_file_rejected(self):
        with self.assertRaises(ValueError):
            _build_action("open_url", {"url": "file:///etc/passwd"})

    def test_open_url_javascript_rejected(self):
        with self.assertRaises(ValueError):
            _build_action("open_url", {"url": "javascript:alert(1)"})

    def test_open_url_ftp_rejected(self):
        with self.assertRaises(ValueError):
            _build_action("open_url", {"url": "ftp://files.example.com"})

    def test_open_url_too_long_raises(self):
        with self.assertRaises(ValueError):
            _build_action("open_url", {"url": "https://x.com/" + "a" * MAX_TOOL_ARG_LEN})

    # youtube_search
    def test_youtube_search_valid(self):
        r = _build_action("youtube_search", {"query": "cats"})
        self.assertEqual(r["action"], "youtube_search")
        self.assertEqual(r["query"], "cats")

    def test_youtube_search_too_long_raises(self):
        with self.assertRaises(ValueError):
            _build_action("youtube_search", {"query": "x" * (MAX_QUERY_LEN + 1)})

    def test_youtube_search_empty_raises(self):
        with self.assertRaises(ValueError):
            _build_action("youtube_search", {"query": ""})

    # show_system_summary
    def test_show_system_summary_no_args(self):
        r = _build_action("show_system_summary", {})
        self.assertEqual(r, {"action": "show_system_summary"})

    def test_show_system_summary_ignores_extra_args(self):
        r = _build_action("show_system_summary", {"extra": "ignored"})
        self.assertEqual(r, {"action": "show_system_summary"})


# ── Prompt-injection / adversarial corpus ──────────────────────────────────────


class TestPromptInjectionGuards(unittest.TestCase):

    def _call(self, name: str, args: dict | None = None) -> list:
        return [{"function": {"name": name, "arguments": args or {}}}]

    def test_unknown_tool_name_rejected(self):
        for bad in ["rm_rf", "exec", "eval", "shell", "system", "__import__",
                    "open_app\x00", "open_url\nopen_app"]:
            with self.assertRaises(ValueError, msg=f"should reject: {bad!r}"):
                _validate_tool_calls(self._call(bad, {}))

    def test_empty_tool_name_rejected(self):
        with self.assertRaises(ValueError):
            _validate_tool_calls(self._call("", {}))

    def test_null_as_tool_name_rejected(self):
        with self.assertRaises(ValueError):
            _validate_tool_calls([{"function": {"name": None, "arguments": {}}}])

    def test_missing_name_field_rejected(self):
        with self.assertRaises(ValueError):
            _validate_tool_calls([{"function": {"arguments": {}}}])

    def test_http_url_rejected(self):
        with self.assertRaises(ValueError):
            _build_action("open_url", {"url": "http://evil.com/steal"})

    def test_data_url_rejected(self):
        with self.assertRaises(ValueError):
            _build_action("open_url", {"url": "data:text/html,<script>alert(1)</script>"})

    def test_blob_url_rejected(self):
        with self.assertRaises(ValueError):
            _build_action("open_url", {"url": "blob:https://example.com/fake"})

    def test_url_with_credentials_rejected(self):
        with self.assertRaises(ValueError):
            _build_action("open_url", {"url": "https://user:pass@evil.com"})

    def test_newline_in_app_name_rejected(self):
        with self.assertRaises(ValueError):
            _build_action("open_app", {"app_name": "Notepad\n"})

    def test_path_separator_in_app_name_rejected(self):
        with self.assertRaises(ValueError):
            _build_action("open_app", {"app_name": "foo/bar"})

    def test_recursive_tool_calls_rejected_by_count(self):
        """Two tool calls in one turn must be rejected."""
        two_calls = (
            self._call("open_url", {"url": "https://a.com"})
            + self._call("open_url", {"url": "https://b.com"})
        )
        with self.assertRaises(ValueError):
            _validate_tool_calls(two_calls)


# ── _parse_chunk ───────────────────────────────────────────────────────────────


class TestParseChunk(unittest.TestCase):

    def test_valid_json_dict(self):
        data = json.dumps({"model": "x", "done": False}).encode()
        result = _parse_chunk(data)
        self.assertIsNotNone(result)
        self.assertFalse(result["done"])

    def test_non_json_returns_none(self):
        self.assertIsNone(_parse_chunk(b"not json at all"))

    def test_json_list_returns_none(self):
        self.assertIsNone(_parse_chunk(b"[]"))

    def test_empty_bytes_returns_none(self):
        self.assertIsNone(_parse_chunk(b""))


# ── handle_chat — integration with faked HTTP ──────────────────────────────────


class FakeHTTPResponse:
    """Minimal HTTPResponse-like object for streaming tests."""

    def __init__(self, status: int, lines: list[bytes]):
        self.status = status
        self._buf = io.BytesIO(b"".join(lines))

    def readline(self, size: int = -1) -> bytes:
        return self._buf.readline(size)

    def read(self, n: int = -1) -> bytes:
        return self._buf.read(n)


class FakeHTTPConnection:
    """HTTPConnection mock that returns pre-configured responses."""

    def __init__(self, tags_resp: FakeHTTPResponse, chat_resp: FakeHTTPResponse):
        self._responses = iter([tags_resp, chat_resp])
        self.sock = MagicMock()
        self.sock.settimeout = MagicMock()

    def connect(self): ...  # noqa: E704

    def request(self, *args, **kwargs): ...  # noqa: E704

    def getresponse(self) -> FakeHTTPResponse:
        return next(self._responses)

    def close(self): ...  # noqa: E704


def _run_handle_chat(msg_id: str, model: str, message: str, conn: FakeHTTPConnection, write_fn):
    with patch("chat_handler.http.client.HTTPConnection", return_value=conn), \
         patch("chat_worker.http.client.HTTPConnection", return_value=conn):
        handle_chat(msg_id, model, message, write_fn)


def _make_tags_resp(models: list[str]) -> FakeHTTPResponse:
    body = json.dumps({"models": [{"name": n} for n in models]}).encode()
    return FakeHTTPResponse(200, [body])


def _make_text_stream(text_chunks: list[str]) -> FakeHTTPResponse:
    """Build streaming NDJSON for a normal text response."""
    lines = []
    for chunk in text_chunks:
        obj = {"message": {"role": "assistant", "content": chunk}, "done": False}
        lines.append(json.dumps(obj).encode() + b"\n")
    final = {"message": {"role": "assistant", "content": ""}, "done": True}
    lines.append(json.dumps(final).encode() + b"\n")
    return FakeHTTPResponse(200, lines)


def _make_tool_stream(tool_name: str, args: dict) -> FakeHTTPResponse:
    """Build streaming NDJSON for a tool-call response."""
    lines = []
    final = {
        "message": {
            "role": "assistant",
            "content": "",
            "tool_calls": [{"function": {"name": tool_name, "arguments": args}}],
        },
        "done": True,
    }
    lines.append(json.dumps(final).encode() + b"\n")
    return FakeHTTPResponse(200, lines)


MODEL = "llama3.2:1b-instruct-q4_K_M"


class TestHandleChatTextResponse(unittest.TestCase):

    def _run(self, model: str, message: str) -> tuple[list, list]:
        """Returns (stream_events, other_events)."""
        events: list[dict] = []

        def write_fn(msg: dict) -> None:
            events.append(msg)

        tags = _make_tags_resp([model])
        chat = _make_text_stream(["Hello, ", "world!"])
        conn = FakeHTTPConnection(tags, chat)
        _run_handle_chat("req-1", model, message, conn, write_fn)

        streams = [e for e in events if e.get("type") == "stream"]
        other = [e for e in events if e.get("type") != "stream"]
        return streams, other

    def test_streams_text_chunks(self):
        streams, _ = self._run(MODEL, "hello")
        texts = [e["chunk"] for e in streams if e["chunk"]]
        self.assertEqual(texts, ["Hello, ", "world!"])

    def test_final_stream_has_finished_true(self):
        streams, _ = self._run(MODEL, "hello")
        self.assertTrue(streams[-1]["finished"])

    def test_response_has_respond_kind(self):
        _, other = self._run(MODEL, "hello")
        resp = next(e for e in other if e.get("type") == "response")
        result = json.loads(resp["result"])
        self.assertEqual(result["kind"], "respond")
        self.assertEqual(result["text"], "Hello, world!")

    def test_all_events_have_correct_id(self):
        streams, other = self._run(MODEL, "hello")
        for e in streams + other:
            self.assertEqual(e.get("id"), "req-1")


class TestHandleChatToolResponse(unittest.TestCase):

    def _run_tool(self, tool_name: str, args: dict) -> dict:
        events: list[dict] = []

        def write_fn(msg: dict) -> None:
            events.append(msg)

        tags = _make_tags_resp([MODEL])
        chat = _make_tool_stream(tool_name, args)
        conn = FakeHTTPConnection(tags, chat)
        _run_handle_chat("req-2", MODEL, "open google", conn, write_fn)

        return next((e for e in events if e.get("type") == "response"), {})

    def test_open_url_tool_call_returns_action_result(self):
        resp = self._run_tool("open_url", {"url": "https://google.com"})
        result = json.loads(resp["result"])
        self.assertEqual(result["kind"], "action")
        self.assertEqual(result["action"]["action"], "open_url")
        self.assertEqual(result["action"]["url"], "https://google.com")

    def test_open_app_tool_call_returns_action_result(self):
        resp = self._run_tool("open_app", {"app_name": "Notepad"})
        result = json.loads(resp["result"])
        self.assertEqual(result["kind"], "action")
        self.assertEqual(result["action"]["app_name"], "Notepad")

    def test_youtube_search_tool_call(self):
        resp = self._run_tool("youtube_search", {"query": "cute cats"})
        result = json.loads(resp["result"])
        self.assertEqual(result["action"]["query"], "cute cats")

    def test_show_system_summary_tool_call(self):
        resp = self._run_tool("show_system_summary", {})
        result = json.loads(resp["result"])
        self.assertEqual(result["kind"], "respond")
        self.assertTrue(result["text"])

    def test_get_local_time_tool_call_resolves_in_process(self):
        resp = self._run_tool("get_local_time", {})
        result = json.loads(resp["result"])
        self.assertEqual(result["kind"], "respond")
        self.assertIn("It's", result["text"])

    def test_youtube_play_tool_call_returns_action(self):
        resp = self._run_tool("youtube_play", {"query": "lofi"})
        result = json.loads(resp["result"])
        self.assertEqual(result["kind"], "action")
        self.assertEqual(result["action"]["action"], "youtube_play")

    def test_spotify_play_tool_call_returns_action(self):
        resp = self._run_tool("spotify_play", {"query": "chill"})
        result = json.loads(resp["result"])
        self.assertEqual(result["kind"], "action")
        self.assertEqual(result["action"]["action"], "spotify_play")


class TestHandleChatErrors(unittest.TestCase):

    def _collect(self, model: str, message: str,
                 tags_resp: FakeHTTPResponse,
                 chat_resp: FakeHTTPResponse | None = None) -> list[dict]:
        events: list[dict] = []

        def write_fn(msg: dict) -> None:
            events.append(msg)

        if chat_resp is None:
            chat_resp = _make_text_stream(["ok"])
        conn = FakeHTTPConnection(tags_resp, chat_resp)
        _run_handle_chat("req-err", model, message, conn, write_fn)

        return events

    def test_unknown_model_emits_error(self):
        tags = _make_tags_resp([MODEL])
        events = self._collect("unknown:model", "hi", tags)
        errors = [e for e in events if e.get("type") == "error"]
        self.assertEqual(len(errors), 1)
        self.assertIn("not found", errors[0]["error"])

    def test_empty_models_list_emits_error(self):
        tags = _make_tags_resp([])
        events = self._collect(MODEL, "hi", tags)
        errors = [e for e in events if e.get("type") == "error"]
        self.assertEqual(len(errors), 1)

    def test_ollama_api_error_in_stream_emits_error(self):
        tags = _make_tags_resp([MODEL])

        error_line = json.dumps({"error": "model file not found"}).encode() + b"\n"
        chat = FakeHTTPResponse(200, [error_line])
        events = self._collect(MODEL, "hi", tags, chat)
        errors = [e for e in events if e.get("type") == "error"]
        self.assertTrue(len(errors) >= 1)
        self.assertIn("model file not found", errors[0]["error"])

    def test_chat_http_error_emits_error(self):
        tags = _make_tags_resp([MODEL])
        chat = FakeHTTPResponse(503, [b"Service Unavailable"])
        events = self._collect(MODEL, "hi", tags, chat)
        errors = [e for e in events if e.get("type") == "error"]
        self.assertEqual(len(errors), 1)
        self.assertIn("503", errors[0]["error"])

    def test_invalid_tool_in_stream_emits_error(self):
        tags = _make_tags_resp([MODEL])
        chat = _make_tool_stream("evil_tool", {"cmd": "rm -rf /"})
        events = self._collect(MODEL, "delete everything", tags, chat)
        errors = [e for e in events if e.get("type") == "error"]
        self.assertTrue(len(errors) >= 1)
        self.assertIn("evil_tool", errors[0]["error"])


if __name__ == "__main__":
    unittest.main()
