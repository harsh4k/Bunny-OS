#!/usr/bin/env python3
"""Generate Tauri icons from the Bunny OS brand artwork."""

from __future__ import annotations

import io
import struct
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "bunny OS.jpg"
ICONS_DIR = ROOT / "src-tauri" / "icons"
CANVAS_SIZE = 1024
ART_PADDING = 112
CORNER_RADIUS = 224
BACKGROUND = (16, 16, 16, 255)

# Modern ICNS icon types that embed PNG payloads (accepted by macOS 10.13+).
_ICNS_PNG_TYPES: list[tuple[bytes, int]] = [
    (b"icp4", 16),
    (b"icp5", 32),
    (b"icp6", 64),
    (b"ic07", 128),
    (b"ic08", 256),
    (b"ic09", 512),
    (b"ic10", 1024),
]


def build_master() -> Image.Image:
    """Crop the rabbit artwork and place it on a rounded dark icon tile."""
    source = Image.open(SOURCE).convert("RGB")
    background = Image.new("RGB", source.size, source.getpixel((0, 0)))
    difference = ImageChops.difference(source, background).convert("L")
    bounds = difference.point(lambda value: 255 if value > 24 else 0).getbbox()
    if bounds is None:
        raise ValueError(f"No artwork found in {SOURCE}")

    artwork = source.crop(bounds)
    available = CANVAS_SIZE - (ART_PADDING * 2)
    artwork.thumbnail((available, available), Image.Resampling.LANCZOS)

    master = Image.new("RGBA", (CANVAS_SIZE, CANVAS_SIZE), BACKGROUND)
    position = (
        (CANVAS_SIZE - artwork.width) // 2,
        (CANVAS_SIZE - artwork.height) // 2,
    )
    master.alpha_composite(artwork.convert("RGBA"), position)

    mask = Image.new("L", master.size)
    ImageDraw.Draw(mask).rounded_rectangle(
        (0, 0, CANVAS_SIZE - 1, CANVAS_SIZE - 1),
        radius=CORNER_RADIUS,
        fill=255,
    )
    master.putalpha(mask)
    return master


def save_png(master: Image.Image, size: int, filename: str) -> None:
    output = master.resize((size, size), Image.Resampling.LANCZOS)
    output.save(ICONS_DIR / filename, "PNG", optimize=True)
    print(f"  created {filename} ({size}x{size})")


def write_icns(master: Image.Image, path: Path) -> None:
    """Write a real ICNS with PNG-compressed icon slots (no macOS tooling)."""
    chunks: list[bytes] = []
    for type_code, size in _ICNS_PNG_TYPES:
        buf = io.BytesIO()
        master.resize((size, size), Image.Resampling.LANCZOS).save(
            buf, format="PNG", optimize=True
        )
        payload = buf.getvalue()
        # length includes the 8-byte type+size header
        chunks.append(type_code + struct.pack(">I", 8 + len(payload)) + payload)

    body = b"".join(chunks)
    path.write_bytes(b"icns" + struct.pack(">I", 8 + len(body)) + body)
    print(f"  created icon.icns ({len(_ICNS_PNG_TYPES)} PNG slots)")


def main() -> None:
    if not SOURCE.is_file():
        raise FileNotFoundError(f"Brand artwork not found: {SOURCE}")

    ICONS_DIR.mkdir(parents=True, exist_ok=True)
    master = build_master()

    save_png(master, 16, "tray-icon.png")
    save_png(master, 32, "32x32.png")
    save_png(master, 128, "128x128.png")
    save_png(master, 256, "128x128@2x.png")

    master.save(
        ICONS_DIR / "icon.ico",
        "ICO",
        sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
    )
    print("  created icon.ico (16–256px)")

    write_icns(master, ICONS_DIR / "icon.icns")


if __name__ == "__main__":
    main()
