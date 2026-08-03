/**
 * Home — spatial voice stage (VisionOS depth + FundFlow widget presence).
 * Local-only Bunny: atmosphere image is bundled, no remote assets.
 */
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
import homeAtmosphere from "../assets/home-atmosphere.png";
import styles from "./OverviewPane.module.css";

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
    services.apps == null ? "…" : String(services.apps);

  return (
    <div className={styles.home}>
      <section className={styles.stage} aria-label="Voice stage">
        <div className={styles.stageBezel}>
          <div className={styles.stageInner}>
            <img
              className={styles.stagePhoto}
              src={homeAtmosphere}
              alt=""
              draggable={false}
            />
            <div className={styles.stageShade} aria-hidden="true" />
            <div className={styles.stageOrbs} aria-hidden="true">
              <span className={styles.orbA} />
              <span className={styles.orbB} />
              <span className={styles.orbC} />
            </div>

            <div className={styles.stageTop}>
              <span className={styles.eyebrow}>On this PC</span>
              <div className={styles.statusPill} data-status={status} role="status">
                <span className={styles.statusDot} aria-hidden="true" />
                <span className={styles.statusLabel}>{statusLabel}</span>
                <span className={styles.statusSep} aria-hidden="true">
                  ·
                </span>
                <span className={styles.statusMeta}>
                  Mic {micMuted ? "muted" : "live"} · {voiceState}
                  {crashCount > 0 ? ` · ${crashCount} restarts` : ""}
                </span>
              </div>
            </div>

            <div className={styles.stageCopy}>
              <h1 className={styles.headline}>
                Talk to your computer.
                <br />
                You know… <em>naturally</em>
              </h1>
              {showReason ? (
                <p className={styles.reason}>{friendlyError(reason!)}</p>
              ) : (
                <p className={styles.lede}>
                  Hold {pttKey} anywhere — or press Talk on the stage.
                </p>
              )}
            </div>

            <div className={styles.stageActions}>
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
                <span className={styles.talkIcon} aria-hidden="true">
                  <IconTalk size={16} />
                </span>
                Talk
              </button>
              <button
                type="button"
                className={styles.muteBtn}
                onClick={onToggleMute}
                aria-label={micMuted ? "Unmute microphone" : "Mute microphone"}
              >
                {micMuted ? <IconMicOff size={15} /> : <IconMic size={15} />}
                {micMuted ? "Muted" : "Live"}
              </button>
              {canRecover ? (
                <button
                  type="button"
                  className={styles.recoverBtn}
                  onClick={onRecover}
                >
                  <IconRecover size={14} />
                  Recover
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <section className={styles.metrics} aria-label="Local services">
        <button
          type="button"
          className={styles.metric}
          data-tone={services.helper}
          onClick={() => onOpen("updates")}
        >
          <span className={styles.metricLabel}>Helper</span>
          <span className={styles.metricValue}>{toneWord(services.helper)}</span>
        </button>
        <button
          type="button"
          className={styles.metric}
          data-tone={services.ollama}
          onClick={() => onOpen("advisor")}
        >
          <span className={styles.metricLabel}>Ollama</span>
          <span className={styles.metricValue}>{toneWord(services.ollama)}</span>
        </button>
        <button
          type="button"
          className={styles.metric}
          data-tone={
            services.apps == null
              ? "unknown"
              : services.apps > 0
                ? "ok"
                : "warn"
          }
          onClick={() => onOpen("apps")}
        >
          <span className={styles.metricLabel}>Apps</span>
          <span className={styles.metricValue}>{appsLabel}</span>
        </button>
        <button
          type="button"
          className={styles.metric}
          data-tone={micMuted ? "warn" : "ok"}
          onClick={onOpenMicPrivacy}
        >
          <span className={styles.metricLabel}>Mic</span>
          <span className={styles.metricValue}>{micMuted ? "muted" : "live"}</span>
        </button>
      </section>

      <nav className={styles.bento} aria-label="Open settings">
        <Tile
          tone="sky"
          label="Models"
          hint="Local Ollama chat"
          icon={<IconModels size={18} />}
          onClick={() => onOpen("advisor")}
        />
        <Tile
          tone="sand"
          label="Learning"
          hint="What Bunny remembers"
          icon={<IconMemory size={18} />}
          onClick={() => onOpen("learning")}
          disabled={!ready}
        />
        <Tile
          tone="mint"
          label="Apps"
          hint="Catalog & nicknames"
          icon={<IconApps size={18} />}
          onClick={() => onOpen("apps")}
        />
        <Tile
          tone="ink"
          label="Voice"
          hint={`Wake + ${pttKey}`}
          icon={<IconWave size={18} />}
          onClick={() => onOpen("wake")}
          disabled={!ready}
        />
      </nav>

      <footer className={styles.foot}>
        <span className={styles.footNote}>No Bunny cloud. Everything stays here.</span>
        <div className={styles.footLinks}>
          <button type="button" className={styles.footLink} onClick={() => onOpen("updates")}>
            Updates
          </button>
          <button type="button" className={styles.footLinkDanger} onClick={onQuit}>
            Quit
          </button>
        </div>
      </footer>
    </div>
  );
}

function Tile({
  label,
  hint,
  icon,
  onClick,
  disabled,
  tone,
}: {
  label: string;
  hint: string;
  icon: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone: "sky" | "sand" | "mint" | "ink";
}) {
  return (
    <button
      type="button"
      className={styles.tile}
      data-tone={tone}
      onClick={onClick}
      disabled={disabled}
    >
      <span className={styles.tileIcon} aria-hidden="true">
        {icon}
      </span>
      <span className={styles.tileCopy}>
        <span className={styles.tileLabel}>{label}</span>
        <span className={styles.tileHint}>{hint}</span>
      </span>
      <span className={styles.tileGo} aria-hidden="true">
        →
      </span>
    </button>
  );
}
