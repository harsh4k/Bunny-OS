"""
Focused-window text for opt-in screen Q&A.

Returns title, app name, and on-screen text when available.
Never persists pixels or audio. Probe only when callers gate on opt-in.

Windows: Win32 foreground + UI Automation (optional uiautomation) / child titles.
macOS: AppKit frontmost app + Accessibility AX tree when permitted.
"""
from __future__ import annotations

import os
import re
import sys
from typing import Any

# Soft cap for prompt injection (chars).
_MAX_TEXT = 3500
_MAX_TITLE = 500


def get_focused_window_text() -> dict[str, Any]:
    """
    Probe the focused (or nearest non-Bunny) window.
    Returns { ok, title, app?, text?, source?, error? }.
    """
    try:
        if sys.platform == "win32":
            return _windows_foreground()
        if sys.platform == "darwin":
            return _macos_foreground()
        return {"ok": False, "title": "", "error": "Screen context is not supported on this OS."}
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "title": "", "error": str(exc)}


def _clean_text(raw: str) -> str:
    text = re.sub(r"[ \t]+\n", "\n", (raw or "").replace("\r\n", "\n").replace("\r", "\n"))
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = re.sub(r"[ \t]{2,}", " ", text)
    return text.strip()


def _windows_foreground() -> dict[str, Any]:
    import ctypes
    from ctypes import wintypes

    user32 = ctypes.windll.user32
    hwnd = _windows_target_hwnd(ctypes, user32)
    if not hwnd:
        return {"ok": False, "title": "", "error": "No focused window."}

    length = int(user32.GetWindowTextLengthW(hwnd))
    buf = ctypes.create_unicode_buffer(length + 1)
    user32.GetWindowTextW(hwnd, buf, length + 1)
    title = (buf.value or "").strip()

    pid = wintypes.DWORD()
    user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
    app = _windows_process_name(int(pid.value)) or f"pid:{int(pid.value)}"

    text = ""
    source = "title"
    uia = _windows_uia_text(int(hwnd))
    if uia:
        text = uia
        source = "uia"
    else:
        scraped = _windows_child_titles(ctypes, user32, int(hwnd))
        if scraped:
            text = scraped
            source = "win32"

    text = _clean_text(text)[:_MAX_TEXT]
    title = title[:_MAX_TITLE]

    if not title and not text:
        return {
            "ok": False,
            "title": "",
            "app": app,
            "error": "Focused window has no readable text.",
        }
    return {
        "ok": True,
        "title": title or app,
        "app": app,
        "text": text,
        "source": source,
    }


def _windows_target_hwnd(ctypes: Any, user32: Any) -> int:
    """Prefer foreground window; if it's Bunny, pick the next visible top-level app."""
    hwnd = int(user32.GetForegroundWindow() or 0)
    if hwnd and not _windows_is_own_hwnd(ctypes, user32, hwnd):
        return hwnd
    found = 0

    WNDENUMPROC = ctypes.WINFUNCTYPE(ctypes.c_bool, ctypes.c_void_p, ctypes.c_void_p)

    @WNDENUMPROC
    def _enum(h: int, _lparam: int) -> bool:
        nonlocal found
        h = int(h or 0)
        if not h or not user32.IsWindowVisible(h):
            return True
        if _windows_is_own_hwnd(ctypes, user32, h):
            return True
        length = int(user32.GetWindowTextLengthW(h))
        if length <= 0:
            return True
        found = h
        return False

    user32.EnumWindows(_enum, 0)
    return found or hwnd


def _windows_is_own_hwnd(ctypes: Any, user32: Any, hwnd: int) -> bool:
    from ctypes import wintypes

    pid = wintypes.DWORD()
    user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
    if int(pid.value) == os.getpid():
        return True
    name = (_windows_process_name(int(pid.value)) or "").lower()
    return "bunny" in name


def _windows_process_name(pid: int) -> str:
    import ctypes
    from ctypes import wintypes

    if pid <= 0:
        return ""
    PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
    kernel32 = ctypes.windll.kernel32
    handle = kernel32.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, False, pid)
    if not handle:
        return ""
    try:
        size = wintypes.DWORD(260)
        buf = ctypes.create_unicode_buffer(260)
        if kernel32.QueryFullProcessImageNameW(handle, 0, buf, ctypes.byref(size)):
            path = buf.value or ""
            base = path.replace("\\", "/").rsplit("/", 1)[-1]
            return base or path
    except Exception:  # noqa: BLE001
        return ""
    finally:
        kernel32.CloseHandle(handle)
    return ""


def _windows_uia_text(hwnd: int) -> str:
    """Optional UI Automation tree text (needs uiautomation in frozen bundle)."""
    try:
        import uiautomation as auto  # type: ignore
    except ImportError:
        return ""
    try:
        ctrl = auto.ControlFromHandle(hwnd)
        if ctrl is None:
            return ""
        parts: list[str] = []
        seen: set[str] = set()

        def add(s: str) -> None:
            s = (s or "").strip()
            if len(s) < 2 or s in seen:
                return
            seen.add(s)
            parts.append(s)

        add(getattr(ctrl, "Name", "") or "")
        try:
            add(str(ctrl.GetPropertyValue(auto.PropertyId.ValueValueProperty) or ""))
        except Exception:  # noqa: BLE001
            pass

        try:
            for child in ctrl.GetChildren():
                add(getattr(child, "Name", "") or "")
                try:
                    for grand in child.GetChildren():
                        add(getattr(grand, "Name", "") or "")
                        try:
                            val = grand.GetPropertyValue(auto.PropertyId.ValueValueProperty)
                            add(str(val or ""))
                        except Exception:  # noqa: BLE001
                            pass
                except Exception:  # noqa: BLE001
                    pass
                if sum(len(p) for p in parts) >= _MAX_TEXT:
                    break
        except Exception:  # noqa: BLE001
            pass
        return _clean_text("\n".join(parts))[:_MAX_TEXT]
    except Exception:  # noqa: BLE001
        return ""


def _windows_child_titles(ctypes: Any, user32: Any, hwnd: int) -> str:
    """Zero-dep fallback: collect visible child window titles."""
    parts: list[str] = []
    WNDENUMPROC = ctypes.WINFUNCTYPE(ctypes.c_bool, ctypes.c_void_p, ctypes.c_void_p)

    @WNDENUMPROC
    def _enum(child: int, _lparam: int) -> bool:
        child = int(child or 0)
        if not child or not user32.IsWindowVisible(child):
            return True
        length = int(user32.GetWindowTextLengthW(child))
        if length <= 0 or length > 400:
            return True
        buf = ctypes.create_unicode_buffer(length + 1)
        user32.GetWindowTextW(child, buf, length + 1)
        t = (buf.value or "").strip()
        if t and t not in parts:
            parts.append(t)
        return sum(len(p) for p in parts) < _MAX_TEXT

    user32.EnumChildWindows(hwnd, _enum, 0)
    return _clean_text("\n".join(parts))[:_MAX_TEXT]


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

    title = name
    text = ""
    source = "appkit"
    ax = _macos_ax_text()
    if ax.get("title"):
        title = str(ax["title"])
    if ax.get("text"):
        text = str(ax["text"])
        source = "ax"

    text = _clean_text(text)[:_MAX_TEXT]
    title = (title or name)[:_MAX_TITLE]
    return {
        "ok": True,
        "title": title,
        "app": name,
        "text": text,
        "source": source,
    }


def _macos_ax_text() -> dict[str, str]:
    """Read focused UI element + window title via Accessibility."""
    try:
        from ApplicationServices import (  # type: ignore
            AXUIElementCopyAttributeValue,
            AXUIElementCreateSystemWide,
            kAXChildrenAttribute,
            kAXFocusedUIElementAttribute,
            kAXFocusedWindowAttribute,
            kAXTitleAttribute,
            kAXValueAttribute,
        )
    except ImportError:
        return {}

    try:
        system = AXUIElementCreateSystemWide()
        title = ""
        text_parts: list[str] = []
        err, focused = AXUIElementCopyAttributeValue(
            system, kAXFocusedUIElementAttribute, None
        )
        if err == 0 and focused is not None:
            _err_t, t = AXUIElementCopyAttributeValue(focused, kAXTitleAttribute, None)
            if t:
                title = str(t)
            _err_v, v = AXUIElementCopyAttributeValue(focused, kAXValueAttribute, None)
            if v:
                text_parts.append(str(v))
        err_w, window = AXUIElementCopyAttributeValue(
            system, kAXFocusedWindowAttribute, None
        )
        if err_w == 0 and window is not None:
            _err_wt, wt = AXUIElementCopyAttributeValue(window, kAXTitleAttribute, None)
            if wt and not title:
                title = str(wt)
            _err_c, children = AXUIElementCopyAttributeValue(
                window, kAXChildrenAttribute, None
            )
            if children:
                for child in list(children)[:40]:
                    _e, cn = AXUIElementCopyAttributeValue(child, kAXTitleAttribute, None)
                    if cn:
                        text_parts.append(str(cn))
                    _e2, cv = AXUIElementCopyAttributeValue(child, kAXValueAttribute, None)
                    if cv:
                        text_parts.append(str(cv))
                    if sum(len(p) for p in text_parts) >= _MAX_TEXT:
                        break
        return {
            "title": title[:_MAX_TITLE],
            "text": _clean_text("\n".join(text_parts))[:_MAX_TEXT],
        }
    except Exception:  # noqa: BLE001
        return {}
