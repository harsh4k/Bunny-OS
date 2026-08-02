"""Persisted user apps + last scan — shared with Rust (`user_apps.json`)."""
from __future__ import annotations

import json
import os
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from paths import user_apps_path

MAX_ALIASES = 100
MAX_CUSTOM = 100
MAX_NAME_LEN = 200

_FORBIDDEN = {
    "cmd",
    "cmd.exe",
    "powershell",
    "powershell.exe",
    "pwsh",
    "pwsh.exe",
    "osascript",
    "bash",
    "zsh",
    "sh",
    "wscript",
    "cscript",
    "mshta",
}


@dataclass
class CustomApp:
    id: str
    name: str
    path: str


def _default() -> dict[str, Any]:
    return {"aliases": {}, "custom": [], "scanned": [], "scanned_at": None}


def load() -> dict[str, Any]:
    path = user_apps_path()
    try:
        raw = path.read_text(encoding="utf-8")
        data = json.loads(raw)
        if not isinstance(data, dict):
            return _default()
        data.setdefault("aliases", {})
        data.setdefault("custom", [])
        data.setdefault("scanned", [])
        return data
    except (OSError, json.JSONDecodeError):
        return _default()


def _sanitize_name(name: str) -> str:
    trimmed = name.strip()
    if not trimmed or len(trimmed) > MAX_NAME_LEN:
        raise ValueError(f"name must be 1-{MAX_NAME_LEN} characters")
    bad = set('/\\:*?"<>|\0\n\r')
    if any(c in bad for c in trimmed):
        raise ValueError("name contains invalid characters")
    return trimmed


def validate_launch_path(path: str) -> None:
    p = Path(path)
    if not p.is_absolute():
        raise ValueError("path must be absolute")
    name = p.name.lower()
    if name in _FORBIDDEN:
        raise ValueError("that program is not allowed")
    if os.name == "nt":
        if p.suffix.lower() not in (".lnk", ".exe"):
            raise ValueError("only .lnk or .exe files are allowed")
        if not p.is_file():
            raise ValueError("file not found")
    else:
        if p.suffix.lower() != ".app":
            raise ValueError("only .app bundles are allowed")
        if not p.exists():
            raise ValueError("app bundle not found")


def resolve_user_path(app_name: str) -> str | None:
    """Return a custom path or None (caller continues with Start Menu)."""
    data = load()
    key = app_name.lower().strip()
    for item in data.get("custom") or []:
        if not isinstance(item, dict):
            continue
        if str(item.get("name", "")).lower() == key:
            path = str(item.get("path", ""))
            if path:
                validate_launch_path(path)
                return path
    aliases = data.get("aliases") or {}
    if isinstance(aliases, dict) and key in aliases:
        target = str(aliases[key]).lower()
        for item in data.get("custom") or []:
            if isinstance(item, dict) and str(item.get("name", "")).lower() == target:
                path = str(item.get("path", ""))
                if path:
                    validate_launch_path(path)
                    return path
        # Alias to a scanned Start Menu name — signal caller via sentinel None
        # but rewrite is handled by apply_user_alias.
    return None


def apply_user_alias(app_name: str) -> str:
    data = load()
    key = app_name.lower().strip()
    aliases = data.get("aliases") or {}
    if isinstance(aliases, dict) and key in aliases:
        return str(aliases[key])
    return app_name


def user_catalog_entries() -> list[tuple[str, str, str]]:
    """(name, source, path) for inventory merge."""
    data = load()
    out: list[tuple[str, str, str]] = []
    for item in data.get("custom") or []:
        if not isinstance(item, dict):
            continue
        name = str(item.get("name", "")).strip()
        path = str(item.get("path", ""))
        if name:
            out.append((name, "user", path))
    return out
