"""
Tests for sidecar/advisor.py.

Fixture coverage:
  - CPU-only (no GPU, 8 GB RAM)
  - CPU-only low RAM (4 GB) — only smallest fast model
  - 4–6 GB VRAM — fast + partial balanced
  - 8–12 GB VRAM — fast + balanced + quality (if RAM sufficient)
  - 16+ GB VRAM — all tiers
  - Determinism: same input always produces identical output
  - Available flag set when model is in installed Ollama models
  - pull validation: KNOWN_MODEL_NAMES rejects unlisted names
"""
import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from advisor import (
    advise,
    CANDIDATES,
    CATALOG_VERSION,
    KNOWN_MODEL_NAMES,
    _determine_constraint,
    _fits,
    _best_for_tier,
    Candidate,
)


# ── Inventory fixture builders ─────────────────────────────────────────────────

def _make_inventory(
    ram_gb: float = 16.0,
    vram_gb: float | None = None,
    installed_models: list[str] | None = None,
) -> dict:
    gpu = None if vram_gb is None else {"name": "Test GPU", "vram_gb": vram_gb}
    gpu_note = "" if gpu else "VRAM detection requires nvidia-smi (NVIDIA only)."
    models = [{"name": n} for n in (installed_models or [])]
    return {
        "hardware": {
            "os": "Windows 11",
            "cpu": "Test CPU",
            "ram_gb": ram_gb,
            "gpu": gpu,
            "gpu_note": gpu_note,
            "mic_available": False,
        },
        "ollama": {
            "reachable": True,
            "version": None,
            "models": models,
            "running": [],
        },
        "apps": [],
    }


# ── Constraint determination ───────────────────────────────────────────────────

class TestConstraint(unittest.TestCase):

    def test_no_gpu_is_cpu_only(self):
        self.assertEqual(_determine_constraint(0.0), "cpu_only")

    def test_1gb_vram_is_cpu_only(self):
        self.assertEqual(_determine_constraint(1.0), "cpu_only")

    def test_1_99gb_vram_is_cpu_only(self):
        self.assertEqual(_determine_constraint(1.99), "cpu_only")

    def test_2gb_vram_is_vram_limited(self):
        self.assertEqual(_determine_constraint(2.0), "vram_limited")

    def test_6gb_vram_is_vram_limited(self):
        self.assertEqual(_determine_constraint(6.0), "vram_limited")

    def test_7_99gb_vram_is_vram_limited(self):
        self.assertEqual(_determine_constraint(7.99), "vram_limited")

    def test_8gb_vram_is_vram_ok(self):
        self.assertEqual(_determine_constraint(8.0), "vram_ok")

    def test_24gb_vram_is_vram_ok(self):
        self.assertEqual(_determine_constraint(24.0), "vram_ok")


# ── CPU-only scenarios ─────────────────────────────────────────────────────────

class TestCpuOnly(unittest.TestCase):

    def test_cpu_only_8gb_ram_has_fast_rec(self):
        result = advise(_make_inventory(ram_gb=8.0, vram_gb=None))
        self.assertEqual(result["constraint"], "cpu_only")
        tiers = {r["tier"] for r in result["recommendations"]}
        self.assertIn("fast", tiers)

    def test_cpu_only_8gb_ram_no_gpu_models(self):
        result = advise(_make_inventory(ram_gb=8.0, vram_gb=None))
        for rec in result["recommendations"]:
            # All recommended models must be CPU-viable
            cand = next(c for c in CANDIDATES if c.name == rec["candidate_name"])
            self.assertEqual(cand.min_vram_gb, 0.0)

    def test_cpu_only_4gb_ram_smallest_only(self):
        """With only 4 GB RAM only the sub-1 GB model fits."""
        result = advise(_make_inventory(ram_gb=4.0, vram_gb=None))
        self.assertEqual(result["constraint"], "cpu_only")
        for rec in result["recommendations"]:
            self.assertLessEqual(rec["size_gb"] * 1.25, 4.0)

    def test_cpu_only_warns_about_no_nvidia_gpu(self):
        result = advise(_make_inventory(ram_gb=16.0, vram_gb=None))
        self.assertIsNotNone(result["warning"])
        assert result["warning"] is not None
        warning = result["warning"]
        self.assertIn("CPU", warning)
        # Must disclose NVIDIA-only detection so AMD/Intel users are not misled
        self.assertTrue(
            "NVIDIA" in warning or "nvidia" in warning.lower(),
            f"Warning should mention NVIDIA-only detection: {warning}",
        )
        # Must NOT say "No discrete GPU" — that would mislead AMD/Intel users
        self.assertNotIn("No discrete GPU", warning)

    def test_cpu_only_low_ram_warns(self):
        result = advise(_make_inventory(ram_gb=4.0, vram_gb=None))
        self.assertIsNotNone(result["warning"])
        assert result["warning"] is not None
        self.assertIn("RAM", result["warning"])

    def test_cpu_only_no_balanced_or_quality(self):
        """GPU-requiring tiers must not appear in CPU-only mode."""
        result = advise(_make_inventory(ram_gb=16.0, vram_gb=None))
        for rec in result["recommendations"]:
            cand = next(c for c in CANDIDATES if c.name == rec["candidate_name"])
            self.assertEqual(
                cand.min_vram_gb, 0.0,
                f"GPU model {cand.name} should not appear in CPU-only mode",
            )


# ── 4–6 GB VRAM scenarios ─────────────────────────────────────────────────────

class TestVram4to6(unittest.TestCase):

    def test_4gb_vram_constraint_is_limited(self):
        result = advise(_make_inventory(ram_gb=16.0, vram_gb=4.0))
        self.assertEqual(result["constraint"], "vram_limited")

    def test_4gb_vram_no_9gb_quality_models(self):
        result = advise(_make_inventory(ram_gb=16.0, vram_gb=4.0))
        for rec in result["recommendations"]:
            cand = next(c for c in CANDIDATES if c.name == rec["candidate_name"])
            self.assertLessEqual(cand.min_vram_gb, 4.0 * 0.95 + 1)

    def test_6gb_vram_16gb_ram_has_balanced(self):
        result = advise(_make_inventory(ram_gb=16.0, vram_gb=6.0))
        tiers = {r["tier"] for r in result["recommendations"]}
        self.assertIn("fast", tiers)
        # 6 GB VRAM satisfies the gemma2/llama3.1/mistral balanced candidates
        self.assertIn("balanced", tiers)

    def test_4gb_vram_no_warning(self):
        result = advise(_make_inventory(ram_gb=16.0, vram_gb=4.0))
        self.assertIsNone(result["warning"])


# ── 8–12 GB VRAM scenarios ────────────────────────────────────────────────────

class TestVram8to12(unittest.TestCase):

    def test_10gb_vram_is_vram_ok(self):
        result = advise(_make_inventory(ram_gb=32.0, vram_gb=10.0))
        self.assertEqual(result["constraint"], "vram_ok")

    def test_10gb_vram_has_quality_tier(self):
        result = advise(_make_inventory(ram_gb=16.0, vram_gb=10.0))
        tiers = {r["tier"] for r in result["recommendations"]}
        self.assertIn("quality", tiers)

    def test_10gb_vram_quality_fits_vram(self):
        result = advise(_make_inventory(ram_gb=16.0, vram_gb=10.0))
        for rec in result["recommendations"]:
            if rec["tier"] == "quality":
                self.assertLessEqual(rec["size_gb"] * 1.1, 10.0)


# ── 16+ GB VRAM scenarios ─────────────────────────────────────────────────────

class TestVram16Plus(unittest.TestCase):

    def test_24gb_vram_all_tiers_present(self):
        result = advise(_make_inventory(ram_gb=64.0, vram_gb=24.0))
        tiers = {r["tier"] for r in result["recommendations"]}
        self.assertIn("fast", tiers)
        self.assertIn("balanced", tiers)
        self.assertIn("quality", tiers)

    def test_16gb_vram_no_warning(self):
        result = advise(_make_inventory(ram_gb=32.0, vram_gb=16.0))
        self.assertIsNone(result["warning"])


# ── Available flag ─────────────────────────────────────────────────────────────

class TestAvailableFlag(unittest.TestCase):

    def test_installed_model_marked_available(self):
        fast_name = next(
            c.name for c in CANDIDATES if c.tier == "fast" and c.min_vram_gb == 0.0
        )
        inv = _make_inventory(ram_gb=16.0, vram_gb=None, installed_models=[fast_name])
        result = advise(inv)
        for rec in result["recommendations"]:
            if rec["candidate_name"] == fast_name:
                self.assertTrue(rec["available"])

    def test_not_installed_model_marked_unavailable(self):
        result = advise(_make_inventory(ram_gb=16.0, vram_gb=None, installed_models=[]))
        for rec in result["recommendations"]:
            self.assertFalse(rec["available"])


# ── Determinism ────────────────────────────────────────────────────────────────

class TestDeterminism(unittest.TestCase):

    def test_same_input_same_output(self):
        inv = _make_inventory(ram_gb=16.0, vram_gb=8.0)
        result_a = advise(inv)
        result_b = advise(inv)
        self.assertEqual(result_a, result_b)

    def test_output_is_json_serialisable(self):
        result = advise(_make_inventory(ram_gb=16.0, vram_gb=8.0))
        encoded = json.dumps(result)
        decoded = json.loads(encoded)
        self.assertEqual(decoded["catalog_version"], CATALOG_VERSION)


# ── KNOWN_MODEL_NAMES allowlist ────────────────────────────────────────────────

class TestKnownModelNames(unittest.TestCase):

    def test_known_model_names_non_empty(self):
        self.assertGreater(len(KNOWN_MODEL_NAMES), 0)

    def test_all_candidates_in_known_names(self):
        for c in CANDIDATES:
            self.assertIn(c.name, KNOWN_MODEL_NAMES)

    def test_arbitrary_name_not_in_known(self):
        self.assertNotIn("rm -rf /", KNOWN_MODEL_NAMES)
        self.assertNotIn("../../etc/passwd", KNOWN_MODEL_NAMES)
        self.assertNotIn("", KNOWN_MODEL_NAMES)

    def test_catalog_version_is_string(self):
        self.assertIsInstance(CATALOG_VERSION, str)
        self.assertTrue(CATALOG_VERSION)


if __name__ == "__main__":
    unittest.main()
