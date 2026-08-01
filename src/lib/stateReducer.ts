/**
 * State reducer for Bunny OS app lifecycle.
 * Mirrors the lifecycle states defined in contracts/ipc.ts.
 *
 * Rust mirror: src-tauri/src/ipc.rs  LifecycleStatus enum
 */
import type { AppLifecycle } from "~contracts/ipc";

// ── State ──────────────────────────────────────────────────────────────────────

export interface LifecycleState {
  status: AppLifecycle;
  reason: string | null;
  crash_count: number;
  last_crash_at: number | null;
  /** Monotonically incremented on each change; useful for animations. */
  version: number;
}

export const INITIAL_STATE: LifecycleState = {
  status: "stopped",
  reason: null,
  crash_count: 0,
  last_crash_at: null,
  version: 0,
};

// ── Events ─────────────────────────────────────────────────────────────────────

export type LifecycleEvent =
  | { type: "SIDECAR_STARTING" }
  | { type: "SIDECAR_READY" }
  | { type: "SIDECAR_DEGRADED"; reason: string }
  | { type: "SIDECAR_CRASHED"; exit_code: number; reason: string }
  | { type: "SIDECAR_ERROR"; reason: string }
  | { type: "APP_QUIT" }
  | { type: "RECOVER" };

// ── Constants ──────────────────────────────────────────────────────────────────

/** After this many crashes, auto-recovery stops and status → "error". */
export const MAX_AUTO_RECOVERY = 3;

// ── Reducer ────────────────────────────────────────────────────────────────────

export function lifecycleReducer(
  state: LifecycleState,
  event: LifecycleEvent
): LifecycleState {
  const next = (
    partial: Partial<Omit<LifecycleState, "version">>
  ): LifecycleState => ({
    ...state,
    ...partial,
    version: state.version + 1,
  });

  switch (event.type) {
    case "SIDECAR_STARTING":
      return next({ status: "starting", reason: null });

    case "SIDECAR_READY":
      return next({ status: "ready", reason: null });

    case "SIDECAR_DEGRADED":
      return next({ status: "degraded", reason: event.reason });

    case "SIDECAR_CRASHED": {
      const crash_count = state.crash_count + 1;
      const recoverable = crash_count <= MAX_AUTO_RECOVERY;
      return next({
        status: recoverable ? "degraded" : "error",
        reason: `Crashed (exit ${event.exit_code}): ${event.reason}`,
        crash_count,
        last_crash_at: Date.now(),
      });
    }

    case "SIDECAR_ERROR":
      return next({ status: "error", reason: event.reason });

    case "APP_QUIT":
      return next({ status: "stopped", reason: null });

    case "RECOVER":
      return next({ status: "starting", reason: null });

    default: {
      // Exhaustive guard: TypeScript errors here if a LifecycleEvent
      // variant is added without a matching case above.
      void (event satisfies never);
      return state;
    }
  }
}

// ── Derived helpers ────────────────────────────────────────────────────────────

export function isRecoverable(state: LifecycleState): boolean {
  return (
    (state.status === "degraded" || state.status === "error") &&
    state.crash_count <= MAX_AUTO_RECOVERY
  );
}

export function statusLabel(status: AppLifecycle): string {
  const labels: Record<AppLifecycle, string> = {
    starting: "Starting…",
    ready: "Ready",
    degraded: "Degraded",
    error: "Error",
    stopped: "Stopped",
  };
  return labels[status];
}
