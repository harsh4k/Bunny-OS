/**
 * Confirm banner for risky browser actions (type / click-by-role).
 * Must stay mounted at App root so island/collapsed voice turns still receive pending streams.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { AppEvent } from "~contracts/ipc";
import styles from "./ChatPanel.module.css";

export interface BrowserPending {
  pendingId: string;
  summary: string;
  actionKind: string;
}

interface Props {
  /** When false, Confirm is disabled (sidecar not ready). */
  sidecarReady?: boolean;
  /** Called when a pending confirm arrives or clears — use to expand the dashboard. */
  onPendingChange?: (pending: BrowserPending | null) => void;
  /** When false, listen only (no visible chrome) — used while island is collapsed. */
  visible?: boolean;
}

function parsePendingChunk(chunk: string): BrowserPending | null {
  if (!chunk.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(chunk) as {
      browser_confirm_pending?: boolean;
      pending_id?: string;
      summary?: string;
      action_kind?: string;
    };
    if (!parsed.browser_confirm_pending || !parsed.pending_id) return null;
    return {
      pendingId: parsed.pending_id,
      summary: parsed.summary || "Confirm browser action",
      actionKind: parsed.action_kind || "browser",
    };
  } catch {
    return null;
  }
}

export function BrowserConfirmBanner({
  sidecarReady = true,
  onPendingChange,
  visible = true,
}: Props) {
  const [pending, setPending] = useState<BrowserPending | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const onPendingChangeRef = useRef(onPendingChange);
  onPendingChangeRef.current = onPendingChange;

  const updatePending = useCallback((next: BrowserPending | null) => {
    setPending(next);
    onPendingChangeRef.current?.(next);
  }, []);

  useEffect(() => {
    let unlisten: UnlistenFn | null = null;
    let cancelled = false;

    void (async () => {
      const fn = await listen<AppEvent>("app-event", (e) => {
        const ev = e.payload;
        if (ev.event !== "sidecar-message") return;
        const msg = ev.message;
        if (msg.type !== "stream") return;
        const next = parsePendingChunk(msg.chunk);
        if (!next) return;
        setNote(null);
        updatePending(next);
      });
      if (cancelled) {
        fn();
        return;
      }
      unlisten = fn;
    })();

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [updatePending]);

  const send = useCallback(async (payload: Record<string, unknown>) => {
    const id = crypto.randomUUID();
    return new Promise<string>((resolve, reject) => {
      let unlisten: UnlistenFn | null = null;
      const timer = setTimeout(() => {
        unlisten?.();
        reject(new Error("browser confirm timed out"));
      }, 15_000);
      void listen<AppEvent>("app-event", (e) => {
        const ev = e.payload;
        if (ev.event !== "sidecar-message") return;
        const msg = ev.message;
        if (!("id" in msg) || msg.id !== id) return;
        clearTimeout(timer);
        unlisten?.();
        if (msg.type === "response") resolve(msg.result);
        else if (msg.type === "error") reject(new Error(msg.error));
      })
        .then((fn) => {
          unlisten = fn;
          return invoke("send_action", { id, payload });
        })
        .catch((err) => {
          clearTimeout(timer);
          unlisten?.();
          reject(err);
        });
    });
  }, []);

  if (!visible) return null;

  if (!pending) {
    if (!note) return null;
    return (
      <div className={styles.browserConfirmHost} data-testid="browser-confirm-host">
        <div className={styles.errorState} role="status">
          {note}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.browserConfirmHost} data-testid="browser-confirm-host">
      <div className={styles.actionCard} role="alertdialog" aria-label="Confirm browser action">
        <p className={styles.fieldLabel}>Confirm browser action</p>
        <p className={styles.idleHint}>{pending.summary}</p>
        {note && (
          <div className={styles.errorState} role="alert">
            {note}
          </div>
        )}
        <div className={styles.btnRow}>
          <button
            className={`${styles.btn} ${styles.btnPrimary}`}
            disabled={!sidecarReady || busy}
            onClick={() =>
              void (async () => {
                setBusy(true);
                try {
                  const raw = await send({
                    action: "browser_confirm",
                    pending_id: pending.pendingId,
                  });
                  const parsed = JSON.parse(raw) as {
                    ok?: boolean;
                    result?: string;
                    error?: string;
                  };
                  if (!parsed.ok) {
                    setNote(parsed.error ?? "Failed.");
                    return;
                  }
                  setNote(parsed.result ?? "Done.");
                  updatePending(null);
                } catch (err) {
                  setNote(String(err));
                } finally {
                  setBusy(false);
                }
              })()
            }
          >
            Confirm
          </button>
          <button
            className={`${styles.btn} ${styles.btnSecondary}`}
            disabled={busy}
            onClick={() =>
              void (async () => {
                setBusy(true);
                try {
                  const raw = await send({
                    action: "browser_cancel",
                    pending_id: pending.pendingId,
                  });
                  const parsed = JSON.parse(raw) as { ok?: boolean; error?: string };
                  if (!parsed.ok) {
                    setNote(parsed.error ?? "Cancel failed.");
                    return;
                  }
                  setNote("Cancelled.");
                  updatePending(null);
                } catch (err) {
                  setNote(String(err));
                } finally {
                  setBusy(false);
                }
              })()
            }
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

/** Exported for unit tests. */
export { parsePendingChunk };
