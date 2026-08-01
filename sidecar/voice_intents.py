"""
Fast local intent matching for voice.

Obvious daily requests (time, date, open app, YouTube, Spotify, HTTPS URL) are
answered or acted on here without waiting on a reasoning model. Unmatched
phrases fall through to Ollama.
"""
from __future__ import annotations

import re
from typing import Any

from local_actions import execute

_Result = dict[str, Any]

_TIME = re.compile(
    r"\b("
    r"what(?:'s| is) the time"
    r"|what time is it(?:\s+(?:right\s+now|rn|now))?"
    r"|tell me(?: the)? time"
    r"|current time"
    r"|time is it"
    r")\b",
    re.IGNORECASE,
)
_DATE = re.compile(
    r"\b("
    r"what(?:'s| is)(?: the)?(?: today'?s)? date"
    r"|what day is it"
    r"|what(?:'s| is) today"
    r"|today'?s date"
    r")\b",
    re.IGNORECASE,
)
# "start" is a play verb far more often than an app verb, so media patterns
# must be tried before _OPEN_APP ever sees the phrase.
_PLAY_VERB = r"(?:play|watch|start|put\s+on)"

_YOUTUBE_PLAY = re.compile(
    rf"(?:"
    rf"(?:please\s+)?{_PLAY_VERB}\s+(.+?)\s+on\s+youtube"
    rf"|youtube\s+{_PLAY_VERB}\s+(.+)"
    rf")$",
    re.IGNORECASE,
)
_YOUTUBE_SEARCH = re.compile(
    r"(?:(?:please\s+)?(?:search(?:\s+on)?|find|look up)\s+(?:on\s+)?youtube(?:\s+for)?|"
    r"youtube(?:\s+search)?(?:\s+for)?)\s+(.+)$",
    re.IGNORECASE,
)
_SPOTIFY_PLAY = re.compile(
    rf"(?:"
    # Prefer the playlist phrasing so "chill playlist" is not captured whole.
    rf"(?:please\s+)?{_PLAY_VERB}\s+(?:my\s+)?(.+?)\s+playlist\s+on\s+spotify"
    rf"|(?:please\s+)?{_PLAY_VERB}\s+(.+?)\s+on\s+spotify"
    rf"|spotify\s+{_PLAY_VERB}\s+(.+)"
    rf")$",
    re.IGNORECASE,
)
# No service named: "start the chill playlist", "play a lofi video".
# The media word is captured too — it belongs in the search query ("interstellar
# trailer" ≠ "interstellar") and an empty name means the ask was unspecific.
_BARE_PLAYLIST = re.compile(
    rf"^(?:please\s+)?{_PLAY_VERB}\s+(.*?)\s*"
    rf"(?P<kw>playlist|album|music|songs?)$",
    re.IGNORECASE,
)
_BARE_VIDEO = re.compile(
    rf"^(?:please\s+)?{_PLAY_VERB}\s+(.*?)\s*"
    rf"(?P<kw>video|trailer)$",
    re.IGNORECASE,
)
# An app is never named after media, so these words veto _OPEN_APP.
_MEDIA_WORDS = re.compile(
    r"\b(playlist|song|songs|track|album|video|movie|episode|music|podcast|trailer)\b",
    re.IGNORECASE,
)
_ARTICLE = re.compile(r"^(?:the|my|a|an|some|that|this)(?:\s+|$)", re.IGNORECASE)
_SPOTIFY_SEARCH = re.compile(
    r"(?:(?:please\s+)?(?:search(?:\s+on)?|find|look up)\s+(?:on\s+)?spotify(?:\s+for)?|"
    r"spotify(?:\s+search)?(?:\s+for)?)\s+(.+)$",
    re.IGNORECASE,
)
_SPOTIFY_OPEN = re.compile(
    r"^(?:please\s+)?(?:can you\s+|could you\s+)?"
    r"(?:open|launch|start|run)\s+spotify"
    r"(?:\s+please|\s+for me)?$",
    re.IGNORECASE,
)
_OPEN_URL = re.compile(
    r"(?:(?:please\s+)?(?:open|go to|visit|launch)\s+)(https://\S+)",
    re.IGNORECASE,
)
_OPEN_APP = re.compile(
    r"^(?:please\s+)?(?:can you\s+|could you\s+)?"
    r"(?:open|launch|start|run)\s+(?P<name>.+?)"
    r"(?:\s+please|\s+for me)?$",
    re.IGNORECASE,
)
_SYSTEM = re.compile(
    r"\b("
    r"system summary"
    r"|system (?:info|information|specs)"
    r"|about (?:this )?(?:pc|computer|machine)"
    r"|what(?:'s| is) (?:my|this) (?:pc|computer|system)"
    r")\b",
    re.IGNORECASE,
)
# Win32 media keys — last-playing track in Spotify (or whatever holds focus).
_MEDIA_NEXT = re.compile(
    r"^(?:please\s+)?(?:can you\s+|could you\s+)?"
    r"(?:next(?:\s+(?:song|track|one))?"
    r"|skip(?:\s+(?:this\s+)?(?:song|track|one))?"
    r"|skip\s+(?:to\s+)?(?:the\s+)?next"
    r")(?:\s+please|\s+for me)?$",
    re.IGNORECASE,
)
_MEDIA_PREV = re.compile(
    r"^(?:please\s+)?(?:can you\s+|could you\s+)?"
    r"(?:(?:previous|prev|last)(?:\s+(?:song|track|one))?"
    r"|go\s+back(?:\s+(?:a\s+)?(?:song|track))?"
    r"|replay(?:\s+(?:this\s+)?(?:song|track))?"
    r")(?:\s+please|\s+for me)?$",
    re.IGNORECASE,
)
_MEDIA_PLAY = re.compile(
    r"^(?:please\s+)?(?:can you\s+|could you\s+)?"
    r"(?:play(?:\s+(?:music|my\s+music|something))?"
    r"|resume(?:\s+(?:music|playback|playing))?"
    r"|pause(?:\s+(?:music|playback|the\s+(?:song|track|music))?)?"
    r"|unpause"
    r"|toggle\s+play(?:back)?"
    r")(?:\s+please|\s+for me)?$",
    re.IGNORECASE,
)

# Strip filler the STT often appends.
_FILLER = re.compile(
    r"^(hey\s+)?(bunny|bun)\s*[,.]?\s*|^um+\s+|^uh+\s+",
    re.IGNORECASE,
)


def match_intent(spoken: str) -> _Result | None:
    """
    Return a respond/action result if the phrase is unambiguous, else None.

    Action results are executed by the caller via local_actions.execute.
    """
    text = _normalize(spoken)
    if not text:
        return None

    if _TIME.search(text):
        return {"kind": "respond", "text": execute({"action": "get_local_time"})}
    if _DATE.search(text):
        return {"kind": "respond", "text": execute({"action": "get_local_date"})}
    if _SYSTEM.search(text):
        return {"kind": "respond", "text": execute({"action": "show_system_summary"})}

    # Media keys before any "play …" pattern so bare "play" isn't lost.
    if _MEDIA_NEXT.match(text):
        return {"kind": "action", "action": {"action": "media_next"}}
    if _MEDIA_PREV.match(text):
        return {"kind": "action", "action": {"action": "media_prev"}}
    if _MEDIA_PLAY.match(text):
        return {"kind": "action", "action": {"action": "media_play"}}

    url_match = _OPEN_URL.search(text)
    if url_match:
        url = url_match.group(1).rstrip(".,)!?")
        return {"kind": "action", "action": {"action": "open_url", "url": url}}

    if _SPOTIFY_OPEN.match(text):
        return {"kind": "action", "action": {"action": "spotify_open"}}

    sp_play = _SPOTIFY_PLAY.search(text)
    if sp_play:
        query = _first_group(sp_play)
        if query:
            # Keep "playlist" in the query so local_actions uses the playlist URI.
            if "playlist" in text.lower() and "playlist" not in query.lower():
                query = f"{query} playlist"
            return {
                "kind": "action",
                "action": {"action": "spotify_play", "query": query},
            }

    sp_search = _SPOTIFY_SEARCH.search(text)
    if sp_search:
        query = sp_search.group(1).strip().rstrip(".,!?")
        if query:
            return {
                "kind": "action",
                "action": {"action": "spotify_search", "query": query},
            }

    yt_play = _YOUTUBE_PLAY.search(text)
    if yt_play:
        query = _first_group(yt_play)
        if query:
            return {
                "kind": "action",
                "action": {"action": "youtube_play", "query": query},
            }

    yt = _YOUTUBE_SEARCH.search(text)
    if yt:
        query = yt.group(1).strip().rstrip(".,!?")
        if query:
            return {
                "kind": "action",
                "action": {"action": "youtube_search", "query": query},
            }

    bare_playlist = _BARE_PLAYLIST.match(text)
    if bare_playlist:
        name = _clean_name(bare_playlist.group(1))
        if not name:
            return {"kind": "respond", "text": "Which playlist would you like?"}
        keyword = bare_playlist.group("kw").lower()
        return {
            "kind": "action",
            "action": {"action": "spotify_play", "query": f"{name} {keyword}"},
        }

    bare_video = _BARE_VIDEO.match(text)
    if bare_video:
        name = _clean_name(bare_video.group(1))
        if not name:
            return {"kind": "respond", "text": "Which video would you like?"}
        keyword = bare_video.group("kw").lower()
        return {
            "kind": "action",
            "action": {"action": "youtube_play", "query": f"{name} {keyword}"},
        }

    app = _OPEN_APP.match(text)
    if app and not _MEDIA_WORDS.search(text):
        name = _clean_name(app.group("name"))
        lower = name.lower()
        if name and "youtube" not in lower and lower != "spotify":
            return {
                "kind": "action",
                "action": {"action": "open_app", "app_name": name},
            }

    return None


def _clean_name(raw: str) -> str:
    """Strip trailing punctuation and any stacked leading articles."""
    name = raw.strip().rstrip(".,!?")
    while True:
        stripped = _ARTICLE.sub("", name).strip()
        if stripped == name:
            return name
        name = stripped


def _first_group(match: re.Match[str]) -> str:
    for group in match.groups():
        if group:
            return group.strip().rstrip(".,!?")
    return ""


def _normalize(spoken: str) -> str:
    text = " ".join(spoken.strip().split())
    text = _FILLER.sub("", text).strip()
    return text.rstrip(".!?")
