"""Voice state machine tests."""
from __future__ import annotations

import unittest

from voice_state import VoiceMachine, VoiceState


class TestVoiceState(unittest.TestCase):
    def test_start_listen_from_idle(self):
        m = VoiceMachine(muted=False)
        self.assertTrue(m.start_listen())
        self.assertEqual(m.state, VoiceState.LISTENING)

    def test_muted_blocks_listen(self):
        m = VoiceMachine(muted=True)
        self.assertFalse(m.start_listen())
        self.assertEqual(m.state, VoiceState.IDLE)

    def test_cancel_from_any_active(self):
        m = VoiceMachine(muted=False)
        m.start_listen()
        m.transition(VoiceState.TRANSCRIBING)
        m.cancel("user")
        self.assertEqual(m.state, VoiceState.IDLE)

    def test_mute_cancels_active(self):
        m = VoiceMachine(muted=False)
        m.start_listen()
        m.set_mute(True)
        self.assertTrue(m.muted)
        self.assertEqual(m.state, VoiceState.IDLE)

    def test_illegal_transition_rejected(self):
        m = VoiceMachine()
        self.assertFalse(m.transition(VoiceState.SPEAKING))


if __name__ == "__main__":
    unittest.main()
