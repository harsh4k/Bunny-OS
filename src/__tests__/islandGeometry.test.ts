import { describe, expect, it } from "vitest";
import tauriConf from "../../src-tauri/tauri.conf.json";
import {
  ISLAND_WINDOW,
  PAD_X,
  PAD_Y,
  PILL_H,
  PILL_W,
  WINDOW_H,
  WINDOW_W,
  applyIslandCssVars,
} from "../lib/islandGeometry";

describe("islandGeometry", () => {
  it("derives window size from pill + gutters (border-box, no double border)", () => {
    expect(WINDOW_W).toBe(PILL_W + PAD_X * 2);
    expect(WINDOW_H).toBe(PILL_H + PAD_Y * 2);
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
    expect(style.getPropertyValue("--island-pill-w")).toBe("260px");
    expect(style.getPropertyValue("--island-pill-h")).toBe("36px");
    expect(style.getPropertyValue("--island-pad-x")).toBe("8px");
    expect(style.getPropertyValue("--island-pad-y")).toBe("10px");
    expect(style.getPropertyValue("--island-window-w")).toBe("276px");
    expect(style.getPropertyValue("--island-window-h")).toBe("56px");
  });
});
