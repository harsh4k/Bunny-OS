"""
Installed-app catalog — Start Menu / registry on Windows, /Applications on macOS.

Read-only. No shell=True.
"""
from __future__ import annotations

import os
import sys
from dataclasses import dataclass
from pathlib import Path

MAX_APP_ENTRIES = 500


@dataclass
class InstalledApp:
    name: str
    source: str  # start_menu | registry | applications
    path: str = ""  # optional resolved path (.lnk / .app)


def get_app_catalog() -> list[InstalledApp]:
    if sys.platform == "darwin":
        return _catalog_macos()
    if sys.platform.startswith("win"):
        return _catalog_windows()
    return []


def resolve_app_path(app_name: str) -> str | None:
    """Return a filesystem path for open, or None to open by name on macOS."""
    key = app_name.lower().strip()
    for app in get_app_catalog():
        if app.name.lower() == key and app.path:
            return app.path
    # Fuzzy: containment
    hits = [a for a in get_app_catalog() if key in a.name.lower() or a.name.lower() in key]
    if len(hits) == 1 and hits[0].path:
        return hits[0].path
    return None


def _catalog_macos() -> list[InstalledApp]:
    seen: set[str] = set()
    apps: list[InstalledApp] = []
    roots = [
        Path("/Applications"),
        Path("/System/Applications"),
        Path.home() / "Applications",
    ]
    for root in roots:
        _collect_macos_apps(root, apps, seen, depth=0)
        if len(apps) >= MAX_APP_ENTRIES:
            break
    return apps


def _collect_macos_apps(
    root: Path,
    apps: list[InstalledApp],
    seen: set[str],
    depth: int,
) -> None:
    """Scan `.app` bundles; one nesting level (e.g. Utilities) like the Rust scanner."""
    if depth > 1 or len(apps) >= MAX_APP_ENTRIES or not root.is_dir():
        return
    try:
        entries = list(root.iterdir())
    except OSError:
        return
    for entry in entries:
        if len(apps) >= MAX_APP_ENTRIES:
            return
        if not entry.is_dir():
            continue
        if entry.suffix == ".app":
            name = entry.stem
            low = name.lower()
            if low in seen:
                continue
            seen.add(low)
            apps.append(InstalledApp(name=name, source="applications", path=str(entry)))
        elif depth < 1:
            _collect_macos_apps(entry, apps, seen, depth + 1)


def _catalog_windows() -> list[InstalledApp]:
    import winreg

    seen: set[str] = set()
    apps: list[InstalledApp] = []

    for name in _scan_start_menu():
        if name not in seen and len(apps) < MAX_APP_ENTRIES:
            seen.add(name)
            apps.append(InstalledApp(name=name, source="start_menu"))

    for name in _scan_registry_uninstall(winreg):
        if name not in seen and len(apps) < MAX_APP_ENTRIES:
            seen.add(name)
            apps.append(InstalledApp(name=name, source="registry"))

    return apps


def _start_menu_dirs() -> list[Path]:
    dirs: list[Path] = []
    for env_var in ("APPDATA", "PROGRAMDATA"):
        base = os.environ.get(env_var, "")
        if base:
            p = Path(base) / "Microsoft" / "Windows" / "Start Menu" / "Programs"
            if p.is_dir():
                dirs.append(p)
    return dirs


def _scan_start_menu() -> list[str]:
    names: list[str] = []
    for root in _start_menu_dirs():
        for _, _, filenames in os.walk(root):
            for fname in filenames:
                if fname.lower().endswith(".lnk"):
                    names.append(Path(fname).stem)
                    if len(names) >= MAX_APP_ENTRIES:
                        return names
    return names


def _scan_registry_uninstall(winreg) -> list[str]:
    paths = [
        (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall"),
        (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall"),
        (winreg.HKEY_CURRENT_USER, r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall"),
    ]
    names: list[str] = []
    for hive, path in paths:
        try:
            with winreg.OpenKey(hive, path) as key:
                count = winreg.QueryInfoKey(key)[0]
                for i in range(min(count, MAX_APP_ENTRIES)):
                    try:
                        sub = winreg.EnumKey(key, i)
                        with winreg.OpenKey(key, sub) as sk:
                            dn, _ = winreg.QueryValueEx(sk, "DisplayName")
                            if isinstance(dn, str) and dn.strip():
                                names.append(dn.strip())
                    except OSError:
                        continue
        except OSError:
            continue
    return names
