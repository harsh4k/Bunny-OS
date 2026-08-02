/**
 * Single source of truth for Dynamic Island / VoicePill geometry.
 * App window size is derived — keep tauri.conf.json initial size in sync.
 *
 * Layout: island hangs from the top of the screen (TOP_INSET = 0).
 * Vertical slack lives under the pill so the bottom curve never clips.
 * Pill uses border-box — height includes the 1px rim.
 */

export const PILL_W = 288;
export const PILL_H = 40;
/** Horizontal gutter — keep small so transparent chrome doesn’t steal clicks. */
export const PAD_X = 14;
/** Flush to the top of the window / screen (Dynamic Island hang). */
export const PAD_TOP = 0;
/** Slack below the capsule so the bottom curve never clips. */
export const PAD_BOTTOM = 18;
/** @deprecated Prefer PAD_TOP / PAD_BOTTOM — kept for older hit-test call sites. */
export const PAD_Y = PAD_BOTTOM;
/** Legacy name for hit-test padding around the pill rim (border top+bottom). */
export const PILL_BORDER_Y = 2;

export const WINDOW_W = PILL_W + PAD_X * 2;
export const WINDOW_H = PILL_H + PAD_TOP + PAD_BOTTOM;
/** Hang from the physical top of the monitor (notch / menu-bar style). */
export const TOP_INSET = 0;

/** 316 × 58 with current constants — keep tauri.conf.json initial size in sync. */
export const ISLAND_WINDOW = { width: WINDOW_W, height: WINDOW_H } as const;

export function applyIslandCssVars(
  el: HTMLElement = document.documentElement
): void {
  el.style.setProperty("--island-pill-w", `${PILL_W}px`);
  el.style.setProperty("--island-pill-h", `${PILL_H}px`);
  el.style.setProperty("--island-pad-x", `${PAD_X}px`);
  el.style.setProperty("--island-pad-top", `${PAD_TOP}px`);
  el.style.setProperty("--island-pad-bottom", `${PAD_BOTTOM}px`);
  el.style.setProperty("--island-pad-y", `${PAD_BOTTOM}px`);
  el.style.setProperty("--island-window-w", `${WINDOW_W}px`);
  el.style.setProperty("--island-window-h", `${WINDOW_H}px`);
}
