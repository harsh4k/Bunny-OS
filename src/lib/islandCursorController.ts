/**
 * Generation-guarded idle-island click-through.
 * Prevents stale poll ticks from re-arming ignore after dashboard expand.
 */

export const HIT_POLL_MS = 80;

export interface HitRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface IslandCursorControllerOptions {
  pollMs?: number;
  setIgnoreCursorEvents: (ignore: boolean) => Promise<void>;
  sampleHit: () => Promise<{ overIsland: boolean }>;
  onOverIsland: (over: boolean) => void;
  onOpenIsland: () => void;
}

export interface IslandCursorController {
  setInteractive: () => void;
  startIdlePoll: () => void;
  dispose: () => void;
}

export function createIslandCursorController(
  options: IslandCursorControllerOptions,
): IslandCursorController {
  const pollMs = options.pollMs ?? HIT_POLL_MS;
  let generation = 0;
  let intervalId: number | null = null;

  const bump = () => {
    generation += 1;
    return generation;
  };

  const clearInterval = () => {
    if (intervalId != null) {
      window.clearInterval(intervalId);
      intervalId = null;
    }
  };

  const applyIgnoreIfCurrent = async (gen: number, ignore: boolean) => {
    if (gen !== generation) return;
    await options.setIgnoreCursorEvents(ignore);
    if (gen !== generation && ignore) {
      await options.setIgnoreCursorEvents(false);
    }
  };

  const tick = async (gen: number) => {
    if (gen !== generation) return;
    try {
      const { overIsland } = await options.sampleHit();
      if (gen !== generation) return;
      options.onOverIsland(overIsland);
      if (overIsland) options.onOpenIsland();
      if (gen !== generation) return;
      await applyIgnoreIfCurrent(gen, !overIsland);
    } catch {
      /* web / missing Tauri window metadata */
    }
  };

  const setInteractive = () => {
    const gen = bump();
    clearInterval();
    void applyIgnoreIfCurrent(gen, false);
  };

  const startIdlePoll = () => {
    const gen = bump();
    clearInterval();
    void applyIgnoreIfCurrent(gen, true);
    void tick(gen);
    intervalId = window.setInterval(() => {
      void tick(gen);
    }, pollMs);
  };

  const dispose = () => {
    bump();
    clearInterval();
    void options.setIgnoreCursorEvents(false);
  };

  return { setInteractive, startIdlePoll, dispose };
}
