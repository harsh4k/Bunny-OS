"""
Tests for sidecar/ollama_client.py.

Covers:
  - /api/tags valid + invalid shapes
  - /api/ps valid + invalid shapes
  - 1 MiB response cap enforcement
  - Ollama unreachable → graceful degraded status
"""
import json
import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).parent.parent))

import ollama_client
from ollama_client import (
    _parse_tags_response,
    _parse_ps_response,
    get_ollama_status,
    MAX_RESPONSE_BYTES,
    OllamaModel,
)


# ── Fixtures ───────────────────────────────────────────────────────────────────

VALID_TAGS = {
    "models": [
        {
            "name": "llama3.2:1b-instruct-q4_K_M",
            "size": 800_000_000,
            "details": {"quantization_level": "Q4_K_M"},
        },
        {
            "name": "mistral:7b-instruct-q4_K_M",
            "size": 4_400_000_000,
            "details": {"quantization_level": "Q4_K_M"},
        },
    ]
}

VALID_PS = {
    "models": [{"name": "llama3.2:1b-instruct-q4_K_M"}]
}


# ── /api/tags parsing ──────────────────────────────────────────────────────────

class TestOllamaTagsParsing(unittest.TestCase):

    def test_valid_tags_parsed(self):
        models = _parse_tags_response(VALID_TAGS)
        self.assertEqual(len(models), 2)
        self.assertEqual(models[0].name, "llama3.2:1b-instruct-q4_K_M")
        self.assertAlmostEqual(models[0].size_gb, 0.74, places=1)
        self.assertEqual(models[0].quantization, "Q4_K_M")

    def test_no_details_quantization_is_none(self):
        data = {"models": [{"name": "some:model", "size": 1_000_000_000}]}
        models = _parse_tags_response(data)
        self.assertEqual(len(models), 1)
        self.assertIsNone(models[0].quantization)

    def test_not_dict_raises(self):
        with self.assertRaises(ValueError):
            _parse_tags_response([])

    def test_missing_models_key_raises(self):
        with self.assertRaises(ValueError):
            _parse_tags_response({})

    def test_models_not_list_raises(self):
        with self.assertRaises(ValueError):
            _parse_tags_response({"models": "bad"})

    def test_item_missing_size_skipped(self):
        data = {"models": [{"name": "x:y"}, {"name": "a:b", "size": 1_000}]}
        models = _parse_tags_response(data)
        self.assertEqual(len(models), 1)
        self.assertEqual(models[0].name, "a:b")

    def test_limited_to_100_models(self):
        data = {"models": [{"name": f"m:{i}", "size": 1_000} for i in range(200)]}
        models = _parse_tags_response(data)
        self.assertEqual(len(models), 100)


# ── /api/ps parsing ────────────────────────────────────────────────────────────

class TestOllamaPsParsing(unittest.TestCase):

    def test_valid_ps_parsed(self):
        running = _parse_ps_response(VALID_PS)
        self.assertEqual(running, ["llama3.2:1b-instruct-q4_K_M"])

    def test_not_dict_raises(self):
        with self.assertRaises(ValueError):
            _parse_ps_response("bad")

    def test_missing_models_returns_empty(self):
        self.assertEqual(_parse_ps_response({}), [])

    def test_item_without_name_skipped(self):
        data = {"models": [{"no_name": True}, {"name": "ok:model"}]}
        result = _parse_ps_response(data)
        self.assertEqual(result, ["ok:model"])


# ── Response size cap ──────────────────────────────────────────────────────────

class TestResponseCap(unittest.TestCase):

    def test_oversized_response_raises(self):
        oversized = b"x" * (MAX_RESPONSE_BYTES + 1)
        mock_resp = MagicMock()
        mock_resp.__enter__ = MagicMock(return_value=mock_resp)
        mock_resp.__exit__ = MagicMock(return_value=False)
        mock_resp.read = MagicMock(return_value=oversized)
        with patch("urllib.request.urlopen", return_value=mock_resp):
            with self.assertRaises(ValueError):
                ollama_client._fetch_json("http://127.0.0.1:11434/api/tags")


# ── Unreachable Ollama ─────────────────────────────────────────────────────────

class TestOllamaUnreachable(unittest.TestCase):

    def test_unreachable_returns_degraded_status(self):
        with patch("ollama_client._fetch_ollama_models", return_value=None):
            status = get_ollama_status()
        self.assertFalse(status.reachable)
        self.assertEqual(status.models, [])
        self.assertEqual(status.running, [])


if __name__ == "__main__":
    unittest.main()
