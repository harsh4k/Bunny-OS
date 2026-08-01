"""
Multimedia keys — Windows user32 keybd_event, macOS system-defined NSEvents.

No shell. macOS requires PyObjC (AppKit); missing → clear RuntimeError.
"""
from __future__ import annotations

import sys

# Windows virtual-key codes
VK_MEDIA_NEXT_TRACK = 0xB0
VK_MEDIA_PREV_TRACK = 0xB1
VK_MEDIA_PLAY_PAUSE = 0xB3
KEYEVENTF_EXTENDEDKEY = 0x0001
KEYEVENTF_KEYUP = 0x0002

# macOS NX media key subtypes (IOKit ev_keymap)
_NX_KEYTYPE_PLAY = 16
_NX_KEYTYPE_NEXT = 17
_NX_KEYTYPE_PREVIOUS = 18


def media_play_pause() -> None:
    _tap_play_pause()


def media_next() -> None:
    _tap_next()


def media_prev() -> None:
    _tap_prev()


def _tap_play_pause() -> None:
    if sys.platform == "darwin":
        _darwin_media(_NX_KEYTYPE_PLAY)
    elif sys.platform.startswith("win"):
        _win_media(VK_MEDIA_PLAY_PAUSE)
    else:
        raise NotImplementedError(f"media keys unsupported on {sys.platform}")


def _tap_next() -> None:
    if sys.platform == "darwin":
        _darwin_media(_NX_KEYTYPE_NEXT)
    elif sys.platform.startswith("win"):
        _win_media(VK_MEDIA_NEXT_TRACK)
    else:
        raise NotImplementedError(f"media keys unsupported on {sys.platform}")


def _tap_prev() -> None:
    if sys.platform == "darwin":
        _darwin_media(_NX_KEYTYPE_PREVIOUS)
    elif sys.platform.startswith("win"):
        _win_media(VK_MEDIA_PREV_TRACK)
    else:
        raise NotImplementedError(f"media keys unsupported on {sys.platform}")


def _win_media(vk: int) -> None:
    import ctypes

    user32 = ctypes.windll.user32
    user32.keybd_event(vk, 0, KEYEVENTF_EXTENDEDKEY, 0)
    user32.keybd_event(vk, 0, KEYEVENTF_EXTENDEDKEY | KEYEVENTF_KEYUP, 0)


def _darwin_media(nx_key: int) -> None:
    """Post a system-defined media key event via AppKit."""
    try:
        from AppKit import NSEvent, NSSystemDefined  # type: ignore
        from Quartz import CGEventPost, kCGHIDEventTap  # type: ignore
    except ImportError as exc:
        raise RuntimeError(
            "PyObjC is required for media keys on macOS. "
            "pip install pyobjc-framework-Cocoa pyobjc-framework-Quartz"
        ) from exc

    # data1 packing: key << 16 | (is_down ? 0xa00 : 0xb00)
    for down in (True, False):
        flag = 0xA00 if down else 0xB00
        data1 = (nx_key << 16) | flag
        ev = NSEvent.otherEventWithType_location_modifierFlags_timestamp_windowNumber_context_subtype_data1_data2_(
            NSSystemDefined,
            (0.0, 0.0),
            0,
            0,
            0,
            None,
            8,  # subtype NX_SUBTYPE_AUX_CONTROL_BUTTONS-ish
            data1,
            -1,
        )
        if ev is None:
            raise RuntimeError("Failed to create macOS media key event")
        CGEventPost(kCGHIDEventTap, ev.CGEvent())
