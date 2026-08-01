import type { ReactNode } from "react";
import {
  IconChat,
  IconMemory,
  IconMic,
  IconMicOff,
  IconModels,
  IconRecover,
  IconTalk,
  IconWave,
} from "./icons";
import styles from "./CompactPanel.module.css";

interface Props {
  status: string;
  statusLabel: string;
  reason: string | null;
  crashCount: number;
  lastCrashAt: number | null;
  micMuted: boolean;
  voiceState: string;
  /** Key combo bound to global push-to-talk, e.g. "F9". */
  pttKey: string;
  ready: boolean;
  canRecover: boolean;
  onRecover: () => void;
  onToggleMute: () => void;
  onTalkDown: () => void;
  onTalkUp: () => void;
  onOpenMicPrivacy: () => void;
  onOpen: (view: "advisor" | "chat" | "memory" | "wake") => void;
  onQuit: () => void;
}

export function OverviewPane({
  status,
  statusLabel,
  reason,
  crashCount,
  lastCrashAt,
  micMuted,
  voiceState,
  pttKey,
  ready,
  canRecover,
  onRecover,
  onToggleMute,
  onTalkDown,
  onTalkUp,
  onOpenMicPrivacy,
  onOpen,
  onQuit,
}: Props) {
  return (
    <div className={styles.scroll}>
      <div className={styles.statusBanner} data-status={status} role="status">
        <div className={styles.dot} aria-hidden="true" />
        <div className={styles.statusText}>
          <div className={styles.statusLabel}>{statusLabel}</div>
          {reason && <div className={styles.statusReason}>{reason}</div>}
        </div>
      </div>

      <div className={styles.body}>
        <div className={styles.metrics}>
          <div className={styles.metric}>
            <span className={styles.metricLabel}>Crashes</span>
            <span className={styles.metricValue}>{crashCount}</span>
          </div>
          <div className={styles.metric}>
            <span className={styles.metricLabel}>Mic</span>
            <span className={styles.metricValue}>{micMuted ? "Muted" : "Live"}</span>
          </div>
          <div className={styles.metric}>
            <span className={styles.metricLabel}>Voice</span>
            <span className={styles.metricValue}>{voiceState}</span>
          </div>
          <div className={styles.metric}>
            <span className={styles.metricLabel}>Hotkey</span>
            <span className={styles.metricValue}>Hold {pttKey}</span>
          </div>
        </div>
        {lastCrashAt != null && (
          <div className={styles.metric}>
            <span className={styles.metricLabel}>Last crash</span>
            <span className={styles.metricValue}>
              {new Date(lastCrashAt).toLocaleTimeString()}
            </span>
          </div>
        )}
      </div>

      <div className={styles.actions}>
        {canRecover && (
          <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={onRecover}>
            <IconRecover size={16} />
            Recover
          </button>
        )}
        <div className={styles.btnRow}>
          <button
            className={`${styles.btn} ${styles.btnSecondary}`}
            onClick={onToggleMute}
            aria-label={micMuted ? "Unmute microphone" : "Mute microphone"}
          >
            {micMuted ? <IconMicOff size={16} /> : <IconMic size={16} />}
            {micMuted ? "Unmute" : "Mute"}
          </button>
          <button
            className={`${styles.btn} ${styles.btnPrimary}`}
            disabled={!ready}
            aria-label="Push to talk"
            title={
              micMuted
                ? `Hold to talk (unmutes for this hold). Or hold ${pttKey} anywhere.`
                : `Hold to talk (or hold ${pttKey} anywhere)`
            }
            onMouseDown={onTalkDown}
            onMouseUp={onTalkUp}
            onMouseLeave={onTalkUp}
            onTouchStart={(e) => {
              e.preventDefault();
              onTalkDown();
            }}
            onTouchEnd={(e) => {
              e.preventDefault();
              onTalkUp();
            }}
          >
            <IconTalk size={16} />
            Talk
          </button>
        </div>
        <button
          className={`${styles.btn} ${styles.btnGhost}`}
          onClick={onOpenMicPrivacy}
          title="Desktop apps use Windows Privacy settings instead of an in-app prompt"
        >
          Windows mic permission…
        </button>
        <div className={styles.quickGrid}>
          <Tile
            label="Models"
            hint="Pick a local Ollama model"
            icon={<IconModels size={18} className={styles.tileIcon} />}
            onClick={() => onOpen("advisor")}
            ariaLabel="Open model advisor"
          />
          <Tile
            label="Chat"
            hint="Typed conversation"
            icon={<IconChat size={18} className={styles.tileIcon} />}
            onClick={() => onOpen("chat")}
            disabled={!ready}
            ariaLabel="Open assistant chat"
          />
          <Tile
            label="Memory"
            hint="Review & export"
            icon={<IconMemory size={18} className={styles.tileIcon} />}
            onClick={() => onOpen("memory")}
            disabled={!ready}
            ariaLabel="Open memory controls"
          />
          <Tile
            label="Wake"
            hint={`Wake phrase + ${pttKey}`}
            icon={<IconWave size={18} className={styles.tileIcon} />}
            onClick={() => onOpen("wake")}
            disabled={!ready}
            ariaLabel="Open wake word settings"
          />
        </div>
        <button className={`${styles.btn} ${styles.btnGhost}`} onClick={onQuit}>
          Quit Bunny OS
        </button>
      </div>
    </div>
  );
}

function Tile({
  label,
  hint,
  icon,
  onClick,
  disabled,
  ariaLabel,
}: {
  label: string;
  hint: string;
  icon: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      className={styles.tile}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
    >
      {icon}
      <span className={styles.tileLabel}>{label}</span>
      <span className={styles.tileHint}>{hint}</span>
    </button>
  );
}
