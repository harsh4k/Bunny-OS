"""
Single source of truth for the Ollama endpoint.

Ollama runs on the user's machine and is never bundled. The endpoint is
localhost by default and can be pointed elsewhere on the same box with
BUNNY_OLLAMA_HOST / BUNNY_OLLAMA_PORT (read once at process start).
"""
from __future__ import annotations

import os

DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 11434


def host() -> str:
    return (os.environ.get("BUNNY_OLLAMA_HOST") or "").strip() or DEFAULT_HOST


def port() -> int:
    try:
        value = int(os.environ.get("BUNNY_OLLAMA_PORT") or DEFAULT_PORT)
    except ValueError:
        return DEFAULT_PORT
    return value if 1 <= value <= 65535 else DEFAULT_PORT


def base_url() -> str:
    return f"http://{host()}:{port()}"
