"""
Wake phrase helpers — any user text, default "hey bunny".

Works on Windows and macOS. Detection itself lives in wake_word.py;
this module only normalizes, matches, validates, and persists settings.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

from paths import wake_dir

DEFAULT_PHRASE = "hey bunny"
MAX_PHRASE_CHARS = 48
_SETTINGS_NAME = "settings.json"
# Letters, digits, spaces, hyphen, apostrophe — enough for "hey bunny" / "ok jarvis".
_PHRASE_OK = re.compile(r"^[a-z0-9][a-z0-9 '\-]{0,46}[a-z0-9]$|^[a-z0-9]$", re.I)
_NON_WORD = re.compile(r"[^a-z0-9\s]+")
_SPACE = re.compile(r"\s+")


def normalize_phrase(text: str) -> str:
    cleaned = _NON_WORD.sub(" ", (text or "").lower())
    return _SPACE.sub(" ", cleaned).strip()


def validate_phrase(text: str) -> str:
    """Return a normalized phrase or raise ValueError."""
    phrase = normalize_phrase(text)
    if not phrase:
        raise ValueError("Wake phrase cannot be empty")
    if len(phrase) > MAX_PHRASE_CHARS:
        raise ValueError(f"Wake phrase must be ≤ {MAX_PHRASE_CHARS} characters")
    if not _PHRASE_OK.match(phrase):
        raise ValueError("Wake phrase may only use letters, numbers, spaces, hyphen, apostrophe")
    return phrase


def phrase_matches(transcript: str, phrase: str) -> bool:
    """True when the wake phrase appears as a contiguous word sequence."""
    hay = normalize_phrase(transcript)
    needle = normalize_phrase(phrase)
    if not hay or not needle:
        return False
    if hay == needle or hay.startswith(needle + " ") or hay.endswith(" " + needle):
        return True
    return f" {needle} " in f" {hay} "


def settings_path() -> Path:
    return wake_dir() / _SETTINGS_NAME


def load_settings() -> dict:
    path = settings_path()
    defaults = {
        "phrase": DEFAULT_PHRASE,
        "sensitivity": 0.5,
        "cooldown_secs": 2.0,
        "enabled": False,
    }
    if not path.is_file():
        return defaults
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return defaults
    if not isinstance(raw, dict):
        return defaults
    out = dict(defaults)
    try:
        if "phrase" in raw:
            candidate = str(raw["phrase"]).strip()
            if "_" in candidate and " " not in candidate:
                out["phrase"] = candidate.lower()
            else:
                out["phrase"] = validate_phrase(candidate)
    except ValueError:
        pass
    if isinstance(raw.get("sensitivity"), (int, float)):
        out["sensitivity"] = float(raw["sensitivity"])
    if isinstance(raw.get("cooldown_secs"), (int, float)):
        out["cooldown_secs"] = float(raw["cooldown_secs"])
    if isinstance(raw.get("enabled"), bool):
        out["enabled"] = raw["enabled"]
    elif raw.get("enabled") in (0, 1, "0", "1"):
        out["enabled"] = raw["enabled"] in (1, "1")
    return out


def save_settings(
    phrase: str,
    sensitivity: float,
    cooldown_secs: float,
    *,
    enabled: bool | None = None,
) -> None:
    directory = wake_dir()
    directory.mkdir(parents=True, exist_ok=True)
    # Model stems (hey_jarvis) keep underscores; free text is normalized.
    cleaned = phrase.strip()
    if "_" in cleaned and " " not in cleaned:
        stored = cleaned.lower()
    else:
        stored = validate_phrase(cleaned)
    previous = load_settings()
    want_enabled = previous["enabled"] if enabled is None else bool(enabled)
    payload = {
        "phrase": stored,
        "sensitivity": float(sensitivity),
        "cooldown_secs": float(cooldown_secs),
        "enabled": want_enabled,
    }
    settings_path().write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
