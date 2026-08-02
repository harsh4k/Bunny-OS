/**
 * Single source of truth for Dynamic Island / VoicePill geometry.
 * App window size is derived — keep tauri.conf.json initial size in sync.
 * Pill uses border-box, so height already includes the 1px border — do not
 * add PILL_BORDER_Y into WINDOW_H.
 */

export const PILL_W = 260;
export const PILL_H = 36;
/** Horizontal gutter — keep small so transparent chrome doesn’t steal clicks. */
export const PAD_X = 8;
/** Vertical gutter — enough slack so the capsule never clips at the window edge. */
export const PAD_Y = 10;
/** Legacy name for hit-test padding around the pill rim (border top+bottom). */
export const PILL_BORDER_Y = 2;

export const WINDOW_W = PILL_W + PAD_X * 2;
export const WINDOW_H = PILL_H + PAD_Y * 2;
export const TOP_INSET = 14;

/** 276 × 56 with current constants — keep tauri.conf.json initial size in sync. */
export const ISLAND_WINDOW = { width: WINDOW_W, height: WINDOW_H } as const;

export function applyIslandCssVars(
  el: HTMLElement = document.documentElement
): void {
  el.style.setProperty("--island-pill-w", `${PILL_W}px`);
  el.style.setProperty("--island-pill-h", `${PILL_H}px`);
  el.style.setProperty("--island-pad-x", `${PAD_X}px`);
  el.style.setProperty("--island-pad-y", `${PAD_Y}px`);
  el.style.setProperty("--island-window-w", `${WINDOW_W}px`);
  el.style.setProperty("--island-window-h", `${WINDOW_H}px`);
}
