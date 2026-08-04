import type { ReactNode } from "react";
import {
  NOTIFICATION_BLUR_PX,
  NOTIFICATION_COLOR,
  NOTIFICATION_SHADOW,
  NOTIFICATION_SIZE,
  NOTIFICATION_SPACING,
} from "./constants";
import { NotificationQueue } from "./NotificationQueue";
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
  artworkSrc?: string;
  artworkAlt?: string;
  progress?: MediaProgress;
}

export interface NotificationPillProps extends NotificationContentProps {
  open?: boolean;
  active?: boolean;
  onHoverChange?: (hovered: boolean) => void;
  /** Optional override of the whole face (skips default layout). */
  children?: ReactNode;
  /** Primary action — leading + text only; trailing stays a sibling. */
  onActivate?: () => void;
  activateLabel?: string;
  activateTitle?: string;
  /** Voice pill: center status text + trailing dots as one cluster. */
  statusCenter?: boolean;
}

export function applyNotificationCssVars(
  el: HTMLElement = document.documentElement
): void {
  el.style.setProperty("--notification-bg", NOTIFICATION_COLOR.bg);
  el.style.setProperty("--notification-bg-hover", NOTIFICATION_COLOR.bgHover);
  el.style.setProperty("--notification-border", NOTIFICATION_COLOR.border);
  el.style.setProperty("--notification-border-hover", NOTIFICATION_COLOR.borderHover);
  el.style.setProperty("--notification-title", NOTIFICATION_COLOR.title);
  el.style.setProperty("--notification-subtitle", NOTIFICATION_COLOR.subtitle);
  el.style.setProperty("--notification-accent", NOTIFICATION_COLOR.accent);
  el.style.setProperty("--notification-accent-dim", NOTIFICATION_COLOR.accentDim);
  el.style.setProperty("--notification-glow", NOTIFICATION_COLOR.glow);
  el.style.setProperty("--notification-glow-cool", NOTIFICATION_COLOR.glowCool);
  el.style.setProperty("--notification-shadow", NOTIFICATION_SHADOW.rest);
  el.style.setProperty("--notification-shadow-hover", NOTIFICATION_SHADOW.hover);
  el.style.setProperty("--notification-shadow-bar", NOTIFICATION_SHADOW.bar);
  el.style.setProperty("--notification-blur", `${NOTIFICATION_BLUR_PX}px`);
  el.style.setProperty("--notification-radius", "12px");
  el.style.setProperty("--notification-min-w", `${NOTIFICATION_SIZE.minWidth}px`);
  el.style.setProperty("--notification-max-w", `${NOTIFICATION_SIZE.maxWidth}px`);
  el.style.setProperty("--notification-media-h", `${NOTIFICATION_SIZE.mediaHeight}px`);
  el.style.setProperty("--notification-pad-x", `${NOTIFICATION_SPACING.padX}px`);
  el.style.setProperty("--notification-pad-y", `${NOTIFICATION_SPACING.padY}px`);
  el.style.setProperty("--notification-gap", `${NOTIFICATION_SPACING.gap}px`);
  el.style.setProperty("--notification-art", `${NOTIFICATION_SPACING.artSize}px`);
  el.style.setProperty("--notification-art-radius", `${NOTIFICATION_SPACING.artRadius}px`);
  el.style.setProperty("--notification-control", `${NOTIFICATION_SPACING.controlSize}px`);
  el.style.setProperty("--notification-progress-h", `${NOTIFICATION_SPACING.progressH}px`);
}

/**
 * Floating Dynamic Islandâ€“style notification shell.
 * Presentation only â€” open/hover still driven by App / VoicePill.
 */
export function NotificationPill({
  open = true,
  active = false,
  onHoverChange,
  children,
  onActivate,
  activateLabel,
  activateTitle,
  statusCenter = false,
  leading,
  trailing,
  title,
  subtitle,
  tone = "idle",
  variant = "compact",
  artworkSrc,
  artworkAlt,
  progress,
}: NotificationPillProps) {
  applyNotificationCssVars();

  return (
    <NotificationQueue
      open={open}
      onHoverChange={onHoverChange}
      tone={tone}
      media={variant === "media"}
      active={active}
    >
      {children ?? (
        <PillFace
          open={open}
          onActivate={onActivate}
          activateLabel={activateLabel}
          activateTitle={activateTitle}
          statusCenter={statusCenter}
          leading={leading}
          trailing={trailing}
          title={title}
          subtitle={subtitle}
          tone={tone}
          variant={variant}
          artworkSrc={artworkSrc}
          artworkAlt={artworkAlt}
          progress={progress}
        />
      )}
    </NotificationQueue>
  );
}

function PillFace({
  open,
  onActivate,
  activateLabel,
  activateTitle,
  statusCenter = false,
  leading,
  trailing,
  title,
  subtitle,
  tone = "idle",
  variant = "compact",
  artworkSrc,
  artworkAlt,
  progress,
}: NotificationContentProps & {
  open: boolean;
  onActivate?: () => void;
  activateLabel?: string;
  activateTitle?: string;
  statusCenter?: boolean;
}) {
  const isMedia = variant === "media";
  const resolvedLeading =
    leading ??
    (isMedia && artworkSrc ? (
      <img
        className={styles.art}
        src={artworkSrc}
        alt={artworkAlt ?? ""}
        draggable={false}
      />
    ) : null);

  const textBlock = (
    <div className={styles.body} data-lines={subtitle ? "2" : "1"}>
      <span className={styles.title}>{title}</span>
      {subtitle ? <span className={styles.subtitle}>{subtitle}</span> : null}
      {isMedia && progress ? (
        <div className={styles.progressTrack} aria-hidden="true">
          <div
            className={styles.progressFill}
            style={{
              transform: `scaleX(${Math.min(1, Math.max(0, progress.value))})`,
            }}
          />
        </div>
      ) : null}
    </div>
  );

  return (
    <div
      className={styles.content}
      data-variant={variant}
      data-tone={tone}
      data-center={statusCenter ? "true" : undefined}
    >
      {onActivate ? (
        <button
          type="button"
          className={styles.activate}
          data-center={statusCenter ? "true" : undefined}
          onClick={onActivate}
          aria-label={activateLabel ?? title}
          title={activateTitle}
          aria-expanded={open}
          tabIndex={open ? 0 : -1}
        >
          {resolvedLeading ? (
            <span className={styles.leading}>{resolvedLeading}</span>
          ) : null}
          {textBlock}
          {statusCenter && trailing ? (
            <span className={styles.trailing}>{trailing}</span>
          ) : null}
        </button>
      ) : (
        <>
          {resolvedLeading ? (
            <div className={styles.leading}>{resolvedLeading}</div>
          ) : null}
          {textBlock}
        </>
      )}
      {!statusCenter && trailing ? (
        <div className={styles.trailing}>{trailing}</div>
      ) : null}
    </div>
  );
}
