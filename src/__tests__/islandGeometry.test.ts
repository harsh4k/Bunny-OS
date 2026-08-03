import { describe, expect, it } from "vitest";
import tauriConf from "../../src-tauri/tauri.conf.json";
import {
  ISLAND_H,
  ISLAND_WINDOW,
  PAD_BOTTOM,
  PAD_TOP,
  PAD_X,
  PILL_H,
  PILL_W,
  WINDOW_H,
  WINDOW_W,
  applyIslandCssVars,
} from "../lib/islandGeometry";

describe("islandGeometry", () => {
  it("derives window size from pill + gutters (border-box)", () => {
    expect(ISLAND_H).toBe(PILL_H);
    expect(WINDOW_W).toBe(PILL_W + PAD_X * 2);
    expect(WINDOW_H).toBe(PILL_H + PAD_TOP + PAD_BOTTOM);
    expect(PAD_TOP).toBe(0);
    expect(ISLAND_WINDOW).toEqual({ width: 276, height: 56 });
  });

  it("keeps tauri.conf.json initial size in sync", () => {
    const win = tauriConf.app.windows[0];
    expect(win.width).toBe(ISLAND_WINDOW.width);
    expect(win.height).toBe(ISLAND_WINDOW.height);
  });

  it("applies CSS vars used by VoicePill", () => {
    applyIslandCssVars();
    const style = document.documentElement.style;
    expect(style.getPropertyValue("--island-pill-w")).toBe("220px");
    expect(style.getPropertyValue("--island-pill-h")).toBe("40px");
    expect(style.getPropertyValue("--island-line-h")).toBe("5px");
    expect(style.getPropertyValue("--island-pad-x")).toBe("28px");
    expect(style.getPropertyValue("--island-pad-top")).toBe("0px");
    expect(style.getPropertyValue("--island-window-w")).toBe("276px");
    expect(style.getPropertyValue("--island-window-h")).toBe("56px");
  });
});
