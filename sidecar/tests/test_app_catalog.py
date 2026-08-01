"""
Tests for sidecar/app_catalog.py.

Covers:
  - Start Menu apps included with correct source
  - Registry apps included with correct source
  - Deduplication between sources
  - MAX_APP_ENTRIES cap respected
"""
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parent.parent))

import app_catalog
from app_catalog import get_app_catalog


class TestAppCatalog(unittest.TestCase):

    def test_start_menu_apps_included(self):
        with (
            patch("app_catalog._scan_start_menu",
                  return_value=["Notepad", "Microsoft Edge"]),
            patch("app_catalog._scan_registry_uninstall", return_value=[]),
        ):
            apps = get_app_catalog()
        names = [a.name for a in apps]
        self.assertIn("Notepad", names)
        self.assertIn("Microsoft Edge", names)
        for a in apps:
            self.assertEqual(a.source, "start_menu")

    def test_registry_apps_included(self):
        with (
            patch("app_catalog._scan_start_menu", return_value=[]),
            patch("app_catalog._scan_registry_uninstall",
                  return_value=["Python 3.11", "Git"]),
        ):
            apps = get_app_catalog()
        names = [a.name for a in apps]
        self.assertIn("Python 3.11", names)
        for a in apps:
            self.assertEqual(a.source, "registry")

    def test_deduplication_between_sources(self):
        with (
            patch("app_catalog._scan_start_menu", return_value=["Git"]),
            patch("app_catalog._scan_registry_uninstall",
                  return_value=["Git", "Python"]),
        ):
            apps = get_app_catalog()
        names = [a.name for a in apps]
        self.assertEqual(names.count("Git"), 1)
        self.assertIn("Python", names)

    def test_max_app_entries_respected(self):
        many = [f"App{i}" for i in range(600)]
        with (
            patch("app_catalog._scan_start_menu", return_value=many),
            patch("app_catalog._scan_registry_uninstall", return_value=many),
        ):
            apps = get_app_catalog()
        self.assertLessEqual(len(apps), app_catalog.MAX_APP_ENTRIES)


if __name__ == "__main__":
    unittest.main()
