"""Unit tests for Whisper cache validation / materialisation helpers."""
from __future__ import annotations

import os
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from stt import (  # noqa: E402
    _has_real_model_bin,
    _materialize_snapshot,
    _purge_incomplete_cache,
)


class TestWhisperCacheHelpers(unittest.TestCase):
    def test_has_real_model_bin_requires_nonempty_file(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.assertFalse(_has_real_model_bin(root))
            empty = root / "model.bin"
            empty.write_bytes(b"")
            self.assertFalse(_has_real_model_bin(root))
            empty.write_bytes(b"weights")
            self.assertTrue(_has_real_model_bin(root))

    def test_has_real_model_bin_ignores_symlinks(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            blob = root / "blob.bin"
            blob.write_bytes(b"weights")
            link = root / "model.bin"
            try:
                os.symlink(blob, link)
            except OSError:
                self.skipTest("symlinks not creatable on this host")
            self.assertFalse(_has_real_model_bin(root))

    def test_materialize_snapshot_replaces_symlink(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            blobs = root / "blobs"
            snap = root / "snapshots" / "abc"
            blobs.mkdir()
            snap.mkdir(parents=True)
            blob = blobs / "payload"
            blob.write_bytes(b"real-weights")
            link = snap / "model.bin"
            try:
                os.symlink(os.path.relpath(blob, snap), link)
            except OSError:
                self.skipTest("symlinks not creatable on this host")
            self.assertTrue(link.is_symlink())
            self.assertTrue(_materialize_snapshot(snap))
            self.assertFalse(link.is_symlink())
            self.assertEqual(link.read_bytes(), b"real-weights")
            self.assertTrue(_has_real_model_bin(root))

    def test_purge_incomplete_cache_removes_empty_tree(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "whisper"
            (root / "snapshots" / "x").mkdir(parents=True)
            _purge_incomplete_cache(root)
            self.assertFalse(root.exists())

    def test_purge_keeps_usable_cache(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "whisper"
            root.mkdir()
            (root / "model.bin").write_bytes(b"weights")
            _purge_incomplete_cache(root)
            self.assertTrue(root.exists())


if __name__ == "__main__":
    unittest.main()
