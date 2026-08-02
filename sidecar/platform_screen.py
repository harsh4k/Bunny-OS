"""
Focused-window text for opt-in screen Q&A.

Returns title (and process name when available). Never captures pixels or audio.
Windows: Win32 GetForegroundWindow. macOS: AppKit NSWorkspace when importable.
"""
from __future__ import annotations

import sys
from typing import Any


def get_focused_window_text() -> dict[str, Any]:
    """
    Probe the focused window. Returns { ok, title, app?, error? }.
    Safe to call when screen context is Off — callers must gate.
    """
    try:
        if sys.platform == "win32":
            return _windows_foreground()
        if sys.platform == "darwin":
            return _macos_foreground()
        return {"ok": False, "title": "", "error": "Screen context is not supported on this OS."}
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "title": "", "error": str(exc)}


def _windows_foreground() -> dict[str, Any]:
    import ctypes
    from ctypes import wintypes

    user32 = ctypes.windll.user32
    hwnd = user32.GetForegroundWindow()
    if not hwnd:
        return {"ok": False, "title": "", "error": "No focused window."}
    length = int(user32.GetWindowTextLengthW(hwnd))
    buf = ctypes.create_unicode_buffer(length + 1)
    user32.GetWindowTextW(hwnd, buf, length + 1)
    title = (buf.value or "").strip()
    app = ""
    try:
        pid = wintypes.DWORD()
        user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
        app = f"pid:{int(pid.value)}"
    except Exception:  # noqa: BLE001
        pass
    if not title:
        return {"ok": False, "title": "", "app": app, "error": "Focused window has no title."}
    return {"ok": True, "title": title[:500], "app": app}


def _macos_foreground() -> dict[str, Any]:
    try:
        from AppKit import NSWorkspace  # type: ignore
    except ImportError:
        return {
            "ok": False,
            "title": "",
            "error": "Screen context needs AppKit (macOS). Grant Accessibility if prompted.",
        }
    app = NSWorkspace.sharedWorkspace().frontmostApplication()
    if app is None:
        return {"ok": False, "title": "", "error": "No frontmost application."}
    name = str(app.localizedName() or "") or "Unknown app"
    # Title via Accessibility is optional; app name is the safe MVP.
    return {"ok": True, "title": name[:500], "app": name}
