"""Tests for voice intent matching and local action helpers."""
from __future__ import annotations

import unittest
from unittest import mock

from local_actions import execute
from voice_intents import match_intent


class TestVoiceIntents(unittest.TestCase):
    def setUp(self):
        from voice_intents import reset_dialog_domain

        reset_dialog_domain()

    def test_time_phrases(self):
        for phrase in (
            "what time is it",
            "what time is it rn",
            "hey bunny what time is it",
            "tell me the time",
        ):
            result = match_intent(phrase)
            self.assertIsNotNone(result, phrase)
            assert result is not None
            self.assertEqual(result["kind"], "respond")
            self.assertTrue(result["text"].lower().startswith("it's"), result)

    def test_date_phrase(self):
        result = match_intent("what's today's date")
        self.assertIsNotNone(result)
        assert result is not None
        self.assertIn("Today is", result["text"])

    def test_media_next_phrases(self):
        for phrase in ("next song", "skip", "skip this track", "next"):
            result = match_intent(phrase)
            self.assertEqual(
                result,
                {"kind": "action", "action": {"action": "media_next"}},
                phrase,
            )

    def test_media_prev_phrases(self):
        for phrase in ("previous song", "prev track", "go back"):
            result = match_intent(phrase)
            self.assertEqual(
                result,
                {"kind": "action", "action": {"action": "media_prev"}},
                phrase,
            )

    def test_media_play_phrases(self):
        for phrase in ("play", "play music", "resume", "pause"):
            result = match_intent(phrase)
            self.assertEqual(
                result,
                {"kind": "action", "action": {"action": "media_play"}},
                phrase,
            )

    def test_media_play_does_not_steal_youtube(self):
        result = match_intent("play despacito on youtube")
        assert result is not None
        self.assertEqual(result["action"]["action"], "youtube_play")

    def test_media_keys_execute(self):
        with mock.patch("media_keys.media_play_pause") as play, mock.patch(
            "media_keys.media_next"
        ) as nxt, mock.patch("media_keys.media_prev") as prev:
            self.assertIn("play", execute({"action": "media_play"}).lower())
            self.assertIn("next", execute({"action": "media_next"}).lower())
            self.assertIn("previous", execute({"action": "media_prev"}).lower())
        play.assert_called_once()
        nxt.assert_called_once()
        prev.assert_called_once()

    def test_open_app(self):
        result = match_intent("open Notepad")
        self.assertEqual(
            result,
            {
                "kind": "action",
                "action": {"action": "open_app", "app_name": "Notepad"},
            },
        )

    def test_start_verb_on_media_is_not_an_app_launch(self):
        # Regression: "start ... the playlist" resolved to open_app and failed
        # with "App 'like the playlist' not found in Start Menu".
        for phrase in (
            "start the chill vibes playlist",
            "play my chill playlist",
            "play some lofi music",
            "play the interstellar trailer",
        ):
            result = match_intent(phrase)
            self.assertIsNotNone(result, phrase)
            assert result is not None
            self.assertEqual(result["kind"], "action", phrase)
            self.assertNotEqual(result["action"]["action"], "open_app", phrase)

    def test_bare_media_ask_requests_a_name(self):
        # Without a name there is nothing to search; guessing played a random
        # video, so ask instead.
        for phrase, want in (
            ("start the playlist", "playlist"),
            ("start a video", "video"),
        ):
            result = match_intent(phrase)
            self.assertIsNotNone(result, phrase)
            assert result is not None
            self.assertEqual(result["kind"], "respond", phrase)
            self.assertIn(want, result["text"].lower())

    def test_media_keyword_stays_in_the_query(self):
        # "interstellar" alone finds the film, not the trailer.
        result = match_intent("play the interstellar trailer")
        assert result is not None
        self.assertEqual(result["action"]["action"], "youtube_play")
        self.assertEqual(result["action"]["query"], "interstellar trailer")

    def test_start_still_launches_a_non_media_app(self):
        result = match_intent("start Notepad")
        assert result is not None
        self.assertEqual(result["action"]["action"], "open_app")
        self.assertEqual(result["action"]["app_name"], "Notepad")

    def test_youtube_search(self):
        result = match_intent("search youtube for loft jazz")
        self.assertEqual(
            result,
            {
                "kind": "action",
                "action": {"action": "youtube_search", "query": "loft jazz"},
            },
        )

    def test_youtube_play(self):
        result = match_intent("play lo-fi on youtube")
        self.assertEqual(
            result,
            {
                "kind": "action",
                "action": {"action": "youtube_play", "query": "lo-fi"},
            },
        )

    def test_spotify_open(self):
        self.assertEqual(
            match_intent("open Spotify"),
            {"kind": "action", "action": {"action": "spotify_open"}},
        )

    def test_spotify_play(self):
        result = match_intent("play chill playlist on spotify")
        self.assertEqual(
            result,
            {
                "kind": "action",
                "action": {"action": "spotify_play", "query": "chill playlist"},
            },
        )

    def test_spotify_search(self):
        result = match_intent("search spotify for radiohead")
        self.assertEqual(
            result,
            {
                "kind": "action",
                "action": {"action": "spotify_search", "query": "radiohead"},
            },
        )

    def test_open_url(self):
        result = match_intent("open https://example.com/docs")
        self.assertEqual(
            result,
            {
                "kind": "action",
                "action": {
                    "action": "open_url",
                    "url": "https://example.com/docs",
                },
            },
        )

    def test_complex_falls_through(self):
        self.assertIsNone(match_intent("what can you do for me"))
        self.assertIsNone(match_intent("write a poem about rain"))

    def test_open_youtube_and_yt_alias(self):
        from voice_intents import reset_dialog_domain

        reset_dialog_domain()
        for phrase in ("open youtube", "open yt", "launch YouTube"):
            result = match_intent(phrase)
            self.assertEqual(
                result,
                {
                    "kind": "action",
                    "action": {
                        "action": "open_url",
                        "url": "https://www.youtube.com",
                    },
                },
                phrase,
            )

    def test_yt_search_alias(self):
        from voice_intents import reset_dialog_domain

        reset_dialog_domain()
        result = match_intent("search yt for loft jazz")
        self.assertEqual(
            result,
            {
                "kind": "action",
                "action": {"action": "youtube_search", "query": "loft jazz"},
            },
        )

    def test_follow_up_search_uses_youtube_domain(self):
        from voice_intents import reset_dialog_domain

        reset_dialog_domain()
        self.assertIsNotNone(match_intent("open youtube"))
        result = match_intent("search sunflower")
        self.assertEqual(
            result,
            {
                "kind": "action",
                "action": {"action": "youtube_search", "query": "sunflower"},
            },
        )

    def test_find_does_not_use_stale_domain(self):
        from voice_intents import reset_dialog_domain

        reset_dialog_domain()
        self.assertIsNotNone(match_intent("open youtube"))
        self.assertIsNone(match_intent("find my calendar"))

    def test_fallthrough_clears_domain(self):
        from voice_intents import reset_dialog_domain

        reset_dialog_domain()
        self.assertIsNotNone(match_intent("open youtube"))
        self.assertIsNone(match_intent("what can you do for me"))
        self.assertIsNone(match_intent("search sunflower"))

    def test_bare_query_then_play_first(self):
        from voice_intents import reset_dialog_domain

        reset_dialog_domain()
        self.assertIsNotNone(match_intent("open youtube"))
        result = match_intent("sunflower")
        self.assertEqual(
            result,
            {
                "kind": "action",
                "action": {"action": "youtube_search", "query": "sunflower"},
            },
        )
        play = match_intent("play the first one")
        self.assertEqual(
            play,
            {
                "kind": "action",
                "action": {"action": "youtube_play", "query": "sunflower"},
            },
        )

    def test_play_first_without_query_asks(self):
        from voice_intents import reset_dialog_domain

        reset_dialog_domain()
        self.assertIsNotNone(match_intent("open youtube"))
        result = match_intent("play the first one")
        self.assertEqual(result["kind"], "respond")
        self.assertIn("search", result["text"].lower())

    def test_unrelated_intent_clears_domain(self):
        from voice_intents import reset_dialog_domain

        reset_dialog_domain()
        self.assertIsNotNone(match_intent("open youtube"))
        self.assertIsNotNone(match_intent("what time is it"))
        self.assertIsNone(match_intent("search sunflower"))


class TestLocalActions(unittest.TestCase):
    def test_time_and_date(self):
        self.assertIn("It's", execute({"action": "get_local_time"}))
        self.assertIn("Today is", execute({"action": "get_local_date"}))

    def test_open_url_rejects_http(self):
        with self.assertRaises(ValueError):
            execute({"action": "open_url", "url": "http://evil.example"})

    def test_spotify_uri_rejects_smuggling(self):
        with self.assertRaises(ValueError):
            execute({"action": "spotify_play", "query": "spotify://evil"})
        with self.assertRaises(ValueError):
            execute({"action": "spotify_play", "query": "http://evil.example"})

    def test_youtube_play_opens_filtered_results(self):
        with mock.patch(
            "youtube_resolve.first_video_id", return_value=None
        ), mock.patch("local_actions.open_url_or_file") as start:
            spoken = execute({"action": "youtube_play", "query": "lofi"})
        start.assert_called_once()
        url = start.call_args[0][0]
        self.assertIn("youtube.com/results", url)
        self.assertIn("sp=EgIQAQ%3D%3D", url)
        self.assertIn("Opening YouTube results", spoken)

    def test_youtube_play_opens_watch_when_id_found(self):
        with mock.patch(
            "youtube_resolve.first_video_id", return_value="n61ULEU7CO0"
        ), mock.patch("local_actions.open_url_or_file") as start:
            spoken = execute({"action": "youtube_play", "query": "lofi"})
        start.assert_called_once()
        url = start.call_args[0][0]
        self.assertIn("watch?v=n61ULEU7CO0", url)
        self.assertIn("autoplay=1", url)
        self.assertIn("Playing", spoken)

    def test_spotify_playlist_searches_without_bogus_filter(self):
        with mock.patch("local_actions.open_url_or_file") as start:
            spoken = execute({"action": "spotify_play", "query": "chill playlist"})
        start.assert_called_once()
        uri = start.call_args[0][0]
        # Spotify has no `playlist:` filter; that literal text matches nothing.
        self.assertNotIn("playlist%3A", uri)
        self.assertFalse(uri.startswith("spotify:search:playlist:"))
        self.assertTrue(uri.startswith("spotify:search:"))
        self.assertIn("playlist", uri)
        self.assertIn("Showing", spoken)

    def test_spotify_play_does_not_claim_playback(self):
        with mock.patch("local_actions.open_url_or_file"):
            spoken = execute({"action": "spotify_play", "query": "weeknd"})
        # Search URIs only open results — saying "Playing" would be a lie.
        self.assertNotIn("Playing", spoken)
        self.assertIn("Showing", spoken)

    def test_spotify_search_uri(self):
        with mock.patch("local_actions.open_url_or_file") as start:
            spoken = execute({"action": "spotify_search", "query": "chill hits"})
        start.assert_called_once()
        uri = start.call_args[0][0]
        self.assertTrue(uri.startswith("spotify:search:"))
        self.assertIn("Searching Spotify", spoken)

    def test_open_app_launches_resolved_lnk(self):
        with mock.patch(
            "local_actions._resolve_app", return_value=r"C:\fake\Notepad.lnk"
        ), mock.patch("local_actions.open_application") as start:
            spoken = execute({"action": "open_app", "app_name": "Notepad"})
        start.assert_called_once_with("Notepad", r"C:\fake\Notepad.lnk")
        self.assertEqual(spoken, "Opening Notepad.")

    def test_open_app_yt_alias_opens_youtube_https(self):
        with mock.patch("local_actions.open_url_or_file") as start:
            spoken = execute({"action": "open_app", "app_name": "yt"})
        start.assert_called_once()
        self.assertTrue(start.call_args[0][0].startswith("https://www.youtube.com"))
        self.assertIn("YouTube", spoken)

    def test_open_app_alias_vscode(self):
        with mock.patch(
            "local_actions._resolve_app", return_value=r"C:\fake\Code.lnk"
        ), mock.patch("local_actions.open_application") as start:
            execute({"action": "open_app", "app_name": "vscode"})
        start.assert_called_once()


if __name__ == "__main__":
    unittest.main()
