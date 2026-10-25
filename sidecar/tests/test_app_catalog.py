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

sys.path.insert(0, str(Path(__file__).parent.parent))

import app_catalog
from app_catalog import get_app_catalog
from fakes import windows_app_catalog


class TestAppCatalog(unittest.TestCase):

    def test_start_menu_apps_included(self):
        with windows_app_catalog(start_menu=["Notepad", "Microsoft Edge"]):
            apps = get_app_catalog()
        names = [a.name for a in apps]
        self.assertIn("Notepad", names)
        self.assertIn("Microsoft Edge", names)
        for a in apps:
            self.assertEqual(a.source, "start_menu")

    def test_registry_apps_included(self):
        with windows_app_catalog(registry=["Python 3.11", "Git"]):
            apps = get_app_catalog()
        names = [a.name for a in apps]
        self.assertIn("Python 3.11", names)
        for a in apps:
            self.assertEqual(a.source, "registry")

    def test_deduplication_between_sources(self):
        with windows_app_catalog(start_menu=["Git"], registry=["Git", "Python"]):
            apps = get_app_catalog()
        names = [a.name for a in apps]
        self.assertEqual(names.count("Git"), 1)
        self.assertIn("Python", names)

    def test_max_app_entries_respected(self):
        many = [f"App{i}" for i in range(600)]
        with windows_app_catalog(start_menu=many, registry=many):
            apps = get_app_catalog()
        self.assertLessEqual(len(apps), app_catalog.MAX_APP_ENTRIES)

    def test_user_entries_first_and_deduplicated(self):
        user = [("My Tool", "user", r"C:\Tools\tool.exe"), ("notepad", "user", "")]
        with windows_app_catalog(start_menu=["Notepad"], user_entries=user):
            apps = get_app_catalog()
        self.assertEqual(apps[0].name, "My Tool")
        self.assertEqual(apps[0].source, "user")
        self.assertEqual(apps[0].path, r"C:\Tools\tool.exe")
        # Case-insensitive clash with a scanned app keeps the scanned entry.
        self.assertEqual([a.name.lower() for a in apps].count("notepad"), 1)
        self.assertEqual(next(a for a in apps if a.name.lower() == "notepad").source, "start_menu")


if __name__ == "__main__":
    unittest.main()
