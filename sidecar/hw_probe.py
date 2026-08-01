"""
Hardware probe for Bunny OS sidecar.

Cross-platform OS/CPU/RAM; NVIDIA VRAM via nvidia-smi when present;
microphone via Win32 waveIn or sounddevice on other platforms.
"""
from __future__ import annotations

import platform
import subprocess
import sys
from dataclasses import dataclass


@dataclass
class GpuInfo:
    name: str
    vram_gb: float


@dataclass
class HardwareInfo:
    os: str
    cpu: str
    ram_gb: float
    gpu: GpuInfo | None
    gpu_note: str
    mic_available: bool


def get_hardware() -> HardwareInfo:
    gpu, gpu_note = _get_gpu()
    return HardwareInfo(
        os=_get_os_string(),
        cpu=_get_cpu_name(),
        ram_gb=round(_get_ram_gb(), 1),
        gpu=gpu,
        gpu_note=gpu_note,
        mic_available=_has_audio_input(),
    )


def _get_os_string() -> str:
    if sys.platform.startswith("win"):
        try:
            name, ver, csd, _ = platform.win32_ver()
            parts = ["Windows", name]
            if ver:
                parts.append(ver)
            if csd:
                parts.append(csd)
            return " ".join(p for p in parts if p)
        except Exception:
            return "Windows"
    if sys.platform == "darwin":
        ver = platform.mac_ver()[0] or ""
        return f"macOS {ver}".strip()
    return platform.system()


def _get_cpu_name() -> str:
    if sys.platform.startswith("win"):
        try:
            import winreg

            key = winreg.OpenKey(
                winreg.HKEY_LOCAL_MACHINE,
                r"HARDWARE\DESCRIPTION\System\CentralProcessor\0",
            )
            with key:
                name, _ = winreg.QueryValueEx(key, "ProcessorNameString")
                return str(name).strip()
        except OSError:
            pass
    if sys.platform == "darwin":
        try:
            out = subprocess.run(
                ["/usr/sbin/sysctl", "-n", "machdep.cpu.brand_string"],
                capture_output=True,
                text=True,
                timeout=2,
                shell=False,
                check=False,
            )
            if out.returncode == 0 and out.stdout.strip():
                return out.stdout.strip()
        except (OSError, subprocess.TimeoutExpired):
            pass
    return platform.processor() or "Unknown CPU"


def _get_ram_gb() -> float:
    if sys.platform.startswith("win"):
        import ctypes

        class MEMORYSTATUSEX(ctypes.Structure):
            _fields_ = [
                ("dwLength", ctypes.c_ulong),
                ("dwMemoryLoad", ctypes.c_ulong),
                ("ullTotalPhys", ctypes.c_uint64),
                ("ullAvailPhys", ctypes.c_uint64),
                ("ullTotalPageFile", ctypes.c_uint64),
                ("ullAvailPageFile", ctypes.c_uint64),
                ("ullTotalVirtual", ctypes.c_uint64),
                ("ullAvailVirtual", ctypes.c_uint64),
                ("ullAvailExtendedVirtual", ctypes.c_uint64),
            ]

        stat = MEMORYSTATUSEX()
        stat.dwLength = ctypes.sizeof(stat)
        ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(stat))
        return stat.ullTotalPhys / (1024**3)
    if sys.platform == "darwin":
        try:
            out = subprocess.run(
                ["/usr/sbin/sysctl", "-n", "hw.memsize"],
                capture_output=True,
                text=True,
                timeout=2,
                shell=False,
                check=False,
            )
            if out.returncode == 0:
                return int(out.stdout.strip()) / (1024**3)
        except (OSError, ValueError, subprocess.TimeoutExpired):
            pass
    return 0.0


_SMI_DISCLOSURE = (
    "VRAM detection uses nvidia-smi (NVIDIA only). "
    "AMD, Intel, and other GPUs are not detected."
)


def _get_gpu() -> tuple[GpuInfo | None, str]:
    try:
        result = subprocess.run(
            [
                "nvidia-smi",
                "--query-gpu=name,memory.total",
                "--format=csv,noheader,nounits",
            ],
            capture_output=True,
            text=True,
            timeout=5,
            shell=False,
        )
        if result.returncode != 0:
            return None, "nvidia-smi found but reported no NVIDIA GPU."
        raw = result.stdout.strip().splitlines()
        if not raw:
            return None, "nvidia-smi returned no output."
        parts = [p.strip() for p in raw[0].split(",", 1)]
        if len(parts) != 2:
            return None, "nvidia-smi output format unexpected."
        name, mb_str = parts
        return GpuInfo(name=name, vram_gb=round(int(mb_str) / 1024, 1)), ""
    except FileNotFoundError:
        return None, _SMI_DISCLOSURE
    except subprocess.TimeoutExpired:
        return None, "nvidia-smi timed out — VRAM unknown."
    except (ValueError, IndexError):
        return None, "nvidia-smi output could not be parsed."


def _has_audio_input() -> bool:
    if sys.platform.startswith("win"):
        try:
            import ctypes

            return int(ctypes.windll.winmm.waveInGetNumDevs()) > 0
        except Exception:
            return False
    try:
        import sounddevice as sd  # type: ignore

        return any(d.get("max_input_channels", 0) > 0 for d in sd.query_devices())
    except Exception:
        return False
