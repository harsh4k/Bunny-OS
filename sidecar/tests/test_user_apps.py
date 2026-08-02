"""Tests for persisted user apps helpers."""
from __future__ import annotations

import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import user_apps


class UserAppsTests(unittest.TestCase):
    def test_resolve_custom_path(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            apps_path = Path(tmp) / "user_apps.json"
            fake = Path(tmp) / ("Demo.lnk" if os.name == "nt" else "Demo.app")
            if os.name == "nt":
                fake.write_bytes(b"")
            else:
                fake.mkdir()
            apps_path.write_text(
                json.dumps(
                    {
                        "aliases": {"demo": "demo app"},
                        "custom": [
                            {"id": "1", "name": "Demo App", "path": str(fake)}
                        ],
                        "scanned": [],
                    }
                ),
                encoding="utf-8",
            )
            with mock.patch("user_apps.user_apps_path", return_value=apps_path):
                self.assertEqual(user_apps.resolve_user_path("Demo App"), str(fake))
                self.assertEqual(user_apps.apply_user_alias("demo"), "demo app")

    def test_rejects_cmd(self) -> None:
        if os.name != "nt":
            self.skipTest("Windows-only")
        with self.assertRaises(ValueError):
            user_apps.validate_launch_path(r"C:\Windows\System32\cmd.exe")


if __name__ == "__main__":
    unittest.main()
