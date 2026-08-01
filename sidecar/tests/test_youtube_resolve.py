"""Tests for YouTube first-video resolution."""
from __future__ import annotations

import unittest
from unittest import mock

from youtube_resolve import first_video_id, watch_url


class TestYoutubeResolve(unittest.TestCase):
    def test_watch_url(self):
        self.assertEqual(
            watch_url("n61ULEU7CO0"),
            "https://www.youtube.com/watch?v=n61ULEU7CO0&autoplay=1",
        )

    def test_first_video_id_parses_html(self):
        html = b'{"contents":{"videoId":"Abcdefghijk"},"more":true}'

        class Resp:
            status = 200

            def read(self, _n: int) -> bytes:
                return html

        class Conn:
            def request(self, *_a, **_k):
                return None

            def getresponse(self):
                return Resp()

            def close(self):
                return None

        with mock.patch("youtube_resolve.http.client.HTTPSConnection", return_value=Conn()):
            self.assertEqual(first_video_id("lofi"), "Abcdefghijk")

    def test_first_video_id_empty_query(self):
        self.assertIsNone(first_video_id("  "))


if __name__ == "__main__":
    unittest.main()
