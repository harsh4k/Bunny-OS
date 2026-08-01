"""
Deterministic Ollama model advisor for Bunny OS.

Catalog version "1" — bump CATALOG_VERSION when adding/removing candidates.

The advise() function is a pure function of hardware inventory, so the
same inputs always produce the same outputs (deterministic / reproducible).

Tiers:
  fast     — ≤ 2 GB disk, CPU-viable (min_vram_gb == 0.0)
  balanced — 3–6 GB disk, needs 4–6 GB VRAM
  quality  — 7+ GB disk, needs 8+ GB VRAM
"""
from __future__ import annotations

from dataclasses import dataclass, asdict
from typing import Any

CATALOG_VERSION = "1"


# ── Candidate catalog ─────────────────────────────────────────────────────────

@dataclass(frozen=True)
class Candidate:
    name: str           # exact Ollama tag (e.g. "llama3.2:1b-instruct-q4_K_M")
    display_name: str
    size_gb: float      # quantized size on disk / in VRAM
    context_k: int      # context window in thousands of tokens
    quantization: str
    tier: str           # "fast" | "balanced" | "quality"
    min_vram_gb: float  # 0.0 = CPU-viable
    min_ram_gb: float   # minimum system RAM


# Versioned catalog — bump CATALOG_VERSION on any change.
CANDIDATES: tuple[Candidate, ...] = (
    # ── Fast (CPU-viable, ≤ 2 GB VRAM) ───────────────────────────────────────
    Candidate(
        name="qwen2.5:0.5b-instruct-q4_K_M",
        display_name="Qwen 2.5 0.5B",
        size_gb=0.4, context_k=2, quantization="Q4_K_M",
        tier="fast", min_vram_gb=0.0, min_ram_gb=4.0,
    ),
    Candidate(
        name="llama3.2:1b-instruct-q4_K_M",
        display_name="Llama 3.2 1B",
        size_gb=0.8, context_k=2, quantization="Q4_K_M",
        tier="fast", min_vram_gb=0.0, min_ram_gb=4.0,
    ),
    Candidate(
        name="llama3.2:3b-instruct-q4_K_M",
        display_name="Llama 3.2 3B",
        size_gb=2.0, context_k=4, quantization="Q4_K_M",
        tier="fast", min_vram_gb=2.5, min_ram_gb=6.0,
    ),
    Candidate(
        name="phi3.5:3.8b-mini-instruct-q4_K_M",
        display_name="Phi 3.5 Mini 3.8B",
        size_gb=2.3, context_k=4, quantization="Q4_K_M",
        tier="fast", min_vram_gb=2.5, min_ram_gb=6.0,
    ),
    # ── Balanced (4–8 GB VRAM) ────────────────────────────────────────────────
    Candidate(
        name="mistral:7b-instruct-q4_K_M",
        display_name="Mistral 7B",
        size_gb=4.4, context_k=8, quantization="Q4_K_M",
        tier="balanced", min_vram_gb=5.0, min_ram_gb=8.0,
    ),
    Candidate(
        name="llama3.1:8b-instruct-q4_K_M",
        display_name="Llama 3.1 8B",
        size_gb=4.9, context_k=8, quantization="Q4_K_M",
        tier="balanced", min_vram_gb=5.0, min_ram_gb=8.0,
    ),
    Candidate(
        name="gemma2:9b-instruct-q4_K_M",
        display_name="Gemma 2 9B",
        size_gb=5.4, context_k=8, quantization="Q4_K_M",
        tier="balanced", min_vram_gb=6.0, min_ram_gb=12.0,
    ),
    # ── Quality (8+ GB VRAM) ──────────────────────────────────────────────────
    Candidate(
        name="phi4:14b-instruct-q4_K_M",
        display_name="Phi-4 14B",
        size_gb=8.4, context_k=16, quantization="Q4_K_M",
        tier="quality", min_vram_gb=9.0, min_ram_gb=16.0,
    ),
    Candidate(
        name="qwen2.5:14b-instruct-q4_K_M",
        display_name="Qwen 2.5 14B",
        size_gb=8.7, context_k=16, quantization="Q4_K_M",
        tier="quality", min_vram_gb=9.0, min_ram_gb=16.0,
    ),
    Candidate(
        name="llama3.1:70b-instruct-q4_K_M",
        display_name="Llama 3.1 70B",
        size_gb=40.0, context_k=32, quantization="Q4_K_M",
        tier="quality", min_vram_gb=42.0, min_ram_gb=48.0,
    ),
)

# Allowlist for pull validation — exact catalog names only.
KNOWN_MODEL_NAMES: frozenset[str] = frozenset(c.name for c in CANDIDATES)


# ── Result types ──────────────────────────────────────────────────────────────

@dataclass
class AdvisorRecommendation:
    tier: str
    candidate_name: str
    display_name: str
    size_gb: float
    context_k: int
    quantization: str
    reason: str
    available: bool   # already installed in Ollama


@dataclass
class AdvisorResult:
    catalog_version: str
    recommendations: list[AdvisorRecommendation]
    constraint: str   # "cpu_only" | "vram_limited" | "vram_ok"
    warning: str | None


# ── Advisor logic (pure functions) ────────────────────────────────────────────

def advise(inventory: dict[str, Any]) -> dict[str, Any]:
    """
    Pure function — returns a serialisable AdvisorResult dict.
    Takes the dict output of inventory.get_inventory().
    """
    hw = inventory.get("hardware") or {}
    ollama = inventory.get("ollama") or {}

    gpu = hw.get("gpu")
    ram_gb = float(hw.get("ram_gb") or 0.0)
    vram_gb = float(gpu["vram_gb"]) if isinstance(gpu, dict) else 0.0

    installed: set[str] = {
        m["name"]
        for m in (ollama.get("models") or [])
        if isinstance(m, dict) and isinstance(m.get("name"), str)
    }

    constraint = _determine_constraint(vram_gb)
    recs = _pick_recommendations(vram_gb, ram_gb, constraint, installed)
    return asdict(AdvisorResult(
        catalog_version=CATALOG_VERSION,
        recommendations=recs,
        constraint=constraint,
        warning=_build_warning(ram_gb, constraint),
    ))


def _determine_constraint(vram_gb: float) -> str:
    if vram_gb < 2.0:
        return "cpu_only"
    if vram_gb < 8.0:
        return "vram_limited"
    return "vram_ok"


def _fits(cand: Candidate, vram_gb: float, ram_gb: float) -> bool:
    """True when the candidate fits within available hardware with headroom."""
    if cand.min_vram_gb == 0.0:
        # CPU-only path: need RAM ≥ model_size × 1.25 and ≥ min_ram_gb
        return ram_gb >= cand.min_ram_gb and ram_gb >= cand.size_gb * 1.25
    # GPU path: VRAM must fit model with 10 % headroom, and RAM ≥ min_ram_gb
    return (
        vram_gb >= cand.min_vram_gb
        and vram_gb >= cand.size_gb * 1.1
        and ram_gb >= cand.min_ram_gb
    )


def _fits_constraint(
    cand: Candidate, vram_gb: float, ram_gb: float, constraint: str
) -> bool:
    if constraint == "cpu_only":
        return cand.min_vram_gb == 0.0 and _fits(cand, 0.0, ram_gb)
    return _fits(cand, vram_gb, ram_gb)


def _best_for_tier(
    tier: str, vram_gb: float, ram_gb: float, constraint: str
) -> Candidate | None:
    """Return the highest-quality fitting candidate for a tier."""
    eligible = [
        c for c in CANDIDATES
        if c.tier == tier and _fits_constraint(c, vram_gb, ram_gb, constraint)
    ]
    if not eligible:
        return None
    return max(eligible, key=lambda c: (c.context_k, c.size_gb))


def _build_reason(cand: Candidate, constraint: str, vram_gb: float) -> str:
    if constraint == "cpu_only":
        return (
            f"CPU-only — {cand.size_gb:.1f} GB model fits in RAM; "
            f"{cand.context_k}K context; {cand.quantization}"
        )
    return (
        f"{cand.size_gb:.1f} GB fits in {vram_gb:.0f} GB VRAM; "
        f"{cand.context_k}K context; {cand.quantization}"
    )


def _pick_recommendations(
    vram_gb: float,
    ram_gb: float,
    constraint: str,
    installed: set[str],
) -> list[AdvisorRecommendation]:
    recs: list[AdvisorRecommendation] = []
    for tier in ("fast", "balanced", "quality"):
        cand = _best_for_tier(tier, vram_gb, ram_gb, constraint)
        if cand is None:
            continue
        recs.append(AdvisorRecommendation(
            tier=tier,
            candidate_name=cand.name,
            display_name=cand.display_name,
            size_gb=cand.size_gb,
            context_k=cand.context_k,
            quantization=cand.quantization,
            reason=_build_reason(cand, constraint, vram_gb),
            available=cand.name in installed,
        ))
    return recs


def _build_warning(ram_gb: float, constraint: str) -> str | None:
    if constraint == "cpu_only" and ram_gb < 8.0:
        return "Low system RAM — only the smallest CPU-only model is recommended."
    if constraint == "cpu_only":
        return (
            "No NVIDIA GPU detected via nvidia-smi — inference runs on CPU (slower). "
            "AMD, Intel, and other GPUs are not detected by nvidia-smi."
        )
    return None
