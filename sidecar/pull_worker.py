"""
Background model-pull worker for Bunny OS sidecar.

Design:
  - Exactly one pull at a time (threading.Lock as a try-acquire gate).
  - Daemon thread so it cannot outlive the sidecar process (no orphans).
  - Streams /api/pull from Ollama's fixed localhost HTTP endpoint; never
    spawns a subprocess.
  - Thread-safe: all stdout writes go through the caller-supplied write_fn
    which holds the IPC write-lock shared with the main loop.
  - Bounded: per-line cap (4 KB), total-line cap (10 000), 35-minute wall
    clock deadline, 30-second socket timeout per read.
  - Shutdown/cancel: call cancel(); the streaming loop checks the event
    after each line.  Daemon thread is killed automatically on process exit.
"""
from __future__ import annotations

import json
import threading
import time
import urllib.error
import urllib.request
from typing import Callable

import ollama_config
from ipc_types import response_msg, error_msg

# ── Constants ─────────────────────────────────────────────────────────────────

PULL_DEADLINE_SECS    = 35 * 60   # 35 minutes max wall clock
PULL_SOCKET_TIMEOUT   = 30        # seconds of silence before socket error
MAX_LINE_BYTES        = 4 * 1024  # 4 KB per JSON line
MAX_PULL_LINES        = 10_000    # total line cap
_OLLAMA_PULL_URL      = f"{ollama_config.base_url()}/api/pull"

# Type alias so mypy / pyright are satisfied
_WriteFn = Callable[[dict], None]


# ── Worker class ──────────────────────────────────────────────────────────────

class PullWorker:
    """
    Non-blocking pull initiator.  start() returns immediately; the actual
    HTTP streaming runs on a daemon thread and writes its terminal
    response/error through write_fn (which should hold the IPC write-lock).
    """

    def __init__(self, write_fn: _WriteFn) -> None:
        self._write = write_fn
        self._lock = threading.Lock()        # exactly-one-pull gate
        self._cancel = threading.Event()     # set on shutdown/cancel

    # ── Public ────────────────────────────────────────────────────────────────

    def is_busy(self) -> bool:
        """True while a pull is in flight."""
        return self._lock.locked()

    def cancel(self) -> None:
        """Signal the running pull (if any) to abort at the next line."""
        self._cancel.set()

    def start(self, msg_id: str, model_name: str) -> bool:
        """
        Launch a pull in the background.

        Returns True if the pull was accepted; False if one is already
        running (caller should surface an error to the client).
        The response (success or error) is written asynchronously via
        write_fn.
        """
        if not self._lock.acquire(blocking=False):
            return False
        self._cancel.clear()
        t = threading.Thread(
            target=self._run,
            args=(msg_id, model_name),
            daemon=True,
            name=f"pull-{model_name[:20]}",
        )
        t.start()
        return True

    # ── Internal ──────────────────────────────────────────────────────────────

    def _run(self, msg_id: str, model_name: str) -> None:
        try:
            self._do_pull(msg_id, model_name)
        except Exception as exc:
            # Catch-all safety net; _do_pull handles most cases itself
            self._write(error_msg(msg_id, f"internal pull error: {exc}"))
        finally:
            self._lock.release()

    def _do_pull(self, msg_id: str, model_name: str) -> None:
        body = json.dumps({"model": model_name, "stream": True}).encode()
        req = urllib.request.Request(
            _OLLAMA_PULL_URL,
            data=body,
            method="POST",
            headers={"Content-Type": "application/json"},
        )
        deadline = time.monotonic() + PULL_DEADLINE_SECS
        lines_read = 0

        try:
            with urllib.request.urlopen(req, timeout=PULL_SOCKET_TIMEOUT) as resp:
                for raw_line in resp:
                    if self._cancel.is_set():
                        self._write(error_msg(msg_id, "pull cancelled"))
                        return
                    if time.monotonic() > deadline:
                        self._write(error_msg(
                            msg_id, "pull timed out after 35 minutes"
                        ))
                        return
                    if len(raw_line) > MAX_LINE_BYTES:
                        self._write(error_msg(
                            msg_id, "pull: response line exceeded 4 KB"
                        ))
                        return
                    lines_read += 1
                    if lines_read > MAX_PULL_LINES:
                        self._write(error_msg(
                            msg_id, "pull: too many response lines (>10 000)"
                        ))
                        return

                    try:
                        obj = json.loads(raw_line)
                    except (json.JSONDecodeError, UnicodeDecodeError):
                        continue

                    if not isinstance(obj, dict):
                        continue

                    # Ollama signals errors in the payload body
                    if "error" in obj:
                        self._write(error_msg(
                            msg_id, str(obj["error"])[:500]
                        ))
                        return

                    if obj.get("status") == "success":
                        self._write(response_msg(
                            msg_id, json.dumps({"pulled": model_name})
                        ))
                        return

                # Stream ended without an explicit "success" — treat as done
                self._write(response_msg(
                    msg_id, json.dumps({"pulled": model_name})
                ))
                return

        except urllib.error.HTTPError as e:
            self._write(error_msg(msg_id, f"ollama HTTP {e.code}: {e.reason}"))
        except urllib.error.URLError as e:
            self._write(error_msg(msg_id, f"ollama unreachable: {e.reason}"))
        except TimeoutError:
            self._write(error_msg(msg_id, "ollama pull socket timed out"))
        except OSError as e:
            self._write(error_msg(msg_id, f"network error: {e}"))
