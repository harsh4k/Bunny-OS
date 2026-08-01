/**
 * Tests for the lifecycle state reducer.
 * Covers all explicit state transitions and invariants.
 */
import { describe, it, expect } from "vitest";
import {
  lifecycleReducer,
  INITIAL_STATE,
  MAX_AUTO_RECOVERY,
  isRecoverable,
  statusLabel,
  type LifecycleState,
} from "../lib/stateReducer";

const s = (partial: Partial<LifecycleState>): LifecycleState => ({
  ...INITIAL_STATE,
  ...partial,
});

describe("lifecycleReducer — happy path transitions", () => {
  it("stopped → starting on SIDECAR_STARTING", () => {
    const next = lifecycleReducer(INITIAL_STATE, { type: "SIDECAR_STARTING" });
    expect(next.status).toBe("starting");
    expect(next.reason).toBeNull();
  });

  it("starting → ready on SIDECAR_READY", () => {
    const next = lifecycleReducer(
      s({ status: "starting" }),
      { type: "SIDECAR_READY" }
    );
    expect(next.status).toBe("ready");
    expect(next.reason).toBeNull();
  });

  it("ready → stopped on APP_QUIT", () => {
    const next = lifecycleReducer(
      s({ status: "ready" }),
      { type: "APP_QUIT" }
    );
    expect(next.status).toBe("stopped");
  });

  it("any state → starting on RECOVER", () => {
    for (const status of ["degraded", "error"] as const) {
      const next = lifecycleReducer(s({ status }), { type: "RECOVER" });
      expect(next.status).toBe("starting");
    }
  });
});

describe("lifecycleReducer — crash handling", () => {
  it("first crash → degraded (auto-recoverable)", () => {
    const next = lifecycleReducer(
      s({ status: "ready" }),
      { type: "SIDECAR_CRASHED", exit_code: 1, reason: "OOM" }
    );
    expect(next.status).toBe("degraded");
    expect(next.crash_count).toBe(1);
    expect(next.last_crash_at).not.toBeNull();
    expect(next.reason).toContain("Crashed");
  });

  it(`crash ${MAX_AUTO_RECOVERY + 1} → error (non-recoverable)`, () => {
    let state = s({ status: "ready" });
    for (let i = 0; i < MAX_AUTO_RECOVERY; i++) {
      state = lifecycleReducer(state, {
        type: "SIDECAR_CRASHED",
        exit_code: 1,
        reason: "loop",
      });
    }
    // One more crash should push to error
    const final = lifecycleReducer(state, {
      type: "SIDECAR_CRASHED",
      exit_code: 1,
      reason: "final",
    });
    expect(final.status).toBe("error");
    expect(final.crash_count).toBe(MAX_AUTO_RECOVERY + 1);
  });

  it("crash_count accumulates across multiple crashes", () => {
    let state = INITIAL_STATE;
    state = lifecycleReducer(state, { type: "SIDECAR_STARTING" });
    state = lifecycleReducer(state, { type: "SIDECAR_READY" });
    state = lifecycleReducer(state, { type: "SIDECAR_CRASHED", exit_code: 2, reason: "a" });
    state = lifecycleReducer(state, { type: "SIDECAR_CRASHED", exit_code: 2, reason: "b" });
    expect(state.crash_count).toBe(2);
  });
});

describe("lifecycleReducer — version increment", () => {
  it("version increments on every transition", () => {
    const a = lifecycleReducer(INITIAL_STATE, { type: "SIDECAR_STARTING" });
    const b = lifecycleReducer(a, { type: "SIDECAR_READY" });
    expect(a.version).toBe(INITIAL_STATE.version + 1);
    expect(b.version).toBe(a.version + 1);
  });

  it("version does NOT increment on unknown event (exhaustive guard)", () => {
    // Simulate an unknown event slipping through (e.g., future addition)
    // The reducer should return the same state object reference.
    const result = lifecycleReducer(
      INITIAL_STATE,
      // @ts-expect-error deliberate unknown event
      { type: "UNKNOWN_EVENT" }
    );
    expect(result).toStrictEqual(INITIAL_STATE);
  });
});

describe("isRecoverable", () => {
  it("true when degraded and under crash limit", () => {
    expect(isRecoverable(s({ status: "degraded", crash_count: 1 }))).toBe(true);
  });

  it("false when crash_count exceeds MAX_AUTO_RECOVERY", () => {
    expect(
      isRecoverable(s({ status: "error", crash_count: MAX_AUTO_RECOVERY + 1 }))
    ).toBe(false);
  });

  it("false when stopped", () => {
    expect(isRecoverable(INITIAL_STATE)).toBe(false);
  });
});

describe("statusLabel", () => {
  it("returns a non-empty string for every lifecycle state", () => {
    const states = ["starting", "ready", "degraded", "error", "stopped"] as const;
    for (const s of states) {
      expect(statusLabel(s).length).toBeGreaterThan(0);
    }
  });
});
