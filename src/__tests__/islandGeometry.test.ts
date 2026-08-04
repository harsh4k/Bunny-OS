import { describe, expect, it } from "vitest";
import tauriConf from "../../src-tauri/tauri.conf.json";
import {
  ISLAND_WINDOW,
  NOTCH_H,
  NOTCH_W,
  PAD_BOTTOM,
  PAD_TOP,
  PAD_X,
  PILL_H,
  PILL_RADIUS,
  PILL_W,
  TOP_INSET,
  WINDOW_H,
  WINDOW_W,
  applyIslandCssVars,
} from "../lib/islandGeometry";

describe("islandGeometry", () => {
  it("derives window size from pill + gutters (border-box)", () => {
    expect(WINDOW_W).toBe(PILL_W + PAD_X * 2);
    expect(WINDOW_H).toBe(PILL_H + PAD_TOP + PAD_BOTTOM);
    expect(PILL_RADIUS).toBe(12);
    expect(PILL_RADIUS).toBeLessThan(PILL_H / 2);
    expect(NOTCH_W).toBeLessThan(PILL_W);
    expect(NOTCH_H).toBeLessThanOrEqual(5);
    expect(PAD_TOP).toBe(0);
    expect(TOP_INSET).toBe(0);
    expect(ISLAND_WINDOW).toEqual({ width: 324, height: 54 });
  });

  it("keeps tauri.conf.json initial size in sync", () => {
    const win = tauriConf.app.windows[0];
    expect(win.width).toBe(ISLAND_WINDOW.width);
    expect(win.height).toBe(ISLAND_WINDOW.height);
  });

  it("applies CSS vars used by VoicePill", () => {
    applyIslandCssVars();
    const style = document.documentElement.style;
    expect(style.getPropertyValue("--island-pill-w")).toBe("300px");
    expect(style.getPropertyValue("--island-pill-h")).toBe("38px");
    expect(style.getPropertyValue("--island-pill-radius")).toBe("12px");
    expect(style.getPropertyValue("--island-notch-w")).toBe("160px");
    expect(style.getPropertyValue("--island-notch-h")).toBe("4px");
    expect(style.getPropertyValue("--island-pad-x")).toBe("12px");
    expect(style.getPropertyValue("--island-pad-top")).toBe("0px");
    expect(style.getPropertyValue("--island-pad-bottom")).toBe("16px");
    expect(style.getPropertyValue("--island-window-w")).toBe("324px");
    expect(style.getPropertyValue("--island-window-h")).toBe("54px");
  });
});
