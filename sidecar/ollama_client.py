"""
Ollama HTTP client for Bunny OS sidecar.

Fetches installed and running model lists from a locally running Ollama
instance.  All HTTP calls use bounded timeout (5 s) and response size
(1 MiB).  Response shapes are validated strictly; callers receive typed
dataclasses or a graceful None/empty-list on failure.
"""
from __future__ import annotations

import json
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any

import ollama_config

MAX_RESPONSE_BYTES = 1 * 1024 * 1024   # 1 MiB cap
OLLAMA_TIMEOUT_SECS = 5
_BASE = ollama_config.base_url()


# ── Data classes ──────────────────────────────────────────────────────────────

@dataclass
class OllamaModel:
    name: str
    size_gb: float
    quantization: str | None


@dataclass
class OllamaStatus:
    reachable: bool
    version: str | None
    models: list[OllamaModel]
    running: list[str]


# ── Public API ────────────────────────────────────────────────────────────────

def get_ollama_status() -> OllamaStatus:
    models = _fetch_ollama_models()
    if models is None:
        return OllamaStatus(reachable=False, version=None, models=[], running=[])
    return OllamaStatus(
        reachable=True,
        version=None,
        models=models,
        running=_fetch_ollama_running(),
    )


# ── HTTP fetch ────────────────────────────────────────────────────────────────

def _fetch_json(url: str) -> Any:
    """GET url; raise ValueError if response exceeds 1 MiB."""
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=OLLAMA_TIMEOUT_SECS) as resp:
        raw = resp.read(MAX_RESPONSE_BYTES + 1)
        if len(raw) > MAX_RESPONSE_BYTES:
            raise ValueError(f"response too large (>{MAX_RESPONSE_BYTES} bytes)")
        return json.loads(raw)


# ── /api/tags parsing ─────────────────────────────────────────────────────────

def _parse_tags_response(data: Any) -> list[OllamaModel]:
    """Strict validation of /api/tags shape; raises ValueError on bad input."""
    if not isinstance(data, dict):
        raise ValueError("expected JSON object from /api/tags")
    models_raw = data.get("models")
    if not isinstance(models_raw, list):
        raise ValueError("/api/tags missing 'models' list")
    result: list[OllamaModel] = []
    for item in models_raw[:100]:
        if not isinstance(item, dict):
            continue
        name = item.get("name")
        size = item.get("size")
        if not isinstance(name, str) or not isinstance(size, (int, float)):
            continue
        quant: str | None = None
        details = item.get("details")
        if isinstance(details, dict):
            q = details.get("quantization_level")
            if isinstance(q, str):
                quant = q
        result.append(OllamaModel(
            name=name,
            size_gb=round(size / (1024 ** 3), 2),
            quantization=quant,
        ))
    return result


# ── /api/ps parsing ───────────────────────────────────────────────────────────

def _parse_ps_response(data: Any) -> list[str]:
    """Strict validation of /api/ps shape; returns running model names."""
    if not isinstance(data, dict):
        raise ValueError("expected JSON object from /api/ps")
    models_raw = data.get("models")
    if not isinstance(models_raw, list):
        return []
    return [
        item["name"]
        for item in models_raw[:20]
        if isinstance(item, dict) and isinstance(item.get("name"), str)
    ]


# ── Internal helpers ──────────────────────────────────────────────────────────

def _fetch_ollama_models() -> list[OllamaModel] | None:
    try:
        return _parse_tags_response(_fetch_json(f"{_BASE}/api/tags"))
    except (urllib.error.URLError, OSError, ValueError, json.JSONDecodeError):
        return None


def _fetch_ollama_running() -> list[str]:
    try:
        return _parse_ps_response(_fetch_json(f"{_BASE}/api/ps"))
    except (urllib.error.URLError, OSError, ValueError, json.JSONDecodeError):
        return []
