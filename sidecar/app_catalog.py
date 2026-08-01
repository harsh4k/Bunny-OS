"""
Windows app catalog scanner for Bunny OS sidecar.

Read-only scan of:
  - Start Menu shortcut folders (APPDATA + PROGRAMDATA)
  - Registry Uninstall keys (HKLM 64-bit, HKLM 32-bit, HKCU)

No arbitrary file crawl, no Windows services scan, no shell=True.
"""
from __future__ import annotations

import os
import winreg
from dataclasses import dataclass
from pathlib import Path

MAX_APP_ENTRIES = 500   # hard cap to prevent runaway registry scans


# ── Data classes ──────────────────────────────────────────────────────────────

@dataclass
class InstalledApp:
    name: str
    source: str   # "start_menu" | "registry"


# ── Public API ────────────────────────────────────────────────────────────────

def get_app_catalog() -> list[InstalledApp]:
    seen: set[str] = set()
    apps: list[InstalledApp] = []

    for name in _scan_start_menu():
        if name not in seen and len(apps) < MAX_APP_ENTRIES:
            seen.add(name)
            apps.append(InstalledApp(name=name, source="start_menu"))

    for name in _scan_registry_uninstall():
        if name not in seen and len(apps) < MAX_APP_ENTRIES:
            seen.add(name)
            apps.append(InstalledApp(name=name, source="registry"))

    return apps


# ── Start Menu ────────────────────────────────────────────────────────────────

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


# ── Registry Uninstall ────────────────────────────────────────────────────────

_UNINSTALL_PATHS = [
    (winreg.HKEY_LOCAL_MACHINE,
     r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall"),
    (winreg.HKEY_LOCAL_MACHINE,
     r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall"),
    (winreg.HKEY_CURRENT_USER,
     r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall"),
]


def _scan_registry_uninstall() -> list[str]:
    names: list[str] = []
    for hive, path in _UNINSTALL_PATHS:
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
