"""Cross-platform app-data paths for Bunny OS."""
from __future__ import annotations

import os
import sys
from pathlib import Path


def app_data_dir() -> Path:
    """
    Resolve %LOCALAPPDATA%\\BunnyOS on Windows, or
    ~/Library/Application Support/BunnyOS on macOS.
    Override with BUNNY_APP_DATA.
    """
    override = os.environ.get("BUNNY_APP_DATA")
    if override:
        return Path(override)

    if sys.platform == "darwin":
        home = Path.home()
        return home / "Library" / "Application Support" / "BunnyOS"

    base = os.environ.get("LOCALAPPDATA") or os.environ.get("APPDATA")
    if base:
        return Path(base) / "BunnyOS"
    return Path.home() / "BunnyOS"


def memory_db_path() -> Path:
    override = os.environ.get("BUNNY_MEMORY_DB")
    if override:
        return Path(override)
    return app_data_dir() / "memory.db"


def wake_dir() -> Path:
    return app_data_dir() / "wake"


def user_apps_path() -> Path:
    return app_data_dir() / "user_apps.json"
