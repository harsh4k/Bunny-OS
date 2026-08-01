"""Tests for platform seam helpers."""
from __future__ import annotations

import sys
import unittest
from unittest import mock

import platform_seams


class TestPlatformSeams(unittest.TestCase):
    def test_windows_flags(self):
        if sys.platform.startswith("win"):
            self.assertTrue(platform_seams.is_windows())
            self.assertFalse(platform_seams.is_macos())

    def test_media_keys_on_windows(self):
        if not sys.platform.startswith("win"):
            self.skipTest("Windows only")
        with mock.patch("media_keys.media_play_pause") as play:
            platform_seams.media_keys().play_pause()
        play.assert_called_once()

    def test_require_windows_raises_elsewhere(self):
        with mock.patch.object(platform_seams, "is_windows", return_value=False):
            with self.assertRaises(NotImplementedError):
                platform_seams.require_windows("TTS")


if __name__ == "__main__":
    unittest.main()
