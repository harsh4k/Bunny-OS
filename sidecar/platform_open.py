"""
Open URLs, files, and apps without cmd.exe / powershell.

Windows: os.startfile (ShellExecuteW).
macOS: /usr/bin/open (LaunchServices) — argv list only, never shell=True.
"""
from __future__ import annotations

import os
import re
import subprocess
import sys
from pathlib import Path

_BAD = re.compile(r'[\x00-\x1f\\/:*?"<>|]')


def open_url_or_file(target: str) -> None:
    """Open an https URL, spotify: URI, or filesystem path."""
    if not target or len(target) > 4096:
        raise ValueError("open target too long or empty")
    if sys.platform == "darwin":
        subprocess.run(
            ["/usr/bin/open", target],
            check=True,
            shell=False,
            timeout=30,
        )
        return
    if sys.platform.startswith("win"):
        os.startfile(target)  # noqa: S606 — ShellExecuteW
        return
    raise NotImplementedError(f"open not supported on {sys.platform}")


def open_application(app_name: str, resolved_path: str | None = None) -> None:
    """
    Launch an application by display name or resolved path (.lnk / .app).
    """
    name = app_name.strip()
    if not name or _BAD.search(name):
        raise ValueError("invalid application name")

    if resolved_path:
        open_url_or_file(resolved_path)
        return

    if sys.platform == "darwin":
        # -a uses LaunchServices by app name; still no shell.
        subprocess.run(
            ["/usr/bin/open", "-a", name],
            check=True,
            shell=False,
            timeout=30,
        )
        return

    raise ValueError(f"No resolved path for app {name!r}")


def spotify_protocol_or_app() -> None:
    """Open Spotify via protocol handler, or the Spotify.app / Start Menu entry."""
    if sys.platform == "darwin":
        try:
            open_url_or_file("spotify:")
            return
        except (OSError, subprocess.CalledProcessError):
            open_application("Spotify")
            return
    try:
        open_url_or_file("spotify:")
    except OSError:
        # Caller resolves Start Menu path on Windows.
        raise
