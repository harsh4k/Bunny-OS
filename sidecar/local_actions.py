"""
Local allowlisted actions the sidecar can run without the Rust broker.

Used by the voice path (which never reaches ChatPanel's execute button) and by
in-process tool resolution for time/date/system summary. open_* uses Win32
ShellExecute via os.startfile — never cmd.exe / powershell.
"""
from __future__ import annotations

import os
import re
from datetime import datetime
from pathlib import Path
from urllib.parse import quote, quote_plus

from chat_handler import (
    MAX_APP_NAME_LEN,
    MAX_QUERY_LEN,
    _BAD_APP_CHARS,
    _build_action,
)

_MAX_URL_LEN = 2048
_MAX_START_MENU_DEPTH = 8
_MAX_START_MENU_ENTRIES = 2_000

# Spoken / casual names → Start Menu .lnk stems (lowercase).
_APP_ALIASES: dict[str, str] = {
    "spotify": "spotify",
    "chrome": "google chrome",
    "google chrome": "google chrome",
    "edge": "microsoft edge",
    "microsoft edge": "microsoft edge",
    "vscode": "visual studio code",
    "vs code": "visual studio code",
    "visual studio code": "visual studio code",
    "notepad": "notepad",
    "calculator": "calculator",
    "calc": "calculator",
    "explorer": "file explorer",
    "file explorer": "file explorer",
    "discord": "discord",
    "slack": "slack",
    "telegram": "telegram",
    "whatsapp": "whatsapp",
    "firefox": "firefox",
    "brave": "brave",
    "obsidian": "obsidian",
}

# YouTube "Videos" filter (sp=EgIQAQ%3D%3D).
_YT_VIDEOS_FILTER = "EgIQAQ%3D%3D"


def execute(action: dict) -> str:
    """Run one validated action dict. Returns a short spoken/status string."""
    kind = action.get("action")
    if kind == "get_local_time":
        now = datetime.now()
        hour = now.strftime("%I").lstrip("0") or "12"
        return f"It's {hour}:{now.strftime('%M %p')}."
    if kind == "get_local_date":
        return datetime.now().strftime("Today is %A, %B %d, %Y.")
    if kind == "show_system_summary":
        return _system_summary()
    if kind == "open_app":
        return _open_app(str(action.get("app_name", "")))
    if kind == "open_url":
        return _open_url(str(action.get("url", "")))
    if kind == "youtube_search":
        return _youtube_search(str(action.get("query", "")))
    if kind == "youtube_play":
        return _youtube_play(str(action.get("query", "")))
    if kind == "spotify_open":
        return _spotify_open()
    if kind == "spotify_search":
        return _spotify_search(str(action.get("query", "")))
    if kind == "spotify_play":
        return _spotify_play(str(action.get("query", "")))
    if kind == "media_play":
        return _media_play()
    if kind == "media_next":
        return _media_next()
    if kind == "media_prev":
        return _media_prev()
    raise ValueError(f"Unsupported local action: {kind!r}")


def execute_validated(name: str, args: dict) -> str:
    """Validate via chat_handler then execute — for tool-call resolution."""
    return execute(_build_action(name, args))


# ── open helpers ──────────────────────────────────────────────────────────────


def _open_app(app_name: str) -> str:
    name = app_name.strip()
    if not name or len(name) > MAX_APP_NAME_LEN:
        raise ValueError(f"app_name must be 1-{MAX_APP_NAME_LEN} characters")
    bad = sorted({c for c in name if c in _BAD_APP_CHARS})
    if bad:
        raise ValueError(f"app_name contains invalid characters: {bad!r}")
    path = _resolve_start_menu_app(name)
    os.startfile(path)  # noqa: S606 — ShellExecuteW, not a shell
    return f"Opening {name}."


def _open_url(url: str) -> str:
    _validate_https(url)
    os.startfile(url)  # noqa: S606
    domain = url.removeprefix("https://").split("/", 1)[0]
    return f"Opening {domain}."


def _youtube_search(query: str) -> str:
    q = _require_query(query)
    url = f"https://www.youtube.com/results?search_query={quote_plus(q)}"
    os.startfile(url)  # noqa: S606
    return f"Searching YouTube for {q}."


def _youtube_play(query: str) -> str:
    q = _require_query(query)
    from youtube_resolve import first_video_id, watch_url

    video_id = first_video_id(q)
    if video_id:
        url = watch_url(video_id)
        _validate_https(url)
        os.startfile(url)  # noqa: S606
        return f"Playing {q} on YouTube."

    # Fallback when the page shape changes or the network flakes.
    url = (
        f"https://www.youtube.com/results?search_query={quote_plus(q)}"
        f"&sp={_YT_VIDEOS_FILTER}"
    )
    os.startfile(url)  # noqa: S606
    return f"Opening YouTube results for {q}."


def _spotify_open() -> str:
    # Prefer the protocol handler; fall back to Start Menu if unregistered.
    try:
        os.startfile("spotify:")  # noqa: S606
    except OSError:
        path = _resolve_start_menu_app("Spotify")
        os.startfile(path)  # noqa: S606
    return "Opening Spotify."


def _media_play() -> str:
    from media_keys import media_play_pause

    media_play_pause()
    return "Toggling play."


def _media_next() -> str:
    from media_keys import media_next

    media_next()
    return "Skipping to the next track."


def _media_prev() -> str:
    from media_keys import media_prev

    media_prev()
    return "Going to the previous track."


def _spotify_search(query: str) -> str:
    q = _require_query(query)
    _open_spotify_uri(f"spotify:search:{quote(q, safe='')}")
    return f"Searching Spotify for {q}."


def _spotify_play(query: str) -> str:
    raw = query.strip()
    if not raw or len(raw) > MAX_QUERY_LEN:
        raise ValueError(f"query must be 1-{MAX_QUERY_LEN} characters")

    if raw.lower().startswith("spotify:"):
        _validate_spotify_uri(raw)
        os.startfile(raw)  # noqa: S606
        return "Opening that in Spotify."

    if raw.lower().startswith("https://open.spotify.com/"):
        _validate_https(raw)
        if not _is_open_spotify_host(raw):
            raise ValueError("Only https://open.spotify.com links are allowed")
        os.startfile(raw)  # noqa: S606
        return "Opening that in Spotify."

    # Bare http(s) / other schemes must not become a Spotify search string.
    if "://" in raw:
        raise ValueError("Only spotify: URIs or https://open.spotify.com links are allowed")

    # Spotify has no `playlist:` search filter — `spotify:search:playlist:chill`
    # searches for that literal text and returns junk. Keeping the bare word in
    # the query is what actually ranks playlists first.
    #
    # Starting playback needs an authenticated Web API call, so these URIs land
    # on results and the caller must not claim the track is playing.
    playlist = _playlist_query(raw)
    if playlist is not None:
        _open_spotify_uri(f"spotify:search:{quote(f'{playlist} playlist', safe='')}")
        return f"Showing {playlist} playlists in Spotify."

    _open_spotify_uri(f"spotify:search:{quote(raw, safe='')}")
    return f"Showing {raw} in Spotify."


def _playlist_query(raw: str) -> str | None:
    """If the query is clearly a playlist ask, return the playlist name."""
    text = raw.strip()
    match = re.match(
        r"^(?:my\s+)?(.+?)\s+playlist$",
        text,
        flags=re.IGNORECASE,
    )
    if match:
        return match.group(1).strip()
    if re.search(r"\bplaylist\b", text, flags=re.IGNORECASE):
        cleaned = re.sub(r"\bplaylist\b", "", text, flags=re.IGNORECASE)
        cleaned = re.sub(r"\s+", " ", cleaned).strip(" -")
        return cleaned or text
    return None


def _open_spotify_uri(uri: str) -> None:
    _validate_spotify_uri(uri)
    os.startfile(uri)  # noqa: S606


def _validate_spotify_uri(uri: str) -> None:
    if len(uri) > _MAX_URL_LEN:
        raise ValueError(f"URI too long ({len(uri)} chars, max {_MAX_URL_LEN})")
    if not uri.startswith("spotify:"):
        raise ValueError("Only spotify: URIs are allowed")
    # Reject credentials-style or scheme smuggling (spotify://, spotify:http:…).
    rest = uri[len("spotify:") :]
    if rest.startswith("//") or "://" in rest:
        raise ValueError("Malformed Spotify URI")
    if any(ord(c) < 0x20 or ord(c) == 0x7F for c in uri):
        raise ValueError("URI contains control characters")
    if not re.fullmatch(r"[A-Za-z0-9_\-:%./+?=,&]*", uri):
        raise ValueError("Spotify URI contains disallowed characters")


def _is_open_spotify_host(url: str) -> bool:
    after = url.removeprefix("https://")
    host = after.split("/", 1)[0].lower()
    return host == "open.spotify.com"


def _require_query(query: str) -> str:
    q = query.strip()
    if not q or len(q) > MAX_QUERY_LEN:
        raise ValueError(f"query must be 1-{MAX_QUERY_LEN} characters")
    return q


def _validate_https(url: str) -> None:
    if len(url) > _MAX_URL_LEN:
        raise ValueError(f"URL too long ({len(url)} chars, max {_MAX_URL_LEN})")
    if not url.startswith("https://"):
        raise ValueError("Only HTTPS URLs are allowed")
    after = url.removeprefix("https://")
    host = after.split("/", 1)[0]
    if "@" in host:
        raise ValueError("URL credentials are not allowed")
    if any(ord(c) < 0x20 or ord(c) == 0x7F for c in url):
        raise ValueError("URL contains control characters")


def _resolve_start_menu_app(app_name: str) -> str:
    apps = _discover_start_menu_apps()
    key = app_name.lower().strip()
    alias = _APP_ALIASES.get(key, key)

    if alias in apps:
        return apps[alias]
    if key in apps:
        return apps[key]

    # Prefer prefix, then containment.
    prefix = [p for name, p in apps.items() if name.startswith(alias)]
    if len(prefix) == 1:
        return prefix[0]
    hits = [p for name, p in apps.items() if alias in name or name in alias]
    if len(hits) == 1:
        return hits[0]

    needle = alias[:4] if len(alias) >= 4 else alias
    suggestions = sorted(n for n in apps if needle in n)[:5]
    if suggestions:
        raise ValueError(
            f"App '{app_name}' not found. Did you mean: {', '.join(suggestions)}?"
        )
    raise ValueError(f"App '{app_name}' not found in Start Menu. Check the spelling.")


def _discover_start_menu_apps() -> dict[str, str]:
    apps: dict[str, str] = {}
    for env in ("APPDATA", "PROGRAMDATA"):
        base = os.environ.get(env, "")
        if not base:
            continue
        root = Path(base) / "Microsoft" / "Windows" / "Start Menu" / "Programs"
        _collect_lnk(root, apps, 0)
    return apps


def _collect_lnk(dir_path: Path, apps: dict[str, str], depth: int) -> None:
    if depth > _MAX_START_MENU_DEPTH or len(apps) >= _MAX_START_MENU_ENTRIES:
        return
    try:
        entries = list(dir_path.iterdir())
    except OSError:
        return
    for entry in entries:
        if len(apps) >= _MAX_START_MENU_ENTRIES:
            return
        try:
            if entry.is_symlink():
                continue
            if entry.is_dir():
                _collect_lnk(entry, apps, depth + 1)
            elif entry.suffix.lower() == ".lnk":
                apps.setdefault(entry.stem.lower(), str(entry))
        except OSError:
            continue


def _system_summary() -> str:
    import platform

    ram = ""
    try:
        import ctypes

        class MEMORYSTATUSEX(ctypes.Structure):
            _fields_ = [
                ("dwLength", ctypes.c_ulong),
                ("dwMemoryLoad", ctypes.c_ulong),
                ("ullTotalPhys", ctypes.c_ulonglong),
                ("ullAvailPhys", ctypes.c_ulonglong),
                ("ullTotalPageFile", ctypes.c_ulonglong),
                ("ullAvailPageFile", ctypes.c_ulonglong),
                ("ullTotalVirtual", ctypes.c_ulonglong),
                ("ullAvailVirtual", ctypes.c_ulonglong),
                ("sullAvailExtendedVirtual", ctypes.c_ulonglong),
            ]

        stat = MEMORYSTATUSEX()
        stat.dwLength = ctypes.sizeof(MEMORYSTATUSEX)
        if ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(stat)):
            gb = round(stat.ullTotalPhys / (1024**3))
            ram = f", {gb} GB RAM"
    except Exception:  # noqa: BLE001
        ram = ""
    return f"You're on {platform.system()} {platform.release()}, {platform.machine()}{ram}."
