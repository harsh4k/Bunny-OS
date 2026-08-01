"""Default chat model resolution against what Ollama actually has."""
from __future__ import annotations

import unittest

from chat_handler import DEFAULT_MODEL, installed_models, pick_default_model


def tags(*names: str) -> dict:
    return {"models": [{"name": n, "size": 1} for n in names]}


class TestPickDefaultModel(unittest.TestCase):
    def test_prefers_the_bundled_default_when_present(self):
        self.assertEqual(
            pick_default_model(tags("gemma3:4b", DEFAULT_MODEL)), DEFAULT_MODEL
        )

    def test_falls_back_to_a_known_family(self):
        """The real bug: the hardcoded default isn't pulled on this machine."""
        picked = pick_default_model(
            tags("friday:latest", "qwen3.5:4b", "rudo:latest", "gemma3:4b")
        )
        self.assertEqual(picked, "qwen3.5:4b")

    def test_skips_embedding_models(self):
        picked = pick_default_model(tags("nomic-embed-text:latest", "custom:latest"))
        self.assertEqual(picked, "custom:latest")

    def test_uses_any_chat_model_as_last_resort(self):
        self.assertEqual(pick_default_model(tags("friday:latest")), "friday:latest")

    def test_returns_none_when_nothing_usable_is_installed(self):
        self.assertIsNone(pick_default_model(tags()))
        self.assertIsNone(pick_default_model(tags("nomic-embed-text:latest")))

    def test_rejects_malformed_payloads(self):
        with self.assertRaises(ValueError):
            installed_models(["not", "a", "dict"])
        with self.assertRaises(ValueError):
            installed_models({"models": "nope"})

    def test_ignores_entries_without_a_name(self):
        payload = {"models": [{"size": 1}, {"name": "gemma3:4b", "size": 1}]}
        self.assertEqual(installed_models(payload), ["gemma3:4b"])


if __name__ == "__main__":
    unittest.main()
