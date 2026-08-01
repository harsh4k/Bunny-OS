"""
Tests for sidecar/hw_probe.py.

Covers:
  - CPU-only hardware fixture (no GPU, 8 GB RAM, no mic)
  - GPU fixture (4 GB VRAM NVIDIA)
  - nvidia-smi success, failure, not-found, timeout, malformed output
  - NVIDIA-only disclosure: gpu_note is populated when gpu is None
"""
import subprocess
import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).parent.parent))

import hw_probe
from hw_probe import get_hardware, GpuInfo, HardwareInfo


# ── Fixtures ───────────────────────────────────────────────────────────────────

CPU_ONLY_PATCHES = {
    "hw_probe._get_os_string": "Windows 10 22H2",
    "hw_probe._get_cpu_name": "Intel Core i5-8250U @ 1.60GHz",
    "hw_probe._get_ram_gb": 8.0,
    "hw_probe._get_gpu": (None, hw_probe._SMI_DISCLOSURE),
    "hw_probe._has_audio_input": False,
}

GPU_4GB_PATCHES = {
    "hw_probe._get_os_string": "Windows 11 23H2",
    "hw_probe._get_cpu_name": "AMD Ryzen 5 5600X",
    "hw_probe._get_ram_gb": 16.0,
    "hw_probe._get_gpu": (GpuInfo(name="NVIDIA GeForce RTX 3050", vram_gb=4.0), ""),
    "hw_probe._has_audio_input": True,
}


def _patch_hw(overrides: dict):
    patches = []
    for attr, val in overrides.items():
        patches.append(patch(attr, return_value=val))

    class _CM:
        def __enter__(self_):
            for p in patches:
                p.start()
        def __exit__(self_, *_):
            for p in patches:
                p.stop()

    return _CM()


# ── CPU-only hardware ──────────────────────────────────────────────────────────

class TestHardwareCpuOnly(unittest.TestCase):

    def test_cpu_only_shape(self):
        with _patch_hw(CPU_ONLY_PATCHES):
            hw = get_hardware()
        self.assertEqual(hw.os, "Windows 10 22H2")
        self.assertIn("i5", hw.cpu)
        self.assertAlmostEqual(hw.ram_gb, 8.0)
        self.assertIsNone(hw.gpu)
        self.assertFalse(hw.mic_available)

    def test_gpu_present(self):
        with _patch_hw(GPU_4GB_PATCHES):
            hw = get_hardware()
        self.assertIsNotNone(hw.gpu)
        assert hw.gpu is not None
        self.assertEqual(hw.gpu.vram_gb, 4.0)
        self.assertIn("RTX 3050", hw.gpu.name)
        self.assertTrue(hw.mic_available)

    def test_ram_rounded_to_one_decimal(self):
        patches = {**CPU_ONLY_PATCHES, "hw_probe._get_ram_gb": 7.997}
        with _patch_hw(patches):
            hw = get_hardware()
        self.assertEqual(hw.ram_gb, 8.0)


# ── GPU detection (nvidia-smi) ─────────────────────────────────────────────────

class TestGpuDetection(unittest.TestCase):

    def test_nvidia_smi_success(self):
        mock_proc = MagicMock()
        mock_proc.returncode = 0
        mock_proc.stdout = "NVIDIA GeForce RTX 3080, 10240\n"
        with patch("subprocess.run", return_value=mock_proc):
            gpu, note = hw_probe._get_gpu()
        self.assertIsNotNone(gpu)
        assert gpu is not None
        self.assertAlmostEqual(gpu.vram_gb, 10.0)
        self.assertIn("RTX 3080", gpu.name)
        self.assertEqual(note, "")

    def test_nonzero_exit_returns_none_with_note(self):
        mock_proc = MagicMock()
        mock_proc.returncode = 1
        mock_proc.stdout = ""
        with patch("subprocess.run", return_value=mock_proc):
            gpu, note = hw_probe._get_gpu()
        self.assertIsNone(gpu)
        self.assertTrue(len(note) > 0)

    def test_not_found_returns_disclosure(self):
        with patch("subprocess.run", side_effect=FileNotFoundError):
            gpu, note = hw_probe._get_gpu()
        self.assertIsNone(gpu)
        self.assertIn("NVIDIA", note)
        self.assertNotIn("nvidia-smi", note)

    def test_run_hides_console_on_windows(self):
        if not sys.platform.startswith("win"):
            self.skipTest("Windows-only creationflags")
        seen: dict = {}

        def fake_run(*args, **kwargs):
            seen.update(kwargs)
            mock = MagicMock()
            mock.returncode = 1
            mock.stdout = ""
            return mock

        with patch("subprocess.run", side_effect=fake_run):
            hw_probe._run(["nvidia-smi"], timeout=1)
        self.assertEqual(seen.get("creationflags"), 0x08000000)

    def test_timeout_returns_note(self):
        with patch("subprocess.run", side_effect=subprocess.TimeoutExpired("nvidia-smi", 5)):
            gpu, note = hw_probe._get_gpu()
        self.assertIsNone(gpu)
        self.assertTrue(len(note) > 0)

    def test_malformed_output_returns_note(self):
        mock_proc = MagicMock()
        mock_proc.returncode = 0
        mock_proc.stdout = "no_comma_here\n"
        with patch("subprocess.run", return_value=mock_proc):
            gpu, note = hw_probe._get_gpu()
        self.assertIsNone(gpu)
        self.assertTrue(len(note) > 0)


# ── NVIDIA-only disclosure ─────────────────────────────────────────────────────

class TestGpuNoteDisclosure(unittest.TestCase):

    def test_gpu_note_empty_when_nvidia_detected(self):
        with _patch_hw(GPU_4GB_PATCHES):
            hw = get_hardware()
        self.assertEqual(hw.gpu_note, "")

    def test_gpu_note_present_when_no_nvidia(self):
        with _patch_hw(CPU_ONLY_PATCHES):
            hw = get_hardware()
        self.assertIsNotNone(hw.gpu_note)
        self.assertGreater(len(hw.gpu_note), 0)
        # Must disclose that detection is NVIDIA-only
        self.assertTrue(
            "nvidia" in hw.gpu_note.lower() or "NVIDIA" in hw.gpu_note,
            f"Disclosure should mention NVIDIA: {hw.gpu_note}",
        )

    def test_non_nvidia_gpu_not_labelled_no_gpu(self):
        """AMD/Intel GPU owners must not see 'CPU-only' phrasing in gpu_note."""
        with patch("subprocess.run", side_effect=FileNotFoundError):
            gpu, note = hw_probe._get_gpu()
        self.assertIsNone(gpu)
        # Note must NOT say "no GPU" — that would mislead AMD/Intel users
        self.assertNotIn("no GPU", note)
        self.assertNotIn("No GPU", note)


if __name__ == "__main__":
    unittest.main()
