"""
Voice state machine for Bunny OS.

States: idle → listening → transcribing → thinking → acting/speaking → idle
Cancel and mute are valid from every active state.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Callable


class VoiceState(str, Enum):
    IDLE = "idle"
    LISTENING = "listening"
    TRANSCRIBING = "transcribing"
    THINKING = "thinking"
    SPEAKING = "speaking"  # covers acting/speaking in the UI


ACTIVE = frozenset(
    {
        VoiceState.LISTENING,
        VoiceState.TRANSCRIBING,
        VoiceState.THINKING,
        VoiceState.SPEAKING,
    }
)

_TRANSITIONS: dict[VoiceState, frozenset[VoiceState]] = {
    VoiceState.IDLE: frozenset({VoiceState.LISTENING}),
    VoiceState.LISTENING: frozenset(
        {VoiceState.TRANSCRIBING, VoiceState.IDLE}
    ),
    VoiceState.TRANSCRIBING: frozenset(
        {VoiceState.THINKING, VoiceState.IDLE}
    ),
    VoiceState.THINKING: frozenset({VoiceState.SPEAKING, VoiceState.IDLE}),
    VoiceState.SPEAKING: frozenset({VoiceState.IDLE}),
}


@dataclass
class VoiceMachine:
    state: VoiceState = VoiceState.IDLE
    muted: bool = True
    cancel_requested: bool = False
    reason: str = ""
    on_change: Callable[[VoiceState, str], None] | None = field(default=None, repr=False)

    def _emit(self) -> None:
        if self.on_change:
            self.on_change(self.state, self.reason)

    def can(self, target: VoiceState) -> bool:
        return target in _TRANSITIONS[self.state]

    def transition(self, target: VoiceState, reason: str = "") -> bool:
        if not self.can(target):
            return False
        self.state = target
        self.reason = reason
        if target == VoiceState.IDLE:
            self.cancel_requested = False
        self._emit()
        return True

    def set_mute(self, muted: bool) -> None:
        self.muted = muted
        if muted and self.state in ACTIVE:
            self.cancel("muted")

    def cancel(self, reason: str = "cancelled") -> None:
        """Cancel from any active state → idle."""
        if self.state == VoiceState.IDLE:
            return
        self.cancel_requested = True
        self.state = VoiceState.IDLE
        self.reason = reason
        self._emit()

    def start_listen(self) -> bool:
        if self.muted:
            self.reason = "microphone muted"
            return False
        return self.transition(VoiceState.LISTENING, "push-to-talk")
