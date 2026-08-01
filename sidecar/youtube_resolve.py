"""
Resolve a YouTube search query to the first watchable video id.

User-triggered only (youtube_play). Uses a single HTTPS GET to youtube.com —
same host the browser already opens — with no API key, cookies, or tracking
params. Falls back to None so the caller can open the results page instead.
"""
from __future__ import annotations

import http.client
import re
import ssl
from urllib.parse import quote_plus

_TIMEOUT_SECS = 12
_MAX_BYTES = 900_000
_VIDEO_ID = re.compile(r'"videoId":"([A-Za-z0-9_-]{11})"')
_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/128.0.0.0 Safari/537.36"
)


def first_video_id(query: str) -> str | None:
    """Return the first video id for a search query, or None on failure."""
    q = (query or "").strip()
    if not q:
        return None
    path = f"/results?search_query={quote_plus(q)}&sp=EgIQAQ%3D%3D"
    try:
        ctx = ssl.create_default_context()
        conn = http.client.HTTPSConnection(
            "www.youtube.com", timeout=_TIMEOUT_SECS, context=ctx
        )
        try:
            conn.request(
                "GET",
                path,
                headers={
                    "User-Agent": _UA,
                    "Accept-Language": "en-GB,en;q=0.9",
                    "Accept": "text/html",
                },
            )
            resp = conn.getresponse()
            if resp.status != 200:
                return None
            raw = resp.read(_MAX_BYTES + 1)
        finally:
            conn.close()
    except (OSError, http.client.HTTPException, TimeoutError):
        return None

    if len(raw) > _MAX_BYTES:
        raw = raw[:_MAX_BYTES]
    text = raw.decode("utf-8", errors="replace")
    match = _VIDEO_ID.search(text)
    return match.group(1) if match else None


def watch_url(video_id: str) -> str:
    return f"https://www.youtube.com/watch?v={video_id}&autoplay=1"
