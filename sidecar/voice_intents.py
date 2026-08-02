"""
Fast local intent matching for voice.

Obvious daily requests (time, date, open app, YouTube, Spotify, HTTPS URL) are
answered or acted on here without waiting on a reasoning model. Unmatched
phrases fall through to Ollama.

Keeps a short-lived dialog domain so follow-ups like "search sunflower" after
YouTube still resolve to youtube_search.
"""
from __future__ import annotations

import re
import time
from typing import Any

from local_actions import execute

_Result = dict[str, Any]

_DOMAIN_TTL_SECS = 90.0
_last_domain: str | None = None
_domain_ts: float = 0.0
_last_query: str | None = None

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
_YT = r"(?:youtube|yt|you\s*tube)"

_YOUTUBE_PLAY = re.compile(
    rf"(?:"
    rf"(?:please\s+)?{_PLAY_VERB}\s+(.+?)\s+on\s+{_YT}"
    rf"|{_YT}\s+{_PLAY_VERB}\s+(.+)"
    rf")$",
    re.IGNORECASE,
)
_YOUTUBE_SEARCH = re.compile(
    rf"(?:(?:please\s+)?(?:search(?:\s+on)?|find|look up)\s+(?:on\s+)?{_YT}(?:\s+for)?|"
    rf"{_YT}(?:\s+search)?(?:\s+for)?)\s+(.+)$",
    re.IGNORECASE,
)
_OPEN_YOUTUBE = re.compile(
    rf"^(?:please\s+)?(?:can you\s+|could you\s+)?"
    rf"(?:open|launch|start|run)\s+(?:{_YT}|you\s+tube)"
    rf"(?:\s+please|\s+for me)?$",
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
_FOLLOW_SEARCH = re.compile(
    # Bare "search …" only — "find/look up" stay free for Ollama / other intents.
    r"^(?:please\s+)?search(?:\s+for)?\s+(.+)$",
    re.IGNORECASE,
)
_PLAY_FIRST = re.compile(
    r"^(?:please\s+)?"
    r"(?:"
    r"(?:play|watch)\s+(?:the\s+)?(?:first|1st|top)(?:\s+(?:one|result|video|track|song))?"
    r"|(?:the\s+)?(?:first|1st)\s+(?:one|result|video)?"
    r"|(?:play|watch)\s+(?:it|that|this)"
    r")$",
    re.IGNORECASE,
)
_COMMANDISH = re.compile(
    r"^(?:please\s+)?(?:open|launch|search|find|look|play|watch|start|run|skip|pause|resume|"
    r"what|who|when|where|why|how|tell|show|next|previous|prev)\b",
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


def reset_dialog_domain() -> None:
    """Test helper — clear follow-up domain and query slot."""
    global _last_domain, _domain_ts, _last_query
    _last_domain = None
    _domain_ts = 0.0
    _last_query = None


def _set_domain(domain: str, query: str | None = None) -> None:
    global _last_domain, _domain_ts, _last_query
    _last_domain = domain
    _domain_ts = time.monotonic()
    if query is not None:
        cleaned = query.strip()[:200]
        _last_query = cleaned or None


def _clear_domain() -> None:
    global _last_domain, _domain_ts, _last_query
    _last_domain = None
    _domain_ts = 0.0
    _last_query = None


def _active_domain() -> str | None:
    if _last_domain is None:
        return None
    if time.monotonic() - _domain_ts > _DOMAIN_TTL_SECS:
        _clear_domain()
        return None
    return _last_domain


def match_intent(spoken: str) -> _Result | None:
    """
    Return a respond/action result if the phrase is unambiguous, else None.

    Action results are executed by the caller via local_actions.execute.
    """
    text = _normalize(spoken)
    if not text:
        return None

    if _TIME.search(text):
        _clear_domain()
        return {"kind": "respond", "text": execute({"action": "get_local_time"})}
    if _DATE.search(text):
        _clear_domain()
        return {"kind": "respond", "text": execute({"action": "get_local_date"})}
    if _SYSTEM.search(text):
        _clear_domain()
        return {"kind": "respond", "text": execute({"action": "show_system_summary"})}

    # Media keys before any "play …" pattern so bare "play" isn't lost.
    if _MEDIA_NEXT.match(text):
        _clear_domain()
        return {"kind": "action", "action": {"action": "media_next"}}
    if _MEDIA_PREV.match(text):
        _clear_domain()
        return {"kind": "action", "action": {"action": "media_prev"}}
    if _MEDIA_PLAY.match(text):
        _clear_domain()
        return {"kind": "action", "action": {"action": "media_play"}}

    url_match = _OPEN_URL.search(text)
    if url_match:
        url = url_match.group(1).rstrip(".,)!?")
        if "youtube.com" in url.lower() or "youtu.be" in url.lower():
            _set_domain("youtube")
        elif "spotify.com" in url.lower():
            _set_domain("spotify")
        else:
            _clear_domain()
        return {"kind": "action", "action": {"action": "open_url", "url": url}}

    if _OPEN_YOUTUBE.match(text):
        _set_domain("youtube")
        return {
            "kind": "action",
            "action": {"action": "open_url", "url": "https://www.youtube.com"},
        }

    if _SPOTIFY_OPEN.match(text):
        _set_domain("spotify")
        return {"kind": "action", "action": {"action": "spotify_open"}}

    sp_play = _SPOTIFY_PLAY.search(text)
    if sp_play:
        query = _first_group(sp_play)
        if query:
            # Keep "playlist" in the query so local_actions uses the playlist URI.
            if "playlist" in text.lower() and "playlist" not in query.lower():
                query = f"{query} playlist"
            _set_domain("spotify", query)
            return {
                "kind": "action",
                "action": {"action": "spotify_play", "query": query},
            }

    sp_search = _SPOTIFY_SEARCH.search(text)
    if sp_search:
        query = sp_search.group(1).strip().rstrip(".,!?")
        if query:
            _set_domain("spotify", query)
            return {
                "kind": "action",
                "action": {"action": "spotify_search", "query": query},
            }

    yt_play = _YOUTUBE_PLAY.search(text)
    if yt_play:
        query = _first_group(yt_play)
        if query:
            _set_domain("youtube", query)
            return {
                "kind": "action",
                "action": {"action": "youtube_play", "query": query},
            }

    yt = _YOUTUBE_SEARCH.search(text)
    if yt:
        query = yt.group(1).strip().rstrip(".,!?")
        if query:
            _set_domain("youtube", query)
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
        query = f"{name} {keyword}"
        _set_domain("spotify", query)
        return {
            "kind": "action",
            "action": {"action": "spotify_play", "query": query},
        }

    bare_video = _BARE_VIDEO.match(text)
    if bare_video:
        name = _clean_name(bare_video.group(1))
        if not name:
            return {"kind": "respond", "text": "Which video would you like?"}
        keyword = bare_video.group("kw").lower()
        query = f"{name} {keyword}"
        _set_domain("youtube", query)
        return {
            "kind": "action",
            "action": {"action": "youtube_play", "query": query},
        }

    # Follow-ups in the active dialog domain (e.g. "search sunflower" after YT).
    domain = _active_domain()
    if domain in ("youtube", "spotify"):
        if _PLAY_FIRST.match(text):
            if not _last_query:
                return {"kind": "respond", "text": "What should I search for first?"}
            query = _last_query
            _set_domain(domain, query)
            action = "youtube_play" if domain == "youtube" else "spotify_play"
            return {"kind": "action", "action": {"action": action, "query": query}}

        follow_search = _FOLLOW_SEARCH.match(text)
        if follow_search:
            query = follow_search.group(1).strip().rstrip(".,!?")
            if query and "youtube" not in query.lower() and "spotify" not in query.lower():
                _set_domain(domain, query)
                action = "youtube_search" if domain == "youtube" else "spotify_search"
                return {"kind": "action", "action": {"action": action, "query": query}}

        # Bare short query after open youtube/spotify → search that phrase.
        if (
            not _COMMANDISH.match(text)
            and not _OPEN_APP.match(text)
            and 1 <= len(text.split()) <= 5
            and len(text) <= 60
            and "youtube" not in text.lower()
            and "spotify" not in text.lower()
        ):
            query = text.strip().rstrip(".,!?")
            _set_domain(domain, query)
            action = "youtube_search" if domain == "youtube" else "spotify_search"
            return {"kind": "action", "action": {"action": action, "query": query}}

    app = _OPEN_APP.match(text)
    if app and not _MEDIA_WORDS.search(text):
        name = _clean_name(app.group("name"))
        lower = name.lower()
        if name and "youtube" not in lower and lower not in ("yt", "you tube") and lower != "spotify":
            _clear_domain()
            return {
                "kind": "action",
                "action": {"action": "open_app", "app_name": name},
            }

    # Unmatched → Ollama. Drop dialog domain so it can't hijack a later "search …".
    _clear_domain()
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
