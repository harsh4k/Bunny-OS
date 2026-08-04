import type { ReactNode } from "react";
import {
  NOTIFICATION_BLUR_PX,
  NOTIFICATION_COLOR,
  NOTIFICATION_SHADOW,
  NOTIFICATION_SIZE,
  NOTIFICATION_SPACING,
} from "./constants";
import type { NotificationContentProps } from "./NotificationContent";
import { NotificationQueue } from "./NotificationQueue";
import styles from "./NotificationPill.module.css";

export type { NotificationContentProps, NotificationTone, NotificationVariant } from "./NotificationContent";

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
 * Floating Dynamic Island–style notification shell.
 * Presentation only — open/hover still driven by App / VoicePill.
 */
export function NotificationPill({
  open = true,
  active = false,
  onHoverChange,
  children,
  onActivate,
  activateLabel,
  activateTitle,
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
    <>
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
    </>
  );

  return (
    <div className={styles.content} data-variant={variant} data-tone={tone}>
      {onActivate ? (
        <button
          type="button"
          className={styles.activate}
          onClick={onActivate}
          aria-label={activateLabel ?? title}
          title={activateTitle}
          aria-expanded="false"
          tabIndex={open ? 0 : -1}
        >
          {resolvedLeading ? (
            <span className={styles.leading}>{resolvedLeading}</span>
          ) : null}
          <span className={styles.body}>{textBlock}</span>
        </button>
      ) : (
        <>
          {resolvedLeading ? (
            <div className={styles.leading}>{resolvedLeading}</div>
          ) : null}
          <div className={styles.body}>{textBlock}</div>
        </>
      )}
      {trailing ? <div className={styles.trailing}>{trailing}</div> : null}
    </div>
  );
}
