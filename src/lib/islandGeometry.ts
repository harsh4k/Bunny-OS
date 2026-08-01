/**
 * Single source of truth for Dynamic Island / VoicePill geometry.
 * App window size is derived — keep tauri.conf.json initial size in sync.
 */

export const PILL_W = 260;
export const PILL_H = 36;
export const PAD_X = 22;
export const PAD_Y = 14;
/** 1px border on top + bottom of the pill */
export const PILL_BORDER_Y = 2;

export const WINDOW_W = PILL_W + PAD_X * 2;
export const WINDOW_H = PILL_H + PAD_Y * 2 + PILL_BORDER_Y;
export const TOP_INSET = 14;

/** 304 × 66 with current constants — update tauri.conf.json if these change. */
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
