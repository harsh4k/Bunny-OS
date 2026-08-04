import { describe, expect, it } from "vitest";
import {
  NOTCH_H,
  NOTCH_W,
  PILL_H,
  PILL_W,
} from "../lib/islandGeometry";
import {
  cursorInHitRect,
  hitRectInWindow,
  islandHitSize,
} from "../lib/islandHitTest";

describe("islandHitTest", () => {
  it("uses pill size when bar is open and notch when tucked", () => {
    expect(islandHitSize(true)).toEqual({ width: PILL_W, height: PILL_H });
    expect(islandHitSize(false)).toEqual({ width: NOTCH_W, height: NOTCH_H });
  });

  it("centers hit rect in window and excludes shadow gutter below pill", () => {
    const scale = 1;
    const rect = hitRectInWindow({
      windowX: 100,
      windowY: 0,
      windowW: 244,
      scale,
      barOpen: true,
    });
    expect(rect.left).toBe(100 + (244 - PILL_W) / 2);
    expect(rect.top).toBe(0);
    expect(rect.right - rect.left).toBe(PILL_W);
    expect(rect.bottom - rect.top).toBe(PILL_H);
    expect(rect.bottom).toBeLessThan(54);
  });

  it("notch hit rect is much smaller than expanded bar", () => {
    const open = hitRectInWindow({
      windowX: 0,
      windowY: 0,
      windowW: 244,
      scale: 1,
      barOpen: true,
    });
    const tucked = hitRectInWindow({
      windowX: 0,
      windowY: 0,
      windowW: 184,
      scale: 1,
      barOpen: false,
    });
    expect(tucked.bottom - tucked.top).toBe(NOTCH_H);
    expect(tucked.right - tucked.left).toBe(NOTCH_W);
    expect(tucked.bottom - tucked.top).toBeLessThan(open.bottom - open.top);
  });

  it("detects cursor inside hit rect", () => {
    const rect = { left: 10, top: 0, right: 50, bottom: 4 };
    expect(cursorInHitRect(30, 2, rect)).toBe(true);
    expect(cursorInHitRect(5, 2, rect)).toBe(false);
    expect(cursorInHitRect(30, 10, rect)).toBe(false);
  });
});
