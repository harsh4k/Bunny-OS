/**
 * Dynamic Island — VoiceOS-style notch pill.
 * Flat top flush to the display; large bottom radii; pops out / auto-hides.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { applyIslandCssVars } from "../lib/islandGeometry";
import { useVoiceStatus } from "../lib/useVoiceStatus";
import {
  ACTIVE_VOICE_STATES,
  shortErrorLabel,
} from "../lib/voiceStatus";
import { IconStop } from "./icons";
import styles from "./VoicePill.module.css";

interface Props {
  onExpand: () => void;
  onHoverChange?: (hovered: boolean) => void;
  dormant?: boolean;
}

const AUTO_HIDE_MS = 900;
const INTRO_MS = 2000;

export function VoicePill({ onExpand, onHoverChange, dormant = false }: Props) {
  const { state: voiceState, error, hearing } = useVoiceStatus();
  const [pttKey, setPttKey] = useState("F9");
  const [hovered, setHovered] = useState(false);
  const [introOpen, setIntroOpen] = useState(true);

  useEffect(() => {
    applyIslandCssVars();
    invoke<string>("get_ptt_label")
      .then((key) => {
        if (typeof key === "string" && key) setPttKey(key);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => setIntroOpen(false), INTRO_MS);
    return () => window.clearTimeout(t);
  }, []);

  const active = ACTIVE_VOICE_STATES.has(voiceState);
  const speaking = voiceState === "speaking";
  const busy = active || Boolean(error);

  const wantOpen = introOpen || hovered || busy || !dormant;
  const [open, setOpen] = useState(true);
  useEffect(() => {
    if (wantOpen) {
      setOpen(true);
      return;
    }
    const t = window.setTimeout(() => setOpen(false), AUTO_HIDE_MS);
    return () => window.clearTimeout(t);
  }, [wantOpen]);

  // Single-line label — matches the VoiceOS “Hello.” compact hang.
  const label = useMemo(() => {
    if (error) return shortErrorLabel(error);
    switch (voiceState) {
      case "listening":
        return hearing ? "Hearing you." : "Listening…";
      case "transcribing":
        return "Transcribing…";
      case "thinking":
        return "Thinking…";
      case "speaking":
        return "Speaking.";
      default:
        return `Hold ${pttKey}.`;
    }
  }, [error, voiceState, hearing, pttKey]);

  const stop = useCallback(async () => {
    await invoke("send_action", {
      id: crypto.randomUUID(),
      payload: { action: "cancel_voice" },
    });
  }, []);

  const tone = error
    ? "error"
    : voiceState === "listening" && hearing
      ? "hearing"
      : active
        ? "active"
        : "idle";

  const setHover = (next: boolean) => {
    setHovered(next);
    onHoverChange?.(next);
  };

  const onPrimaryClick = () => {
    if (!open) {
      setHover(true);
      return;
    }
    if (speaking) {
      void stop();
      return;
    }
    onExpand();
  };

  const ariaPrimary = !open
    ? "Show Bunny"
    : speaking
      ? `${label} Stop`
      : `${label} Open Bunny OS`;

  return (
    <section
      className={styles.stage}
      aria-label="Bunny voice notification"
      data-open={open}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {/* Collapsed: thin sleek bar. Expanded: same surface becomes the notch pill. */}
      <div
        className={styles.pill}
        data-open={open}
        data-tone={tone}
        data-active={active}
      >
        <button
          type="button"
          className={styles.hit}
          onClick={onPrimaryClick}
          aria-label={ariaPrimary}
          title={error ? label : undefined}
          aria-expanded={open}
        >
          <span className={styles.dots} aria-hidden="true">
            <i data-on={active || open} />
            <i data-on={active || open} />
            <i data-on={active || open} />
            <i data-on={active || open} />
          </span>
          <span className={styles.label}>{label}</span>
        </button>
        <button
          type="button"
          className={styles.stop}
          aria-label="Stop voice session"
          disabled={!active}
          data-visible={active && open}
          tabIndex={active && open ? 0 : -1}
          onClick={() => void stop()}
        >
          <IconStop size={9} />
        </button>
      </div>
    </section>
  );
}
