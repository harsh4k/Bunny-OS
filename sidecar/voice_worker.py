"""
Background voice session worker: listen → STT → chat → TTS.

Two ways in:
  - push-to-talk: `start_listen` / `stop_listen` bracket the recording
  - wake word:    `start_wake_session` records until the speaker goes quiet
"""
from __future__ import annotations

import json
import threading
import time
import uuid
from typing import Any, Callable

from audio_pipeline import SAMPLE_RATE, AudioPipeline
from chat_handler import SYSTEM_PROMPT
from chat_worker import handle_chat_streaming
from ipc_types import error_msg, stream_msg
from local_actions import execute as execute_local
from stt import SttEngine, create_stt
from tts import TtsEngine, create_tts
from voice_intents import match_intent
from voice_state import VoiceMachine, VoiceState

_WriteFn = Callable[[dict], None]

# Push-to-talk safety cap: a stuck key must not record forever.
MAX_SESSION_SECS = 30
# Wake sessions have no key release, so they stop on silence instead.
WAKE_MIN_SECS = 1.0
WAKE_MAX_SECS = 12.0
WAKE_SILENCE_SECS = 1.2
WAKE_SILENCE_RMS = 0.012
_VAD_POLL_SECS = 0.1
# How long a new talk request waits for the previous turn to wind down.
BARGE_IN_TIMEOUT_SECS = 3.0
# How often to publish mic loudness while the user is holding Talk / F9.
_LEVEL_POLL_SECS = 0.08
# Speech around this RMS maps to a full meter; quieter is scaled down.
_LEVEL_FULL_RMS = 0.08
_LEVEL_HEARING_RMS = 0.012


def _level_from_rms(rms: float) -> float:
    if rms <= 0:
        return 0.0
    return max(0.0, min(1.0, rms / _LEVEL_FULL_RMS))



class VoiceWorker:
    def __init__(
        self,
        write_fn: _WriteFn,
        stt: SttEngine | None = None,
        tts: TtsEngine | None = None,
        audio: AudioPipeline | None = None,
        memory: Any | None = None,
        on_busy_change: Callable[[bool], None] | None = None,
    ) -> None:
        self._write = write_fn
        self._stt = stt
        self._tts = tts or create_tts()
        self._audio = audio or AudioPipeline()
        self._memory = memory
        self._on_busy_change = on_busy_change
        self._machine = VoiceMachine(on_change=self._on_state)
        self._lock = threading.Lock()
        self._cancel = threading.Event()
        self._active_id: str | None = None
        # None means "whatever chat model is installed" — resolved per turn.
        self._model: str | None = None
        self._pending_samples: list[float] | None = None
        self._stop_event = threading.Event()
        self._reject_reason = ""

    @property
    def state(self) -> VoiceState:
        return self._machine.state

    @property
    def muted(self) -> bool:
        return self._machine.muted

    def _on_state(self, state: VoiceState, reason: str) -> None:
        payload = json.dumps({"voice_state": state.value, "reason": reason})
        self._write(stream_msg(self._active_id or "voice", payload, False))

    def _set_busy(self, busy: bool) -> None:
        if self._on_busy_change is None:
            return
        try:
            self._on_busy_change(busy)
        except Exception:  # noqa: BLE001 — never let a listener break a session
            pass

    def _capturing(self) -> bool:
        """True while this turn still has the microphone open."""
        return self._audio.is_recording and not self._stop_event.is_set()

    def set_mute(self, muted: bool) -> dict:
        if not muted:
            self._machine.set_mute(False)
            return {"muted": self._machine.muted, "state": self._machine.state.value}

        if self._capturing():
            # Mic is live: muting mid-sentence abandons the turn.
            self._machine.set_mute(True)
            self._cancel.set()
            self._stop_event.set()
            self._tts.stop()
            self._audio.stop()
        else:
            # Capture already finished. Push-to-talk remutes the moment the key
            # comes up, and the answer to what was just said is still owed, so
            # close the mic without cancelling the turn in flight.
            self._machine.muted = True
        return {"muted": self._machine.muted, "state": self._machine.state.value}

    def cancel(self, request_id: str | None = None) -> dict:
        if request_id is not None and self._active_id not in (None, request_id):
            return {"status": "ignored", "state": self._machine.state.value}
        self._cancel.set()
        self._stop_event.set()
        self._tts.stop()
        if self._audio.is_recording:
            self._audio.stop()
        self._machine.cancel("cancelled")
        return {"status": "cancelled", "state": self._machine.state.value}

    @property
    def reject_reason(self) -> str:
        """Why the last start_listen / start_wake_session was refused."""
        return self._reject_reason

    def start_listen(self, msg_id: str, model: str | None = None) -> bool:
        return self._begin(msg_id, model, auto_stop=False)

    def start_wake_session(self, model: str | None = None) -> bool:
        """Wake-word entry point: records until the speaker stops talking."""
        return self._begin(f"wake-{uuid.uuid4().hex[:12]}", model, auto_stop=True)

    def _begin(self, msg_id: str, model: str | None, auto_stop: bool) -> bool:
        if not self._lock.acquire(blocking=False):
            # The previous turn is still finishing — usually speaking its answer.
            # Pressing talk again means "stop and listen to me", so barge in
            # rather than refusing the new request.
            self.cancel()
            if not self._lock.acquire(timeout=BARGE_IN_TIMEOUT_SECS):
                self._reject_reason = "The previous voice turn is still finishing"
                return False
        if self._machine.muted:
            self._lock.release()
            self._reject_reason = "Microphone is muted"
            return False
        if not self._machine.start_listen():
            self._lock.release()
            self._reject_reason = (
                f"Cannot start listening from {self._machine.state.value}"
            )
            return False
        self._reject_reason = ""
        self._cancel.clear()
        self._stop_event.clear()
        self._pending_samples = None
        self._active_id = msg_id
        self._model = model
        self._set_busy(True)
        threading.Thread(
            target=self._run_session,
            args=(msg_id, auto_stop),
            daemon=True,
            name=f"voice-{msg_id[:8]}",
        ).start()
        return True

    def stop_listen(self, msg_id: str) -> dict:
        if self._active_id != msg_id:
            return {"status": "ignored"}
        if self._audio.is_recording:
            self._pending_samples = self._audio.stop()
        self._stop_event.set()
        return {"status": "stopped_listening", "state": self._machine.state.value}

    # ── Session ───────────────────────────────────────────────────────────────

    def _advance(self, msg_id: str, target: VoiceState, reason: str) -> bool:
        """Move the state machine on, reporting rather than stalling silently.

        A rejected transition means the turn was interrupted (or the states got
        out of step). Either way the user is owed an answer they will not get,
        so say so instead of dropping the turn on the floor.
        """
        if self._machine.transition(target, reason):
            return True
        if self._cancel.is_set():
            return False
        self._write(
            error_msg(
                msg_id,
                f"Voice turn interrupted before {target.value} "
                f"(was {self._machine.state.value})",
            )
        )
        return False

    def _run_session(self, msg_id: str, auto_stop: bool) -> None:
        try:
            try:
                self._audio.start()
            except Exception as exc:  # noqa: BLE001
                self._fail_spoken(
                    msg_id,
                    _spoken_error(str(exc)),
                    f"Mic error: {exc}",
                )
                return

            self._record(auto_stop)

            if self._cancel.is_set():
                self._write(error_msg(msg_id, "cancelled"))
                return

            text = self._transcribe(msg_id)
            if text is None:
                return

            self._write(stream_msg(msg_id, json.dumps({"transcript": text}), False))
            if not self._advance(msg_id, VoiceState.THINKING, "chat"):
                return

            reply = self._ask(msg_id, text)
            # Persist facts/session even when the model path fails — utterance still happened.
            self._note_voice_memory(text, reply or "")
            if reply is None:
                return

            self._speak(msg_id, reply)
        finally:
            if self._machine.state != VoiceState.IDLE:
                self._machine.transition(VoiceState.IDLE, "cleanup")
            self._active_id = None
            self._set_busy(False)
            self._lock.release()

    def _note_voice_memory(self, spoken: str, reply: str) -> None:
        if self._memory is None:
            return
        try:
            self._memory.append_session_turn("user", "voice", spoken[:200])
            if reply:
                self._memory.append_session_turn("bunny", "voice", reply[:200])
            self._memory.maybe_remember_voice(spoken)
        except Exception:  # noqa: BLE001
            pass

    def _speak(self, msg_id: str, reply: str) -> None:
        if not self._advance(msg_id, VoiceState.SPEAKING, "tts"):
            return
        self._tts.speak(reply, self._cancel)
        if self._cancel.is_set():
            self._write(error_msg(msg_id, "cancelled"))
            return
        self._machine.transition(VoiceState.IDLE, "done")

    def _fail_spoken(self, msg_id: str, spoken: str, log_error: str) -> None:
        """Surface the failure on the pill AND say it out loud."""
        self._write(error_msg(msg_id, log_error))
        try:
            self._tts.speak(spoken, self._cancel)
        except Exception:  # noqa: BLE001
            pass
        if self._machine.state != VoiceState.IDLE:
            self._machine.cancel("error")

    def _record(self, auto_stop: bool) -> None:
        if auto_stop:
            self._wait_for_silence()
        else:
            self._wait_for_ptt_release()
        if self._audio.is_recording:
            self._pending_samples = self._audio.stop()

    def _wait_for_ptt_release(self) -> None:
        """Hold until stop_listen, publishing loudness so the pill can react."""
        window = int(SAMPLE_RATE * 0.12)
        deadline = time.monotonic() + MAX_SESSION_SECS
        while not self._stop_event.is_set() and not self._cancel.is_set():
            if time.monotonic() >= deadline:
                return
            rms = self._audio.recent_rms(window)
            level = _level_from_rms(rms)
            hearing = rms >= _LEVEL_HEARING_RMS
            self._write(
                stream_msg(
                    self._active_id or "voice",
                    json.dumps(
                        {
                            "voice_state": "listening",
                            "level": round(level, 3),
                            "hearing": hearing,
                        }
                    ),
                    False,
                )
            )
            # Wait in small slices so stop_listen stays responsive.
            self._stop_event.wait(timeout=_LEVEL_POLL_SECS)

    def _wait_for_silence(self) -> None:
        """Stop once the speaker has been quiet for WAKE_SILENCE_SECS."""
        window = int(SAMPLE_RATE * WAKE_SILENCE_SECS)
        started = time.monotonic()
        heard_speech = False
        while not self._stop_event.is_set() and not self._cancel.is_set():
            elapsed = time.monotonic() - started
            if elapsed >= WAKE_MAX_SECS:
                return
            time.sleep(_VAD_POLL_SECS)
            rms = self._audio.recent_rms(window)
            level = _level_from_rms(rms)
            hearing = rms >= _LEVEL_HEARING_RMS
            self._write(
                stream_msg(
                    self._active_id or "voice",
                    json.dumps(
                        {
                            "voice_state": "listening",
                            "level": round(level, 3),
                            "hearing": hearing,
                        }
                    ),
                    False,
                )
            )
            if elapsed < WAKE_MIN_SECS:
                continue
            loud = rms >= WAKE_SILENCE_RMS
            if loud:
                heard_speech = True
            elif heard_speech:
                return

    def _transcribe(self, msg_id: str) -> str | None:
        samples = self._pending_samples or []
        if not self._advance(msg_id, VoiceState.TRANSCRIBING, "stt"):
            return None
        try:
            engine = self._stt or create_stt()
            self._stt = engine
            text = engine.transcribe(samples)
        except Exception as exc:  # noqa: BLE001
            self._fail_spoken(msg_id, "Speech recognition failed.", f"STT error: {exc}")
            return None

        if self._cancel.is_set():
            self._write(error_msg(msg_id, "cancelled"))
            return None
        if not text.strip():
            self._fail_spoken(
                msg_id,
                "I didn't catch that.",
                "No speech detected",
            )
            return None
        return text

    def _ask(self, msg_id: str, text: str) -> str | None:
        """Resolve the turn. Returns the text to speak, or None to stop."""
        # Fast path: obvious daily intents skip Ollama entirely.
        intent = match_intent(text)
        if intent is not None:
            return self._fulfill(msg_id, intent)

        prompt, screen_err = self._build_prompt(text)
        if screen_err:
            self._fail_spoken(msg_id, screen_err, screen_err)
            return None

        terminal: dict[str, str] = {}

        def write_and_capture(msg: dict) -> None:
            self._write(msg)
            if msg.get("id") == msg_id and msg.get("type") in ("response", "error"):
                terminal["type"] = msg["type"]
                terminal["body"] = msg.get("result") or msg.get("error") or ""

        handle_chat_streaming(
            msg_id,
            self._model,
            text,
            write_and_capture,
            self._cancel,
            lambda _conn: None,
            system_prompt=prompt,
            think=False,
        )

        if self._cancel.is_set():
            return None
        if terminal.get("type") == "error":
            err = terminal.get("body") or "Something went wrong."
            self._fail_spoken(msg_id, _spoken_error(err), err)
            return None

        try:
            body = json.loads(terminal.get("body", "{}"))
        except json.JSONDecodeError:
            self._fail_spoken(
                msg_id,
                "I got a garbled reply from the model.",
                "Model reply was not valid JSON",
            )
            return None

        if not isinstance(body, dict):
            self._fail_spoken(
                msg_id,
                "I got a garbled reply from the model.",
                "Model reply had an unexpected shape",
            )
            return None

        return self._fulfill(msg_id, body)

    def _fulfill(self, msg_id: str, body: dict) -> str | None:
        """Turn a respond/action result into spoken text, executing actions."""
        kind = body.get("kind")
        if kind == "action":
            action = body.get("action")
            if not isinstance(action, dict):
                self._fail_spoken(
                    msg_id,
                    "I couldn't run that action.",
                    "Action payload missing",
                )
                return None
            try:
                if isinstance(action.get("action"), str) and str(action["action"]).startswith(
                    "browser_"
                ):
                    from browser_actions import handle_browser_action

                    spoken = handle_browser_action(action, self._write, msg_id)
                else:
                    spoken = execute_local(action)
            except Exception as exc:  # noqa: BLE001
                self._fail_spoken(msg_id, _spoken_error(str(exc)), str(exc))
                return None
            # Mirror a respond frame so the Chat voice log gets the outcome.
            self._write(
                stream_msg(
                    msg_id,
                    spoken,
                    False,
                )
            )
            return spoken

        if kind != "respond":
            self._fail_spoken(
                msg_id,
                "I couldn't finish that request.",
                f"Unexpected reply kind: {kind!r}",
            )
            return None

        spoken = str(body.get("text") or "").strip()
        if not spoken:
            self._fail_spoken(
                msg_id,
                "I couldn't form an answer.",
                "Model returned an empty answer",
            )
            return None
        return spoken

    def _build_prompt(self, spoken: str) -> tuple[str, str | None]:
        """Memory + optional screen block. Returns (prompt, spoken_error)."""
        if self._memory is None:
            return SYSTEM_PROMPT, None
        try:
            from screen_context import enrich_prompt_with_screen

            base = self._memory.build_prompt_prefix()
            return enrich_prompt_with_screen(self._memory, base, spoken)
        except Exception:  # noqa: BLE001
            return SYSTEM_PROMPT, None


def _spoken_error(error: str) -> str:
    """Map a technical failure to a short sentence Bunny can say aloud."""
    text = error.lower()
    if "no speech" in text:
        return "I didn't catch that."
    if "muted" in text:
        return "Your microphone is muted."
    if "ollama" in text or "unreachable" in text:
        return "Ollama isn't running. Start it and try again."
    if "not found in ollama" in text or "no chat model" in text:
        return "No chat model is installed in Ollama."
    if "not found" in text and "app" in text:
        return "I couldn't find that app."
    if "reply too long" in text or "exceeds" in text:
        return "That reply got too long. Try a shorter question."
    if "empty answer" in text:
        return "I couldn't form an answer."
    if "https" in text:
        return "I can only open secure HTTPS links."
    if "sounddevice" in text or "no input" in text:
        return "I can't reach your microphone."
    if "privacy" in text or "access is denied" in text:
        return "Windows is blocking the microphone."
    return "Sorry, something went wrong."
