"""Ollama endpoint resolution."""
from __future__ import annotations

import os
import unittest
from unittest import mock

import ollama_config


class TestOllamaConfig(unittest.TestCase):
    def test_defaults_to_localhost(self):
        with mock.patch.dict(os.environ, {}, clear=True):
            self.assertEqual(ollama_config.host(), "127.0.0.1")
            self.assertEqual(ollama_config.port(), 11434)
            self.assertEqual(ollama_config.base_url(), "http://127.0.0.1:11434")

    def test_env_override(self):
        env = {"BUNNY_OLLAMA_HOST": "localhost", "BUNNY_OLLAMA_PORT": "9999"}
        with mock.patch.dict(os.environ, env, clear=True):
            self.assertEqual(ollama_config.base_url(), "http://localhost:9999")

    def test_blank_and_garbage_fall_back(self):
        env = {"BUNNY_OLLAMA_HOST": "   ", "BUNNY_OLLAMA_PORT": "not-a-port"}
        with mock.patch.dict(os.environ, env, clear=True):
            self.assertEqual(ollama_config.host(), "127.0.0.1")
            self.assertEqual(ollama_config.port(), 11434)

    def test_out_of_range_port_falls_back(self):
        for raw in ("0", "-1", "70000"):
            with mock.patch.dict(os.environ, {"BUNNY_OLLAMA_PORT": raw}, clear=True):
                self.assertEqual(ollama_config.port(), 11434, raw)


if __name__ == "__main__":
    unittest.main()
