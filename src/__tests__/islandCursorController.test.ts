import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  createIslandCursorController,
  isIdleIslandSurface,
} from "../lib/islandCursorController";

describe("islandCursorController", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "setInterval",
      (fn: () => void, _ms?: number) => {
        void fn();
        return 1;
      },
    );
    vi.stubGlobal("clearInterval", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("forces interactive on dispose (never leaves dashboard click-through)", async () => {
    const setIgnore = vi.fn().mockResolvedValue(undefined);
    const controller = createIslandCursorController({
      setIgnoreCursorEvents: setIgnore,
      sampleHit: async () => ({ overIsland: false }),
      onOverIsland: vi.fn(),
      onOpenIsland: vi.fn(),
    });

    controller.startIdlePoll();
    controller.dispose();

    await vi.waitFor(() => {
      expect(setIgnore).toHaveBeenCalledWith(false);
    });
  });

  it("stale tick cannot re-arm ignore after switch to interactive", async () => {
    let resolveHit: (v: { overIsland: boolean }) => void = () => {};
    const setIgnore = vi.fn().mockImplementation(async (ignore: boolean) => {
      if (!ignore) {
        await new Promise((r) => setTimeout(r, 5));
      }
    });

    const controller = createIslandCursorController({
      pollMs: 10,
      setIgnoreCursorEvents: setIgnore,
      sampleHit: () =>
        new Promise((resolve) => {
          resolveHit = resolve;
        }),
      onOverIsland: vi.fn(),
      onOpenIsland: vi.fn(),
    });

    controller.startIdlePoll();
    controller.setInteractive();
    resolveHit({ overIsland: false });

    await vi.waitFor(() => {
      const last = setIgnore.mock.calls.at(-1);
      expect(last).toEqual([false]);
    });
  });

  it("only treats the settled idle island as click-through", () => {
    const idle = {
      onboardingReady: true,
      onboardingPending: false,
      islandShown: true,
      expanded: false,
    };
    expect(isIdleIslandSurface(idle)).toBe(true);
    // Boot: onboarding has not resolved yet, so the shell may be about to open.
    expect(isIdleIslandSurface({ ...idle, onboardingReady: false })).toBe(false);
    // Onboarding wizard must stay clickable (legal checkbox / Continue).
    expect(isIdleIslandSurface({ ...idle, onboardingPending: true })).toBe(false);
    expect(isIdleIslandSurface({ ...idle, expanded: true })).toBe(false);
    expect(isIdleIslandSurface({ ...idle, islandShown: false })).toBe(false);
  });

  it("sets ignore false when interactive mode", async () => {
    const setIgnore = vi.fn().mockResolvedValue(undefined);
    const controller = createIslandCursorController({
      setIgnoreCursorEvents: setIgnore,
      sampleHit: async () => ({ overIsland: true }),
      onOverIsland: vi.fn(),
      onOpenIsland: vi.fn(),
    });

    controller.setInteractive();

    await vi.waitFor(() => {
      expect(setIgnore).toHaveBeenCalledWith(false);
    });
  });
});
