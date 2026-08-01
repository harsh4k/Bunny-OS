"""
The protocol must own stdout exclusively.

Optional voice dependencies are third-party code that prints; one stray byte
on stdout desynchronises the frame stream and kills the sidecar.
"""
from __future__ import annotations

import json
import struct
import subprocess
import sys
import unittest
from pathlib import Path

SIDECAR_DIR = Path(__file__).parent.parent

# Prints both before and after claiming, plus a noisy library-style write
# straight to sys.stdout, then sends one real frame.
SCRIPT = """
import sys
from protocol import claim_stdout, send_message

claim_stdout()
print("chatty library banner")
sys.stdout.write("progress: 50%\\r")
send_message({"type": "ready", "version": "0.1.0"})
"""


class TestStdoutIsolation(unittest.TestCase):
    def test_library_prints_do_not_corrupt_frames(self):
        proc = subprocess.run(
            [sys.executable, "-c", SCRIPT],
            cwd=str(SIDECAR_DIR),
            capture_output=True,
            timeout=30,
        )
        raw = proc.stdout

        (length,) = struct.unpack("<I", raw[:4])
        self.assertEqual(len(raw), 4 + length, "stdout carried more than the frame")
        self.assertEqual(
            json.loads(raw[4:]), {"type": "ready", "version": "0.1.0"}
        )

        # The prints aren't lost — they're just routed somewhere harmless.
        self.assertIn(b"chatty library banner", proc.stderr)


if __name__ == "__main__":
    unittest.main()
