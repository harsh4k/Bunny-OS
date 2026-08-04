/**
 * Island pointer hit targets — must match NotificationPill.module.css .hit sizes.
 * Only these rects capture clicks; everything else stays click-through.
 */

import {
  NOTCH_H,
  NOTCH_W,
  PAD_TOP,
  PILL_H,
  PILL_W,
} from "./islandGeometry";

/** Expanded hanging bar (visible shell when open). */
export function islandHitSize(barOpen: boolean): { width: number; height: number } {
  return barOpen
    ? { width: PILL_W, height: PILL_H }
    : { width: NOTCH_W, height: NOTCH_H };
}

export interface HitRectArgs {
  /** Window outer position (physical px). */
  windowX: number;
  windowY: number;
  /** Window outer size (physical px). */
  windowW: number;
  scale: number;
  barOpen: boolean;
}

/** Screen-space hit rect for cursor polling / setIgnoreCursorEvents. */
export function hitRectInWindow(args: HitRectArgs): {
  left: number;
  top: number;
  right: number;
  bottom: number;
} {
  const { width, height } = islandHitSize(args.barOpen);
  const hitW = width * args.scale;
  const hitH = height * args.scale;
  const left = args.windowX + (args.windowW - hitW) / 2;
  const top = args.windowY + PAD_TOP * args.scale;
  return {
    left,
    top,
    right: left + hitW,
    bottom: top + hitH,
  };
}

export function cursorInHitRect(
  cursorX: number,
  cursorY: number,
  rect: ReturnType<typeof hitRectInWindow>
): boolean {
  return (
    cursorX >= rect.left &&
    cursorX <= rect.right &&
    cursorY >= rect.top &&
    cursorY <= rect.bottom
  );
}
