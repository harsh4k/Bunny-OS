"""
Bunny OS inventory — thin public-API facade.

Combines hardware, Ollama, and app-catalog scans into a single serialisable
dict.  Subsystem implementations live in hw_probe, ollama_client, and
app_catalog so each file stays under 300 lines.
"""
from __future__ import annotations

from dataclasses import dataclass, asdict
from typing import Any

from hw_probe import get_hardware, GpuInfo, HardwareInfo              # noqa: F401
from ollama_client import get_ollama_status, OllamaModel, OllamaStatus  # noqa: F401
from app_catalog import get_app_catalog, InstalledApp                 # noqa: F401


@dataclass
class InventoryResult:
    hardware: HardwareInfo
    ollama: OllamaStatus
    apps: list[InstalledApp]


def get_inventory() -> dict[str, Any]:
    """Run all scans and return a JSON-serialisable inventory dict."""
    return asdict(InventoryResult(
        hardware=get_hardware(),
        ollama=get_ollama_status(),
        apps=get_app_catalog(),
    ))
