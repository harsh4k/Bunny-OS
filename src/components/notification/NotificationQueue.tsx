import { useCallback, useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { applyIslandCssVars } from "../../lib/islandGeometry";
import styles from "./NotificationPill.module.css";

export interface NotificationQueueProps {
  /** Whether the expanded island is visible (existing island open state). */
  open: boolean;
  /** Expanded face content. */
  children: ReactNode;
  onHoverChange?: (hovered: boolean) => void;
  tone?: string;
  media?: boolean;
  active?: boolean;
}

/** Delay before reporting hover-leave — stops open/close thrash mid-morph. */
const HOVER_LEAVE_MS = 280;

/**
 * Top-edge island: sleek bar stays flush; hanging panel expands downward.
 * Hover is on a stable hit pad (not the morphing shell) so animation stays calm.
 */
export function NotificationQueue({
  open,
  children,
  onHoverChange,
  tone = "idle",
  media = false,
  active = false,
}: NotificationQueueProps) {
  const leaveTimer = useRef<number | null>(null);

  useEffect(() => {
    applyIslandCssVars();
  }, []);

  const clearLeaveTimer = useCallback(() => {
    if (leaveTimer.current !== null) {
      window.clearTimeout(leaveTimer.current);
      leaveTimer.current = null;
    }
  }, []);

  useEffect(() => () => clearLeaveTimer(), [clearLeaveTimer]);

  const handleEnter = useCallback(() => {
    clearLeaveTimer();
    onHoverChange?.(true);
  }, [clearLeaveTimer, onHoverChange]);

  const handleLeave = useCallback(() => {
    clearLeaveTimer();
    leaveTimer.current = window.setTimeout(() => {
      leaveTimer.current = null;
      onHoverChange?.(false);
    }, HOVER_LEAVE_MS);
  }, [clearLeaveTimer, onHoverChange]);

  return (
    <section className={styles.stage} aria-label="Bunny voice notification">
      {/* Hit pad tracks visible shell — App polls the same bounds for click-through. */}
      <div
        className={styles.hit}
        data-open={open ? "true" : "false"}
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
      >
        <div
          className={styles.shell}
          data-open={open ? "true" : "false"}
          data-tone={tone}
          data-media={media ? "true" : "false"}
          data-active={active ? "true" : "false"}
        >
          <div className={styles.face} data-visible={open ? "true" : "false"}>
            {children}
          </div>
        </div>
      </div>
    </section>
  );
}
