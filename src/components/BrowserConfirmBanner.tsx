/**
 * Confirm banner for risky browser actions (type / click-by-role).
 */
import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { AppEvent } from "~contracts/ipc";
import styles from "./ChatPanel.module.css";

interface Pending {
  pendingId: string;
  summary: string;
  actionKind: string;
}

interface Props {
  sidecarReady: boolean;
}

export function BrowserConfirmBanner({ sidecarReady }: Props) {
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    let unlisten: UnlistenFn | null = null;
    void listen<AppEvent>("app-event", (e) => {
      const ev = e.payload;
      if (ev.event !== "sidecar-message") return;
      const msg = ev.message;
      if (msg.type !== "stream" || !msg.chunk.startsWith("{")) return;
      try {
        const parsed = JSON.parse(msg.chunk) as {
          browser_confirm_pending?: boolean;
          pending_id?: string;
          summary?: string;
          action_kind?: string;
        };
        if (parsed.browser_confirm_pending && parsed.pending_id) {
          setPending({
            pendingId: parsed.pending_id,
            summary: parsed.summary || "Confirm browser action",
            actionKind: parsed.action_kind || "browser",
          });
          setNote(null);
        }
      } catch {
        /* ignore */
      }
    }).then((fn) => {
      unlisten = fn;
    });
    return () => {
      unlisten?.();
    };
  }, []);

  const send = useCallback(async (payload: Record<string, unknown>) => {
    const id = crypto.randomUUID();
    return new Promise<string>((resolve, reject) => {
      let unlisten: UnlistenFn | null = null;
      const timer = setTimeout(() => {
        unlisten?.();
        reject(new Error("browser confirm timed out"));
      }, 15_000);
      listen<AppEvent>("app-event", (e) => {
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

  if (!pending) {
    if (!note) return null;
    return (
      <div className={styles.errorState} role="status">
        {note}
      </div>
    );
  }

  return (
    <div className={styles.actionCard} role="alertdialog" aria-label="Confirm browser action">
      <p className={styles.fieldLabel}>Confirm browser action</p>
      <p className={styles.idleHint}>{pending.summary}</p>
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
                const parsed = JSON.parse(raw) as { ok?: boolean; result?: string; error?: string };
                setNote(parsed.ok ? parsed.result ?? "Done." : parsed.error ?? "Failed.");
              } catch (err) {
                setNote(String(err));
              } finally {
                setPending(null);
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
                await send({
                  action: "browser_cancel",
                  pending_id: pending.pendingId,
                });
                setNote("Cancelled.");
              } catch (err) {
                setNote(String(err));
              } finally {
                setPending(null);
                setBusy(false);
              }
            })()
          }
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
