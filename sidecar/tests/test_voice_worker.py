"""Voice worker cancel/mute tests with fakes."""
from __future__ import annotations

import contextlib
import json
import threading
import time
import unittest
from unittest import mock

import voice_worker as voice_worker_module
from audio_pipeline import AudioPipeline
from stt import FakeStt
from tts import FakeTts
from voice_state import VoiceState
from voice_worker import VoiceWorker


class SilentAudio(AudioPipeline):
    def start(self) -> None:
        self._recording = True

    def stop(self):
        self._recording = False
        return [0.01] * 1600  # 0.1s of non-empty PCM


class _BlockingTts(FakeTts):
    """Blocks inside speak() so a turn can be caught mid-playback."""

    def __init__(self) -> None:
        super().__init__()
        self.speaking = threading.Event()
        self._release = threading.Event()

    def speak(self, text, cancel_event=None):  # noqa: ANN001
        self.spoken.append(text)
        self.speaking.set()
        while not self._release.is_set():
            if cancel_event is not None and cancel_event.is_set():
                return
            time.sleep(0.02)

    def stop(self) -> None:
        self.stopped += 1
        self._release.set()


@contextlib.contextmanager
def _stub_chat_raw(result_body: str):
    """Answer the chat turn with an exact result payload."""

    def fake_chat(msg_id, _model, _text, write, _cancel, _on_conn, **_kw):
        write({"type": "response", "id": msg_id, "result": result_body})

    with mock.patch.object(
        voice_worker_module, "handle_chat_streaming", side_effect=fake_chat
    ):
        yield


def _stub_chat(reply: str):
    """Answer the chat turn locally so the test never needs Ollama."""
    return _stub_chat_raw(json.dumps({"kind": "respond", "text": reply}))


class TestVoiceWorker(unittest.TestCase):
    def test_mute_blocks_start(self):
        msgs = []
        w = VoiceWorker(write_fn=msgs.append, stt=FakeStt(), tts=FakeTts(), audio=SilentAudio())
        w.set_mute(True)
        self.assertFalse(w.start_listen("id1", "m"))

    def test_cancel_returns_to_idle(self):
        msgs = []
        w = VoiceWorker(write_fn=msgs.append, stt=FakeStt("hi"), tts=FakeTts(), audio=SilentAudio())
        w.set_mute(False)
        self.assertTrue(w.start_listen("id2", "m"))
        time.sleep(0.05)
        out = w.cancel("id2")
        self.assertEqual(out["status"], "cancelled")
        deadline = time.time() + 2
        while w.state != VoiceState.IDLE and time.time() < deadline:
            time.sleep(0.02)
        self.assertEqual(w.state, VoiceState.IDLE)

    def test_omitted_model_defers_to_whatever_is_installed(self):
        """A hardcoded default dead-ends on machines that never pulled it."""
        w = VoiceWorker(
            write_fn=lambda _m: None, stt=FakeStt("hi"), tts=FakeTts(), audio=SilentAudio()
        )
        w.set_mute(False)
        self.assertTrue(w.start_listen("id3", None))
        self.assertIsNone(w._model)
        w.cancel("id3")

    def test_busy_callback_brackets_the_session(self):
        """Wake must release the microphone for the duration of a voice turn."""
        busy: list[bool] = []
        w = VoiceWorker(
            write_fn=lambda _m: None,
            stt=FakeStt("hi"),
            tts=FakeTts(),
            audio=SilentAudio(),
            on_busy_change=busy.append,
        )
        w.set_mute(False)
        self.assertTrue(w.start_listen("id4", None))
        self.assertEqual(busy[0], True)
        w.cancel("id4")
        # cancel() flips state to IDLE synchronously, so wait on the session
        # thread's own cleanup rather than on the state machine.
        deadline = time.time() + 2
        while len(busy) < 2 and time.time() < deadline:
            time.sleep(0.02)
        self.assertEqual(busy, [True, False])

    def test_remute_after_release_still_answers(self):
        """Push-to-talk remutes on key release; the captured turn is still owed.

        Regression: muting cancelled the turn after the audio was already in
        hand, so Bunny heard the question and then silently dropped it.
        """
        tts = FakeTts()
        busy: list[bool] = []
        w = VoiceWorker(
            write_fn=lambda _m: None,
            stt=FakeStt("what is two plus two"),
            tts=tts,
            audio=SilentAudio(),
            on_busy_change=busy.append,
        )
        w.set_mute(False)
        with _stub_chat("four"):
            self.assertTrue(w.start_listen("ptt-1", None))
            w.stop_listen("ptt-1")
            w.set_mute(True)  # exactly what the F9 hotkey does on release

            deadline = time.time() + 5
            while busy[-1:] != [False] and time.time() < deadline:
                time.sleep(0.02)

        self.assertTrue(w.muted, "mic must end up muted again")
        self.assertEqual(tts.spoken, ["four"], "the answer should still be spoken")

    def test_mute_while_mic_open_abandons_the_turn(self):
        """Muting mid-sentence is a privacy stop, not a deferred answer."""
        tts = FakeTts()
        w = VoiceWorker(
            write_fn=lambda _m: None,
            stt=FakeStt("hello"),
            tts=tts,
            audio=SilentAudio(),
        )
        w.set_mute(False)
        self.assertTrue(w.start_listen("ptt-2", None))
        time.sleep(0.05)
        w.set_mute(True)  # mic still open — no stop_listen first

        deadline = time.time() + 5
        while w.state != VoiceState.IDLE and time.time() < deadline:
            time.sleep(0.02)
        self.assertEqual(w.state, VoiceState.IDLE)
        self.assertFalse(tts.spoken, "a cancelled turn must not speak")

    def _run_turn(self, tts, chat_ctx, msg_id="turn-1", heard="tell me a joke"):
        """Drive one complete push-to-talk turn and return emitted messages."""
        msgs: list[dict] = []
        busy: list[bool] = []
        w = VoiceWorker(
            write_fn=msgs.append,
            stt=FakeStt(heard),
            tts=tts,
            audio=SilentAudio(),
            on_busy_change=busy.append,
        )
        w.set_mute(False)
        with chat_ctx:
            self.assertTrue(w.start_listen(msg_id, None))
            w.stop_listen(msg_id)
            deadline = time.time() + 5
            while busy[-1:] != [False] and time.time() < deadline:
                time.sleep(0.02)
        return msgs

    def test_unparseable_reply_is_reported_not_echoed(self):
        """Regression: a bad reply fell back to speaking the user's own
        question, which reads as an answer and hides the real failure."""
        tts = FakeTts()
        msgs = self._run_turn(tts, _stub_chat_raw("not json at all"))
        self.assertTrue(tts.spoken, "errors must be spoken aloud")
        self.assertFalse(
            any("joke" in s.lower() for s in tts.spoken),
            "must not read the question back",
        )
        errors = [m.get("error") for m in msgs if m.get("type") == "error"]
        self.assertTrue(any("not valid JSON" in e for e in errors), errors)

    def test_empty_reply_is_reported_not_echoed(self):
        tts = FakeTts()
        msgs = self._run_turn(
            tts, _stub_chat_raw(json.dumps({"kind": "respond", "text": ""}))
        )
        self.assertTrue(tts.spoken)
        self.assertIn("couldn't form an answer", tts.spoken[0].lower())
        errors = [m.get("error") for m in msgs if m.get("type") == "error"]
        self.assertTrue(any("empty answer" in e for e in errors), errors)

    def test_time_intent_skips_ollama(self):
        tts = FakeTts()
        msgs = self._run_turn(
            tts,
            _stub_chat_raw("SHOULD_NOT_BE_CALLED"),
            heard="what time is it rn",
        )
        self.assertTrue(tts.spoken)
        self.assertTrue(
            any(s.lower().startswith("it's") for s in tts.spoken),
            tts.spoken,
        )
        self.assertFalse(any(m.get("type") == "error" for m in msgs))

    def test_model_open_app_action_is_executed_and_spoken(self):
        tts = FakeTts()
        action = {"kind": "action", "action": {"action": "open_app", "app_name": "Notepad"}}
        with mock.patch(
            "voice_worker.execute_local", return_value="Opening Notepad."
        ) as exe:
            msgs = self._run_turn(
                tts,
                _stub_chat_raw(json.dumps(action)),
                heard="please do the notepad thing",
            )
        exe.assert_called_once()
        self.assertEqual(tts.spoken, ["Opening Notepad."])
        self.assertFalse(any(m.get("type") == "error" for m in msgs))

    def test_talk_again_while_speaking_barges_in(self):
        """Regression: a second question during playback was refused, so every
        follow-up turned into an error until the first reply finished."""
        slow_tts = _BlockingTts()
        w = VoiceWorker(
            write_fn=lambda _m: None,
            stt=FakeStt("first question"),
            tts=slow_tts,
            audio=SilentAudio(),
        )
        w.set_mute(False)
        with _stub_chat("a long spoken answer"):
            self.assertTrue(w.start_listen("turn-a", None))
            w.stop_listen("turn-a")
            self.assertTrue(
                slow_tts.speaking.wait(timeout=5), "first turn never reached TTS"
            )
            # Second press lands while the first answer is still being spoken.
            self.assertTrue(
                w.start_listen("turn-b", None), w.reject_reason or "barge-in refused"
            )
            w.cancel("turn-b")

    def test_reject_reason_names_the_actual_problem(self):
        w = VoiceWorker(
            write_fn=lambda _m: None, stt=FakeStt(), tts=FakeTts(), audio=SilentAudio()
        )
        w.set_mute(True)
        self.assertFalse(w.start_listen("x", None))
        self.assertIn("muted", w.reject_reason.lower())

    def test_mute_blocks_wake_session(self):
        w = VoiceWorker(
            write_fn=lambda _m: None, stt=FakeStt(), tts=FakeTts(), audio=SilentAudio()
        )
        w.set_mute(True)
        self.assertFalse(w.start_wake_session())


if __name__ == "__main__":
    unittest.main()
