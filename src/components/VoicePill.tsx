import { useEffect, useMemo, useRef, useState } from "react";
import {
  NotificationPill,
  applyNotificationCssVars,
} from "./notification";
import type { NotificationTone } from "./notification";
import { applyIslandCssVars } from "../lib/islandGeometry";
import { spinnerIntervalMs, voicePillCopy } from "../lib/voicePillPhrases";
import { useVoiceStatus } from "../lib/useVoiceStatus";
import { ACTIVE_VOICE_STATES, shortErrorLabel } from "../lib/voiceStatus";
import styles from "./notification/NotificationPill.module.css";

interface Props {
  onExpand: () => void;
  /** Kept in sync with App so the auto-hide timer pauses while pointed at. */
  onHoverChange?: (hovered: boolean) => void;
  /** When false, morphs to the compact top notch. */
  open?: boolean;
}

const DOT_COUNT = 4;

export function VoicePill({ onExpand, onHoverChange, open = true }: Props) {
  const { state: voiceState, error, hearing } = useVoiceStatus();
  const [spinnerTick, setSpinnerTick] = useState(0);
  const prevStateRef = useRef(voiceState);

  useEffect(() => {
    applyIslandCssVars();
    applyNotificationCssVars();
  }, []);

  useEffect(() => {
    if (prevStateRef.current !== voiceState) {
      prevStateRef.current = voiceState;
      setSpinnerTick(0);
    }
  }, [voiceState]);

  useEffect(() => {
    if (!open) return;
    const id = window.setInterval(() => {
      setSpinnerTick((t) => t + 1);
    }, spinnerIntervalMs());
    return () => window.clearInterval(id);
  }, [open, voiceState]);

  const { title } = useMemo(
    () =>
      voicePillCopy({
        voiceState,
        hearing,
        error,
        spinnerTick,
        shortError: shortErrorLabel,
      }),
    [voiceState, hearing, error, spinnerTick]
  );

  const active = ACTIVE_VOICE_STATES.has(voiceState);
  const listening = voiceState === "listening";
  const tone: NotificationTone = error
    ? "error"
    : listening && hearing
      ? "hearing"
      : active
        ? "active"
        : "idle";

  return (
    <NotificationPill
      open={open}
      active={active}
      tone={tone}
      title={title}
      onHoverChange={onHoverChange}
      onActivate={onExpand}
      activateLabel={`${title}. Open Bunny OS`}
      activateTitle={error ? title : undefined}
      statusCenter
      trailing={<SpinnerDots active={active || listening || !error} tone={tone} />}
    />
  );
}

function SpinnerDots({
  active,
  tone,
}: {
  active: boolean;
  tone: NotificationTone;
}) {
  return (
    <span className={styles.dots} data-active={active ? "true" : "false"} data-tone={tone} aria-hidden="true">
      {Array.from({ length: DOT_COUNT }, (_, index) => (
        <i key={index} style={{ "--dot-i": index } as React.CSSProperties} />
      ))}
    </span>
  );
}
