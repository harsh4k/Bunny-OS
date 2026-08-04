import type { ReactNode } from "react";
import styles from "./NotificationPill.module.css";

export type NotificationTone = "idle" | "active" | "hearing" | "error";

export type NotificationVariant = "compact" | "media";

export interface MediaProgress {
  /** 0–1 playback progress. */
  value: number;
}

export interface NotificationContentProps {
  variant?: NotificationVariant;
  title: string;
  subtitle?: string;
  tone?: NotificationTone;
  leading?: ReactNode;
  trailing?: ReactNode;
  /** Album art URL — media variant only. */
  artworkSrc?: string;
  artworkAlt?: string;
  progress?: MediaProgress;
}

/**
 * Inner layout: leading | title/subtitle (+ progress) | trailing.
 * Compact for voice; media morphs in artwork + progress when provided.
 */
export function NotificationContent({
  variant = "compact",
  title,
  subtitle,
  tone = "idle",
  leading,
  trailing,
  artworkSrc,
  artworkAlt = "",
  progress,
}: NotificationContentProps) {
  const isMedia = variant === "media";
  const resolvedLeading =
    leading ??
    (isMedia && artworkSrc ? (
      <img className={styles.art} src={artworkSrc} alt={artworkAlt} draggable={false} />
    ) : null);

  return (
    <div className={styles.content} data-variant={variant} data-tone={tone}>
      {resolvedLeading ? <div className={styles.leading}>{resolvedLeading}</div> : null}
      <div className={styles.body}>
        <p className={styles.title}>{title}</p>
        {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
        {isMedia && progress ? (
          <div className={styles.progressTrack} aria-hidden="true">
            <div
              className={styles.progressFill}
              style={{ transform: `scaleX(${clamp01(progress.value)})` }}
            />
          </div>
        ) : null}
      </div>
      {trailing ? <div className={styles.trailing}>{trailing}</div> : null}
    </div>
  );
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.min(1, Math.max(0, n));
}
