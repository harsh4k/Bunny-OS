"""
Framed JSON IPC protocol for Bunny OS sidecar.

Wire format: [4-byte u32 LE length][UTF-8 JSON payload]
TS source of truth: contracts/ipc.ts
Rust mirror:        src-tauri/src/protocol.rs  (MAX_FRAME_BYTES must match)
"""
from __future__ import annotations

import json
import os
import struct
import sys
from typing import Any


FRAME_HEADER_SIZE = 4
MAX_FRAME_BYTES = 4 * 1024 * 1024  # 4 MiB hard cap

# Private duplicate of the real stdout, installed by claim_stdout().
_channel: Any = None


def claim_stdout() -> None:
    """Take exclusive ownership of stdout for the protocol.

    The optional voice dependencies are third-party code that may print
    (openWakeWord download bars, model loaders). A single stray byte on stdout
    desynchronises the frame stream and takes the sidecar down, so the protocol
    keeps a private handle and everything else is pointed at stderr, where it
    shows up in the logs instead.
    """
    global _channel
    if _channel is not None:
        return
    try:
        _channel = os.fdopen(os.dup(sys.stdout.fileno()), "wb")
    except (AttributeError, OSError, ValueError):
        # No real handle behind stdout (windowed build); fall back to writing
        # through sys.stdout and leave it in place.
        return
    sys.stdout = sys.stderr


def _out() -> Any:
    # Tests swap sys.stdout and never claim; honour that.
    return _channel if _channel is not None else sys.stdout.buffer


def write_frame(payload: bytes) -> None:
    """Write a length-prefixed frame to stdout."""
    if len(payload) > MAX_FRAME_BYTES:
        raise ValueError(f"frame too large: {len(payload)} bytes")
    out = _out()
    out.write(struct.pack("<I", len(payload)))
    out.write(payload)
    out.flush()


def read_frame() -> bytes:
    """Block until a complete length-prefixed frame is read from stdin."""
    header = _read_exact(sys.stdin.buffer, FRAME_HEADER_SIZE)
    if header is None:
        raise EOFError("stdin closed")
    (length,) = struct.unpack("<I", header)
    if length > MAX_FRAME_BYTES:
        raise ValueError(f"incoming frame too large: {length} bytes")
    data = _read_exact(sys.stdin.buffer, length)
    if data is None:
        raise EOFError("stdin closed mid-frame")
    return data


def send_message(msg: dict[str, Any]) -> None:
    """Serialise and send a message as a framed JSON payload."""
    write_frame(json.dumps(msg, separators=(",", ":")).encode("utf-8"))


def recv_message() -> dict[str, Any]:
    """Receive and deserialise a framed JSON message."""
    raw = read_frame()
    obj = json.loads(raw)
    if not isinstance(obj, dict):
        raise TypeError(f"expected JSON object, got {type(obj)}")
    return obj


# ── Internal ──────────────────────────────────────────────────────────────────

def _read_exact(stream: Any, n: int) -> bytes | None:
    """Read exactly n bytes; return None on EOF."""
    buf = bytearray()
    while len(buf) < n:
        chunk = stream.read(n - len(buf))
        if not chunk:
            return None
        buf.extend(chunk)
    return bytes(buf)
