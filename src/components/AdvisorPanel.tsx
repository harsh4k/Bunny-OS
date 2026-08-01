/**
 * AdvisorPanel — state machine + IPC bridge for the Model Advisor overlay.
 *
 * States: idle → loading → results | error
 *         results → pulling → results | error
 *
 * Watchdogs
 *   scan  : 30 s  — fires error if sidecar doesn't respond in time
 *   pull  : 35 min — fires error if pull worker doesn't finish in time
 * Both watchdogs are cleared on terminal events (response/error) and on
 * component unmount to prevent memory leaks.
 *
 * Display sub-components live in AdvisorResults.tsx to stay under 300 lines.
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import type { AppEvent, GetAdvisorResponse } from "~contracts/ipc";
import { Results } from "./AdvisorResults";
import { OllamaGate } from "./OllamaGate";
import styles from "./AdvisorPanel.module.css";

// ── Watchdog durations ─────────────────────────────────────────────────────────

const SCAN_TIMEOUT_MS = 30_000;          // 30 s
const PULL_TIMEOUT_MS = 35 * 60 * 1_000; // 35 min

// ── Types ──────────────────────────────────────────────────────────────────────

interface Props {
  onClose: () => void;
  /** Only allow scanning when sidecar is ready/degraded. */
  sidecarReady: boolean;
}

type PanelState =
  | { phase: "idle" }
  | { phase: "loading"; requestId: string }
  | { phase: "pulling"; model: string; requestId: string }
  | { phase: "error"; message: string }
  | { phase: "results"; data: GetAdvisorResponse };

// ── Component ──────────────────────────────────────────────────────────────────

export function AdvisorPanel({ onClose, sidecarReady }: Props) {
  const [state, setState] = useState<PanelState>({ phase: "idle" });
  const [confirmPull, setConfirmPull] = useState<string | null>(null);
  const unlistenRef = useRef<UnlistenFn | null>(null);
  const watchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup both listener and watchdog on unmount.
  useEffect(() => {
    return () => {
      unlistenRef.current?.();
      if (watchdogRef.current !== null) clearTimeout(watchdogRef.current);
    };
  }, []);

  const clearWatchdog = () => {
    if (watchdogRef.current !== null) {
      clearTimeout(watchdogRef.current);
      watchdogRef.current = null;
    }
  };

  const scan = useCallback(async () => {
    const id = crypto.randomUUID();
    setState({ phase: "loading", requestId: id });
    setConfirmPull(null);

    unlistenRef.current?.();
    clearWatchdog();

    watchdogRef.current = setTimeout(() => {
      setState({ phase: "error", message: "Scan timed out (30 s). Sidecar may be busy." });
      unlistenRef.current?.();
      unlistenRef.current = null;
    }, SCAN_TIMEOUT_MS);

    unlistenRef.current = await listen<AppEvent>("app-event", (e) => {
      const ev = e.payload;
      if (ev.event !== "sidecar-message") return;
      const msg = ev.message;
      if (msg.type === "response" && msg.id === id) {
        clearWatchdog();
        unlistenRef.current?.();
        try {
          const parsed = JSON.parse(msg.result) as GetAdvisorResponse;
          setState({ phase: "results", data: parsed });
        } catch {
          setState({ phase: "error", message: "Failed to parse advisor response." });
        }
      } else if (msg.type === "error" && msg.id === id) {
        clearWatchdog();
        unlistenRef.current?.();
        setState({ phase: "error", message: msg.error });
      }
    });

    try {
      await invoke("send_action", { id, payload: { action: "get_advisor" } });
    } catch (err) {
      clearWatchdog();
      unlistenRef.current?.();
      setState({ phase: "error", message: String(err) });
    }
  }, []);

  const startPull = useCallback(
    async (modelName: string) => {
      setConfirmPull(null);
      const id = crypto.randomUUID();
      setState((prev) =>
        prev.phase === "results"
          ? { phase: "pulling", model: modelName, requestId: id }
          : prev
      );

      unlistenRef.current?.();
      clearWatchdog();

      watchdogRef.current = setTimeout(() => {
        setState({ phase: "error", message: "Pull timed out (35 min). Try again or check Ollama." });
        unlistenRef.current?.();
        unlistenRef.current = null;
      }, PULL_TIMEOUT_MS);

      unlistenRef.current = await listen<AppEvent>("app-event", (e) => {
        const ev = e.payload;
        if (ev.event !== "sidecar-message") return;
        const msg = ev.message;
        if (msg.type === "response" && msg.id === id) {
          clearWatchdog();
          unlistenRef.current?.();
          scan(); // re-scan to refresh available flags
        } else if (msg.type === "error" && msg.id === id) {
          clearWatchdog();
          unlistenRef.current?.();
          setState({ phase: "error", message: `Pull failed: ${msg.error}` });
        }
      });

      try {
        await invoke("send_action", {
          id,
          payload: { action: "pull_model", model_name: modelName },
        });
      } catch (err) {
        clearWatchdog();
        unlistenRef.current?.();
        setState({ phase: "error", message: String(err) });
      }
    },
    [scan]
  );

  // Auto-scan when the panel opens and the sidecar is ready.
  useEffect(() => {
    if (sidecarReady) {
      scan();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={styles.overlay} role="dialog" aria-label="Model Advisor">
      <div className={styles.header}>
        <span className={styles.title}>Model Advisor</span>
        <button className={styles.closeBtn} onClick={onClose} aria-label="Close advisor">
          ×
        </button>
      </div>

      <div className={styles.body}>
        <OllamaGate onReady={scan} />
        {state.phase === "idle" && (
          <div className={styles.emptyState}>
            <p>Scan hardware and Ollama to get model recommendations.</p>
            <button
              className={styles.btnPrimary}
              onClick={scan}
              disabled={!sidecarReady}
            >
              Scan
            </button>
          </div>
        )}

        {state.phase === "loading" && (
          <div className={styles.loadingState} role="status" aria-live="polite">
            <div className={styles.spinner} aria-hidden="true" />
            <span>Scanning hardware &amp; Ollama…</span>
          </div>
        )}

        {state.phase === "pulling" && (
          <div className={styles.loadingState} role="status" aria-live="polite">
            <div className={styles.spinner} aria-hidden="true" />
            <span>Pulling {state.model}…</span>
          </div>
        )}

        {state.phase === "error" && (
          <div className={styles.errorState} role="alert">
            <p className={styles.errorMsg}>{state.message}</p>
            <button className={styles.btnSecondary} onClick={scan}>
              Retry
            </button>
          </div>
        )}

        {state.phase === "results" && (
          <Results
            data={state.data}
            confirmPull={confirmPull}
            onRequestPull={setConfirmPull}
            onConfirmPull={startPull}
            onCancelPull={() => setConfirmPull(null)}
            onRescan={scan}
          />
        )}
      </div>
    </div>
  );
}
