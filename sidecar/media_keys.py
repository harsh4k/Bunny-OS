"""
Win32 multimedia keys via keybd_event.

No shell, no Spotify API — the focused media app (Spotify, etc.) handles
play/pause, next, and previous for whatever was last playing.
"""
from __future__ import annotations

import ctypes
import time

# Virtual-key codes (winuser.h).
VK_MEDIA_NEXT_TRACK = 0xB0
VK_MEDIA_PREV_TRACK = 0xB1
VK_MEDIA_PLAY_PAUSE = 0xB3

KEYEVENTF_EXTENDEDKEY = 0x0001
KEYEVENTF_KEYUP = 0x0002

# Brief settle so a just-focused Spotify window sees the key.
_SETTLE_SECS = 0.35


def media_play_pause() -> None:
    _tap(VK_MEDIA_PLAY_PAUSE)


def media_next() -> None:
    _tap(VK_MEDIA_NEXT_TRACK)


def media_prev() -> None:
    _tap(VK_MEDIA_PREV_TRACK)


def _tap(vk: int) -> None:
    user32 = ctypes.windll.user32
    user32.keybd_event(vk, 0, KEYEVENTF_EXTENDEDKEY, 0)
    user32.keybd_event(vk, 0, KEYEVENTF_EXTENDEDKEY | KEYEVENTF_KEYUP, 0)


def settle() -> None:
    """Wait a beat after opening Spotify so the media key lands."""
    time.sleep(_SETTLE_SECS)
