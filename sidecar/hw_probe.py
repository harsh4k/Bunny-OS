"""
Hardware probe for Bunny OS sidecar.

Detects OS, CPU, physical RAM, GPU+VRAM (NVIDIA only via nvidia-smi),
and microphone availability via Win32 API.

NVIDIA disclosure: VRAM detection relies on nvidia-smi.  AMD, Intel, and
other GPUs are not detected.  gpu is None and gpu_note explains why when
no NVIDIA GPU is found.  This is NOT the same as "no GPU present".
"""
from __future__ import annotations

import ctypes
import os
import platform
import subprocess
import winreg
from dataclasses import dataclass


# ── Data classes ──────────────────────────────────────────────────────────────

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
    gpu_note: str          # empty when GPU detected; NVIDIA-only disclosure otherwise
    mic_available: bool


# ── Public API ────────────────────────────────────────────────────────────────

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


# ── OS / CPU / RAM ────────────────────────────────────────────────────────────

def _get_os_string() -> str:
    try:
        name, ver, csd, _ = platform.win32_ver()
        parts = ["Windows", name]
        if ver:
            parts.append(ver)
        if csd:
            parts.append(csd)
        return " ".join(p for p in parts if p)
    except Exception:
        return platform.system()


def _get_cpu_name() -> str:
    try:
        key = winreg.OpenKey(
            winreg.HKEY_LOCAL_MACHINE,
            r"HARDWARE\DESCRIPTION\System\CentralProcessor\0",
        )
        with key:
            name, _ = winreg.QueryValueEx(key, "ProcessorNameString")
            return str(name).strip()
    except OSError:
        return platform.processor() or "Unknown CPU"


class _MEMORYSTATUSEX(ctypes.Structure):
    _fields_ = [
        ("dwLength",                ctypes.c_ulong),
        ("dwMemoryLoad",            ctypes.c_ulong),
        ("ullTotalPhys",            ctypes.c_uint64),
        ("ullAvailPhys",            ctypes.c_uint64),
        ("ullTotalPageFile",        ctypes.c_uint64),
        ("ullAvailPageFile",        ctypes.c_uint64),
        ("ullTotalVirtual",         ctypes.c_uint64),
        ("ullAvailVirtual",         ctypes.c_uint64),
        ("ullAvailExtendedVirtual", ctypes.c_uint64),
    ]


def _get_ram_gb() -> float:
    stat = _MEMORYSTATUSEX()
    stat.dwLength = ctypes.sizeof(stat)
    ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(stat))
    return stat.ullTotalPhys / (1024 ** 3)


# ── GPU (NVIDIA only) ─────────────────────────────────────────────────────────

_SMI_DISCLOSURE = (
    "VRAM detection uses nvidia-smi (NVIDIA only). "
    "AMD, Intel, and other GPUs are not detected."
)


def _get_gpu() -> tuple[GpuInfo | None, str]:
    """
    Returns (GpuInfo, "") on success, or (None, note) explaining why.

    note is never empty when gpu is None — callers MUST surface it so users
    with AMD/Intel/other GPUs are not misled into thinking they have no GPU.
    """
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


# ── Microphone ────────────────────────────────────────────────────────────────

def _has_audio_input() -> bool:
    try:
        return int(ctypes.windll.winmm.waveInGetNumDevs()) > 0
    except Exception:
        return False
