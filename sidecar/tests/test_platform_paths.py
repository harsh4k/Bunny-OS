"""Cross-platform path and open helpers."""
from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parent.parent))

from paths import app_data_dir, memory_db_path, wake_dir
from platform_open import open_application, open_url_or_file
import app_catalog


class TestPaths(unittest.TestCase):
    def test_override_wins(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            with patch.dict("os.environ", {"BUNNY_APP_DATA": tmp}, clear=False):
                self.assertEqual(app_data_dir(), Path(tmp))
                self.assertEqual(memory_db_path(), Path(tmp) / "memory.db")
                self.assertEqual(wake_dir(), Path(tmp) / "wake")

    def test_darwin_default(self) -> None:
        with (
            patch("paths.sys.platform", "darwin"),
            patch.dict("os.environ", {}, clear=True),
            patch("paths.Path.home", return_value=Path("/Users/test")),
        ):
            self.assertEqual(
                app_data_dir(),
                Path("/Users/test/Library/Application Support/BunnyOS"),
            )

    def test_windows_localappdata(self) -> None:
        with (
            patch("paths.sys.platform", "win32"),
            patch.dict(
                "os.environ",
                {"LOCALAPPDATA": r"C:\Users\test\AppData\Local"},
                clear=True,
            ),
        ):
            self.assertEqual(
                app_data_dir(),
                Path(r"C:\Users\test\AppData\Local") / "BunnyOS",
            )


class TestPlatformOpen(unittest.TestCase):
    def test_open_url_rejects_empty(self) -> None:
        with self.assertRaises(ValueError):
            open_url_or_file("")

    def test_open_url_darwin_uses_open_bin(self) -> None:
        with (
            patch("platform_open.sys.platform", "darwin"),
            patch("platform_open.subprocess.run") as run,
        ):
            open_url_or_file("https://example.com/x")
            run.assert_called_once()
            args = run.call_args[0][0]
            self.assertEqual(args[0], "/usr/bin/open")
            self.assertIn("https://example.com/x", args)

    def test_open_app_darwin(self) -> None:
        with (
            patch("platform_open.sys.platform", "darwin"),
            patch("platform_open.subprocess.run") as run,
        ):
            open_application("Safari")
            args = run.call_args[0][0]
            self.assertEqual(args[:3], ["/usr/bin/open", "-a", "Safari"])


class TestMacAppCatalog(unittest.TestCase):
    def test_nested_utilities(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "Safari.app").mkdir()
            utils = root / "Utilities"
            utils.mkdir()
            (utils / "Terminal.app").mkdir()
            (utils / "NotAnApp").mkdir()

            apps: list[app_catalog.InstalledApp] = []
            seen: set[str] = set()
            app_catalog._collect_macos_apps(root, apps, seen, depth=0)
            names = {a.name for a in apps}
            self.assertEqual(names, {"Safari", "Terminal"})


if __name__ == "__main__":
    unittest.main()
