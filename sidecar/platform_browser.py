"""
Win32 / macOS helpers for allowlisted browser chrome keys.

Never uses cmd/powershell/osascript. macOS typing/scroll may require Accessibility.
"""
from __future__ import annotations

import sys
import time
from typing import Literal


Direction = Literal["up", "down"]


def browser_scroll(direction: Direction, steps: int = 3) -> None:
    steps = max(1, min(int(steps), 20))
    if sys.platform == "win32":
        _win_scroll(direction, steps)
        return
    if sys.platform == "darwin":
        _mac_scroll(direction, steps)
        return
    raise NotImplementedError(f"browser_scroll unsupported on {sys.platform}")


def browser_type_text(text: str) -> None:
    if not text:
        raise ValueError("Nothing to type.")
    if len(text) > 500:
        raise ValueError("Text is too long to type (max 500).")
    if sys.platform == "win32":
        _win_type(text)
        return
    if sys.platform == "darwin":
        _mac_type(text)
        return
    raise NotImplementedError(f"browser_type unsupported on {sys.platform}")


def browser_focus_search() -> None:
    """Focus the address/search bar (Ctrl+L / Cmd+L)."""
    if sys.platform == "win32":
        _win_hotkey(0x11, 0x4C)  # Ctrl+L
        return
    if sys.platform == "darwin":
        _mac_hotkey_cmd_l()
        return
    raise NotImplementedError(f"browser_focus_search unsupported on {sys.platform}")


def browser_click_role(role: str, name: str) -> None:
    """
    Click a visible top-level window whose title contains `name` (MVP).
    `role` is accepted for schema compatibility but not used for matching yet.
    """
    role_c = (role or "").strip().lower()
    name_c = (name or "").strip()
    if not name_c:
        raise ValueError("Click needs a window or control name.")
    if len(name_c) > 120:
        raise ValueError("Control name is too long.")
    if role_c and role_c not in {"button", "link", "tab", "menuitem", "checkbox", "window"}:
        raise ValueError(f"Role '{role_c}' is not allowlisted.")
    if sys.platform == "win32":
        _win_click_by_name(name_c)
        return
    raise RuntimeError(
        "Click by window title needs UI Automation on this OS. Use scroll, type, or focus search."
    )


def foreground_handle() -> int | None:
    """Opaque handle for the current foreground window (Windows HWND). None if unavailable."""
    if sys.platform == "win32":
        import ctypes

        hwnd = int(ctypes.windll.user32.GetForegroundWindow() or 0)
        return hwnd or None
    return None


def restore_foreground(handle: int | None) -> bool:
    """Best-effort restore of a previously captured foreground window. Returns True if attempted."""
    if not handle:
        return False
    if sys.platform == "win32":
        import ctypes

        user32 = ctypes.windll.user32
        if not user32.IsWindow(handle):
            return False
        user32.SetForegroundWindow(handle)
        time.sleep(0.05)
        return True
    return False


def _win_scroll(direction: Direction, steps: int) -> None:
    import ctypes

    # MOUSEEVENTF_WHEEL = 0x0800; positive = away from user (up)
    user32 = ctypes.windll.user32
    delta = 120 if direction == "up" else -120
    for _ in range(steps):
        user32.mouse_event(0x0800, 0, 0, delta, 0)
        time.sleep(0.02)


def _win_type(text: str) -> None:
    import ctypes

    user32 = ctypes.windll.user32
    KEYEVENTF_UNICODE = 0x0004
    KEYEVENTF_KEYUP = 0x0002

    class KEYBDINPUT(ctypes.Structure):
        _fields_ = (
            ("wVk", ctypes.c_ushort),
            ("wScan", ctypes.c_ushort),
            ("dwFlags", ctypes.c_ulong),
            ("time", ctypes.c_ulong),
            ("dwExtraInfo", ctypes.POINTER(ctypes.c_ulong)),
        )

    class INPUT(ctypes.Structure):
        _fields_ = (("type", ctypes.c_ulong), ("ki", KEYBDINPUT))

    extra = ctypes.c_ulong(0)
    for ch in text:
        for flags in (KEYEVENTF_UNICODE, KEYEVENTF_UNICODE | KEYEVENTF_KEYUP):
            inp = INPUT(
                type=1,  # INPUT_KEYBOARD
                ki=KEYBDINPUT(0, ord(ch), flags, 0, ctypes.pointer(extra)),
            )
            if user32.SendInput(1, ctypes.byref(inp), ctypes.sizeof(inp)) != 1:
                raise RuntimeError("SendInput failed while typing.")
        time.sleep(0.005)


def _win_hotkey(mod_vk: int, key_vk: int) -> None:
    import ctypes

    user32 = ctypes.windll.user32
    KEYEVENTF_KEYUP = 0x0002
    user32.keybd_event(mod_vk, 0, 0, 0)
    user32.keybd_event(key_vk, 0, 0, 0)
    user32.keybd_event(key_vk, 0, KEYEVENTF_KEYUP, 0)
    user32.keybd_event(mod_vk, 0, KEYEVENTF_KEYUP, 0)


def _win_click_by_name(name: str) -> None:
    """Best-effort: find a top-level window whose title contains name, then BM_CLICK first button child."""
    import ctypes
    from ctypes import wintypes

    user32 = ctypes.windll.user32
    found = wintypes.HWND()

    @ctypes.WINFUNCTYPE(ctypes.c_bool, wintypes.HWND, wintypes.LPARAM)
    def enum_proc(hwnd, _lparam):  # type: ignore[no-untyped-def]
        if not user32.IsWindowVisible(hwnd):
            return True
        length = user32.GetWindowTextLengthW(hwnd)
        if length <= 0:
            return True
        buf = ctypes.create_unicode_buffer(length + 1)
        user32.GetWindowTextW(hwnd, buf, length + 1)
        if name.lower() in (buf.value or "").lower():
            found.value = hwnd
            return False
        return True

    user32.EnumWindows(enum_proc, 0)
    if not found.value:
        raise RuntimeError(f"No visible window matching '{name}'.")
    # Focus then click center of client area — not free-form RPA, allowlisted path.
    user32.SetForegroundWindow(found.value)
    time.sleep(0.05)
    rect = wintypes.RECT()
    user32.GetClientRect(found.value, ctypes.byref(rect))
    pt = wintypes.POINT((rect.left + rect.right) // 2, (rect.top + rect.bottom) // 2)
    user32.ClientToScreen(found.value, ctypes.byref(pt))
    user32.SetCursorPos(pt.x, pt.y)
    user32.mouse_event(0x0002, 0, 0, 0, 0)  # LEFTDOWN
    user32.mouse_event(0x0004, 0, 0, 0, 0)  # LEFTUP


def _mac_scroll(direction: Direction, steps: int) -> None:
    try:
        from Quartz import (  # type: ignore
            CGEventCreateScrollWheelEvent,
            CGEventPost,
            kCGHIDEventTap,
            kCGScrollEventUnitLine,
        )
    except ImportError as exc:
        raise RuntimeError("PyObjC Quartz is required for scroll on macOS.") from exc
    line = -3 if direction == "down" else 3
    for _ in range(steps):
        ev = CGEventCreateScrollWheelEvent(None, kCGScrollEventUnitLine, 1, line)
        CGEventPost(kCGHIDEventTap, ev)
        time.sleep(0.02)


def _mac_type(text: str) -> None:
    try:
        from AppKit import NSEvent, NSSystemDefined  # type: ignore  # noqa: F401
        from Quartz import (  # type: ignore
            CGEventCreateKeyboardEvent,
            CGEventKeyboardSetUnicodeString,
            CGEventPost,
            kCGHIDEventTap,
        )
    except ImportError as exc:
        raise RuntimeError("PyObjC is required for typing on macOS.") from exc
    for ch in text:
        ev_down = CGEventCreateKeyboardEvent(None, 0, True)
        CGEventKeyboardSetUnicodeString(ev_down, 1, ch)
        CGEventPost(kCGHIDEventTap, ev_down)
        ev_up = CGEventCreateKeyboardEvent(None, 0, False)
        CGEventKeyboardSetUnicodeString(ev_up, 1, ch)
        CGEventPost(kCGHIDEventTap, ev_up)
        time.sleep(0.005)


def _mac_hotkey_cmd_l() -> None:
    try:
        from Quartz import (  # type: ignore
            CGEventCreateKeyboardEvent,
            CGEventPost,
            CGEventSetFlags,
            kCGEventFlagMaskCommand,
            kCGHIDEventTap,
        )
    except ImportError as exc:
        raise RuntimeError("PyObjC Quartz is required for focus search on macOS.") from exc
    # kVK_ANSI_L = 0x25
    for down in (True, False):
        ev = CGEventCreateKeyboardEvent(None, 0x25, down)
        CGEventSetFlags(ev, kCGEventFlagMaskCommand)
        CGEventPost(kCGHIDEventTap, ev)
