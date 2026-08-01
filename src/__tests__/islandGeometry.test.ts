import { describe, expect, it } from "vitest";
import {
  ISLAND_WINDOW,
  PAD_X,
  PAD_Y,
  PILL_BORDER_Y,
  PILL_H,
  PILL_W,
  WINDOW_H,
  WINDOW_W,
  applyIslandCssVars,
} from "../lib/islandGeometry";

describe("islandGeometry", () => {
  it("derives window size from pill + gutters + border", () => {
    expect(WINDOW_W).toBe(PILL_W + PAD_X * 2);
    expect(WINDOW_H).toBe(PILL_H + PAD_Y * 2 + PILL_BORDER_Y);
    expect(ISLAND_WINDOW).toEqual({ width: 304, height: 66 });
  });

  it("applies CSS vars used by VoicePill", () => {
    applyIslandCssVars();
    const style = document.documentElement.style;
    expect(style.getPropertyValue("--island-pill-w")).toBe("260px");
    expect(style.getPropertyValue("--island-pill-h")).toBe("36px");
    expect(style.getPropertyValue("--island-pad-x")).toBe("22px");
    expect(style.getPropertyValue("--island-pad-y")).toBe("14px");
    expect(style.getPropertyValue("--island-window-w")).toBe("304px");
    expect(style.getPropertyValue("--island-window-h")).toBe("66px");
  });
});
