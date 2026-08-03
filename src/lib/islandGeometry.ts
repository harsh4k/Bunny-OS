/**
 * Dynamic Island geometry — VoiceOS-style notch pill.
 * Flat top flush to display; large bottom radii. Keep tauri.conf.json in sync.
 */

export const PILL_W = 220;
export const PILL_H = 40;
/** Collapsed sleek bar height */
export const LINE_H = 5;
export const LINE_HIT_H = 12;
export const PAD_X = 28;
export const PAD_TOP = 0;
export const PAD_BOTTOM = 16;
export const PAD_Y = PAD_BOTTOM;
export const PILL_BORDER_Y = 2;

export const ISLAND_H = PILL_H;
export const WINDOW_W = PILL_W + PAD_X * 2;
export const WINDOW_H = PILL_H + PAD_TOP + PAD_BOTTOM;
export const TOP_INSET = 0;

export const ISLAND_WINDOW = { width: WINDOW_W, height: WINDOW_H } as const;

export function applyIslandCssVars(
  el: HTMLElement = document.documentElement
): void {
  el.style.setProperty("--island-pill-w", `${PILL_W}px`);
  el.style.setProperty("--island-pill-h", `${PILL_H}px`);
  el.style.setProperty("--island-line-h", `${LINE_H}px`);
  el.style.setProperty("--island-total-h", `${ISLAND_H}px`);
  el.style.setProperty("--island-pad-x", `${PAD_X}px`);
  el.style.setProperty("--island-pad-top", `${PAD_TOP}px`);
  el.style.setProperty("--island-pad-bottom", `${PAD_BOTTOM}px`);
  el.style.setProperty("--island-pad-y", `${PAD_BOTTOM}px`);
  el.style.setProperty("--island-window-w", `${WINDOW_W}px`);
  el.style.setProperty("--island-window-h", `${WINDOW_H}px`);
}
