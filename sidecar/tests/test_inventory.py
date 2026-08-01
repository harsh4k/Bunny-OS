"""
Integration tests for sidecar/inventory.py.

Unit tests for subsystems live in:
  - test_hw_probe.py   (OS/CPU/RAM/GPU detection)
  - test_ollama_client.py (/api/tags, /api/ps parsing, response cap)
  - test_app_catalog.py   (Start Menu + registry scanning)

This file tests only the public get_inventory() facade and its JSON
serialisability.
"""
import contextlib
import json
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parent.parent))

import hw_probe
from inventory import get_inventory


# ── Shared helpers ─────────────────────────────────────────────────────────────

def _patch_all(*, gpu_tuple=(None, hw_probe._SMI_DISCLOSURE), ram_gb=8.0):
    """Return a context manager that patches all subsystem helpers."""
    patches = [
        patch("hw_probe._get_os_string", return_value="Windows 10 22H2"),
        patch("hw_probe._get_cpu_name", return_value="Intel Core i5"),
        patch("hw_probe._get_ram_gb", return_value=ram_gb),
        patch("hw_probe._get_gpu", return_value=gpu_tuple),
        patch("hw_probe._has_audio_input", return_value=False),
        patch("ollama_client._fetch_ollama_models", return_value=None),
        patch("ollama_client._fetch_ollama_running", return_value=[]),
        patch("app_catalog._scan_start_menu", return_value=["Notepad"]),
        patch("app_catalog._scan_registry_uninstall", return_value=[]),
    ]

    @contextlib.contextmanager
    def _cm():
        with contextlib.ExitStack() as stack:
            for p in patches:
                stack.enter_context(p)
            yield

    return _cm()


# ── Integration ────────────────────────────────────────────────────────────────

class TestGetInventory(unittest.TestCase):

    def test_inventory_is_json_serialisable(self):
        with _patch_all():
            inv = get_inventory()

        encoded = json.dumps(inv)
        decoded = json.loads(encoded)
        self.assertIn("hardware", decoded)
        self.assertIn("ollama", decoded)
        self.assertIn("apps", decoded)
        self.assertIsNone(decoded["hardware"]["gpu"])
        self.assertIn("gpu_note", decoded["hardware"])
        self.assertTrue(len(decoded["hardware"]["gpu_note"]) > 0)

    def test_inventory_apps_present(self):
        with _patch_all():
            inv = get_inventory()
        self.assertEqual(len(inv["apps"]), 1)
        self.assertEqual(inv["apps"][0]["name"], "Notepad")


if __name__ == "__main__":
    unittest.main()
