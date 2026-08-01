import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { applyIslandCssVars } from "../lib/islandGeometry";
import { useVoiceStatus } from "../lib/useVoiceStatus";
import {
  ACTIVE_VOICE_STATES,
  levelBars,
  shortErrorLabel,
} from "../lib/voiceStatus";
import { IconStop } from "./icons";
import styles from "./VoicePill.module.css";

interface Props {
  onExpand: () => void;
  /** Kept in sync with App so the auto-hide timer pauses while pointed at. */
  onHoverChange?: (hovered: boolean) => void;
}

const BAR_COUNT = 7;

export function VoicePill({ onExpand, onHoverChange }: Props) {
  const { state: voiceState, error, level, hearing } = useVoiceStatus();
  const [pttKey, setPttKey] = useState("F9");

  useEffect(() => {
    applyIslandCssVars();
    invoke<string>("get_ptt_label")
      .then((key) => {
        if (typeof key === "string" && key) setPttKey(key);
      })
      .catch(() => {});
  }, []);

  // Short labels keep one capsule shape; CSS ellipsis handles overflow.
  const label = useMemo(() => {
    if (error) return shortErrorLabel(error);
    switch (voiceState) {
      case "listening":
        return hearing ? "Hearing you" : "Listening…";
      case "transcribing":
        return "Transcribing";
      case "thinking":
        return "Thinking";
      case "speaking":
        return "Speaking";
      default:
        return `Hold ${pttKey} to talk`;
    }
  }, [error, voiceState, hearing, pttKey]);

  const stop = useCallback(async () => {
    await invoke("send_action", {
      id: crypto.randomUUID(),
      payload: { action: "cancel_voice" },
    });
  }, []);

  const active = ACTIVE_VOICE_STATES.has(voiceState);
  const listening = voiceState === "listening";
  const tone = error ? "error" : listening && hearing ? "hearing" : active ? "active" : "idle";
  const bars = listening ? levelBars(level, BAR_COUNT) : null;

  return (
    <section
      className={styles.stage}
      aria-label="Bunny voice notification"
    >
      <div
        className={styles.pill}
        data-active={active}
        data-tone={tone}
        onMouseEnter={() => onHoverChange?.(true)}
        onMouseLeave={() => onHoverChange?.(false)}
      >
        <button
          type="button"
          className={styles.expand}
          onClick={onExpand}
          aria-label={`${label}. Open Bunny OS`}
          title={error ? label : undefined}
          aria-expanded="false"
        >
          <span className={styles.dot} data-active={active} data-tone={tone} aria-hidden="true" />
          <span className={styles.label}>{label}</span>
          <MicrophoneIcon active={active || listening} />
          <span
            className={styles.waveform}
            data-active={active}
            data-live={listening}
            aria-hidden="true"
          >
            {Array.from({ length: BAR_COUNT }, (_, index) => (
              <i
                key={index}
                style={
                  {
                    "--bar-index": index,
                    "--bar-level": bars ? bars[index] : undefined,
                  } as React.CSSProperties
                }
              />
            ))}
          </span>
        </button>
        <button
          type="button"
          className={styles.stop}
          aria-label="Stop voice session"
          disabled={!active}
          onClick={() => void stop()}
        >
          <IconStop size={10} />
        </button>
      </div>
    </section>
  );
}

function MicrophoneIcon({ active }: { active: boolean }) {
  return (
    <svg
      className={styles.mic}
      data-active={active}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <rect x="8" y="2.5" width="8" height="13" rx="4" />
      <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3.5M8.5 21.5h7" />
    </svg>
  );
}
