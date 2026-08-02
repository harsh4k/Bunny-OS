import type { ReactNode } from "react";
import { friendlyError } from "../lib/voiceStatus";
import {
  IconApps,
  IconMemory,
  IconMic,
  IconMicOff,
  IconModels,
  IconRecover,
  IconTalk,
  IconWave,
} from "./icons";
import styles from "./CompactPanel.module.css";

export type ServiceTone = "ok" | "warn" | "off" | "unknown";

export interface ServiceSnapshot {
  helper: ServiceTone;
  ollama: ServiceTone;
  apps: number | null;
}

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
  services: ServiceSnapshot;
  onRecover: () => void;
  onToggleMute: () => void;
  onTalkDown: () => void;
  onTalkUp: () => void;
  onOpenMicPrivacy: () => void;
  onOpen: (view: "advisor" | "chat" | "learning" | "wake" | "apps" | "updates") => void;
  onQuit: () => void;
}

function toneWord(tone: ServiceTone): string {
  switch (tone) {
    case "ok":
      return "ready";
    case "warn":
      return "check";
    case "off":
      return "off";
    default:
      return "…";
  }
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
  services,
  onRecover,
  onToggleMute,
  onTalkDown,
  onTalkUp,
  onOpenMicPrivacy,
  onOpen,
  onQuit,
}: Props) {
  const showReason =
    (status === "degraded" || status === "error") && Boolean(reason);
  const appsLabel =
    services.apps == null ? "Apps …" : `Apps ${services.apps}`;

  return (
    <div className={styles.overview}>
      <header className={styles.overviewHead}>
        <h1 className={styles.headline}>
          Talk to your computer. You know… <em>naturally</em>
        </h1>
        <div className={styles.statusLine} data-status={status} role="status">
          <span className={styles.statusDot} aria-hidden="true" />
          <div className={styles.statusCopy}>
            <p className={styles.statusTitle}>{statusLabel}</p>
            <p className={styles.statusDetail}>
              Mic {micMuted ? "muted" : "live"}
              <span aria-hidden="true"> · </span>
              Voice {voiceState}
              {crashCount > 0 ? (
                <>
                  <span aria-hidden="true"> · </span>
                  {crashCount} restarts
                </>
              ) : null}
              {lastCrashAt != null ? (
                <>
                  <span aria-hidden="true"> · </span>
                  last {new Date(lastCrashAt).toLocaleTimeString()}
                </>
              ) : null}
            </p>
            {showReason ? (
              <p className={styles.statusReason}>{friendlyError(reason!)}</p>
            ) : null}
          </div>
        </div>

        <p className={styles.serviceLine} aria-label="Local services">
          <span data-tone={services.helper}>Helper {toneWord(services.helper)}</span>
          <span aria-hidden="true">·</span>
          <span data-tone={services.ollama}>Ollama {toneWord(services.ollama)}</span>
          <span aria-hidden="true">·</span>
          <button
            type="button"
            className={styles.serviceLink}
            data-tone={
              services.apps == null
                ? "unknown"
                : services.apps > 0
                  ? "ok"
                  : "warn"
            }
            onClick={() => onOpen("apps")}
          >
            {appsLabel}
          </button>
        </p>
      </header>

      <section className={styles.talkBlock} aria-label="Voice">
        <p className={styles.talkHint}>
          Hold {pttKey} anywhere, or hold Talk here.
        </p>
        <div className={styles.talkRow}>
          <button
            type="button"
            className={styles.talkBtn}
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
            <IconTalk size={18} />
            Talk
          </button>
          <button
            type="button"
            className={styles.muteBtn}
            onClick={onToggleMute}
            aria-label={micMuted ? "Unmute microphone" : "Mute microphone"}
          >
            {micMuted ? <IconMicOff size={16} /> : <IconMic size={16} />}
            {micMuted ? "Muted" : "Live"}
          </button>
        </div>
        {canRecover ? (
          <button type="button" className={styles.recoverBtn} onClick={onRecover}>
            <IconRecover size={15} />
            Recover helper
          </button>
        ) : null}
      </section>

      <nav className={styles.destList} aria-label="Open settings">
        <Dest
          label="Models"
          hint="Local Ollama"
          icon={<IconModels size={16} />}
          onClick={() => onOpen("advisor")}
        />
        <Dest
          label="Learning"
          hint="What Bunny picks up"
          icon={<IconMemory size={16} />}
          onClick={() => onOpen("learning")}
          disabled={!ready}
        />
        <Dest
          label="Apps"
          hint="Catalog & scan"
          icon={<IconApps size={16} />}
          onClick={() => onOpen("apps")}
        />
        <Dest
          label="Voice & wake"
          hint={`Phrase + ${pttKey}`}
          icon={<IconWave size={16} />}
          onClick={() => onOpen("wake")}
          disabled={!ready}
        />
      </nav>

      <footer className={styles.overviewFoot}>
        <button type="button" className={styles.footLink} onClick={onOpenMicPrivacy}>
          Mic privacy settings
        </button>
        <span aria-hidden="true">·</span>
        <button type="button" className={styles.footLinkDanger} onClick={onQuit}>
          Quit
        </button>
      </footer>
    </div>
  );
}

function Dest({
  label,
  hint,
  icon,
  onClick,
  disabled,
}: {
  label: string;
  hint: string;
  icon: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className={styles.dest}
      onClick={onClick}
      disabled={disabled}
    >
      <span className={styles.destIcon} aria-hidden="true">
        {icon}
      </span>
      <span className={styles.destText}>
        <span className={styles.destLabel}>{label}</span>
        <span className={styles.destHint}>{hint}</span>
      </span>
      <span className={styles.destChevron} aria-hidden="true" />
    </button>
  );
}
