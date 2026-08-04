/**
 * Single source of truth for Dynamic Island / VoicePill geometry.
 * App window size is derived — keep tauri.conf.json initial size in sync.
 * Window is always the expanded-bar size; CSS morphs sleek top bar ↔ pill.
 */

/** Fixed open pill width — one size for all status phrases. */
export const PILL_W = 220;
export const PILL_H = 38;
/** Bottom-corner radius when hanging from the top edge (not a capsule). */
export const PILL_RADIUS = 12;
/** Collapsed sleek bar — flush to the top display edge. */
export const NOTCH_W = 160;
export const NOTCH_H = 4;
/** Side gutter — bleed so soft shadow isn't clipped. */
export const PAD_X = 12;
/** Flush to the top of the transparent window. */
export const PAD_TOP = 0;
/** Bottom gutter — room for drop shadow below the emerged pill. */
export const PAD_BOTTOM = 16;
/** @deprecated Prefer PAD_TOP / PAD_BOTTOM — kept for older call sites. */
export const PAD_Y = PAD_TOP;
/** Legacy name for hit-test padding around the pill rim (border top+bottom). */
export const PILL_BORDER_Y = 2;

export const WINDOW_W = PILL_W + PAD_X * 2;
export const WINDOW_H = PILL_H + PAD_TOP + PAD_BOTTOM;
/** Stick to the monitor top edge. */
export const TOP_INSET = 0;

/** 244 × 54 with current constants — keep tauri.conf.json initial size in sync. */
export const ISLAND_WINDOW = { width: WINDOW_W, height: WINDOW_H } as const;

/** Tucked notch — minimal window so transparent chrome doesn't block other apps. */
export const NOTCH_WINDOW = {
  width: NOTCH_W + PAD_X * 2,
  height: NOTCH_H + PAD_BOTTOM,
} as const;

export function islandBarWindow(barOpen: boolean): typeof ISLAND_WINDOW | typeof NOTCH_WINDOW {
  return barOpen ? ISLAND_WINDOW : NOTCH_WINDOW;
}

export function applyIslandCssVars(
  el: HTMLElement = document.documentElement
): void {
  el.style.setProperty("--island-pill-w", `${PILL_W}px`);
  el.style.setProperty("--island-pill-h", `${PILL_H}px`);
  el.style.setProperty("--island-pill-radius", `${PILL_RADIUS}px`);
  el.style.setProperty("--island-notch-w", `${NOTCH_W}px`);
  el.style.setProperty("--island-notch-h", `${NOTCH_H}px`);
  el.style.setProperty("--island-pad-x", `${PAD_X}px`);
  el.style.setProperty("--island-pad-top", `${PAD_TOP}px`);
  el.style.setProperty("--island-pad-bottom", `${PAD_BOTTOM}px`);
  el.style.setProperty("--island-pad-y", `${PAD_TOP}px`);
  el.style.setProperty("--island-window-w", `${WINDOW_W}px`);
  el.style.setProperty("--island-window-h", `${WINDOW_H}px`);
}
