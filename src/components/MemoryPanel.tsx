/**
 * MemoryPanel — review / toggle / add / delete / export local memories.
 */
import { useCallback, useEffect, useId, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { AppEvent } from "~contracts/ipc";
import styles from "./ChatPanel.module.css";

interface Fact {
  id: number;
  text: string;
  source: string;
  timestamp: number;
  confidence: number;
}

interface Props {
  onClose: () => void;
  sidecarReady: boolean;
}

export function MemoryPanel({ onClose, sidecarReady }: Props) {
  const [enabled, setEnabled] = useState(true);
  const [facts, setFacts] = useState<Fact[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputId = useId();

  const send = useCallback(
    async (payload: Record<string, unknown>) => {
      const id = crypto.randomUUID();
      return new Promise<string>((resolve, reject) => {
        let unlisten: UnlistenFn | null = null;
        const timer = setTimeout(() => {
          unlisten?.();
          reject(new Error("memory request timed out"));
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
    },
    []
  );

  const refresh = useCallback(async () => {
    if (!sidecarReady) return;
    setBusy(true);
    setError(null);
    try {
      const raw = await send({ action: "memory_list" });
      const parsed = JSON.parse(raw) as { enabled: boolean; facts: Fact[] };
      setEnabled(parsed.enabled);
      setFacts(parsed.facts ?? []);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }, [send, sidecarReady]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const addFact = async () => {
    const text = draft.trim();
    if (!text) return;
    setBusy(true);
    setError(null);
    try {
      const raw = await send({ action: "memory_add", text, source: "user" });
      const parsed = JSON.parse(raw) as { ok: boolean; error?: string };
      if (!parsed.ok) setError(parsed.error ?? "failed to add");
      else setDraft("");
      await refresh();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.overlay} role="dialog" aria-label="Memory controls">
      <div className={styles.header}>
        <span className={styles.title}>Memory</span>
        <button className={styles.closeBtn} onClick={onClose} aria-label="Close memory">
          ×
        </button>
      </div>
      <div className={styles.body}>
        <div className={styles.btnRow}>
          <button
            className={`${styles.btn} ${styles.btnSecondary}`}
            disabled={!sidecarReady || busy}
            onClick={() =>
              void (async () => {
                await send({ action: "memory_set_enabled", enabled: !enabled });
                await refresh();
              })()
            }
          >
            Memory: {enabled ? "On" : "Off"}
          </button>
          <button
            className={`${styles.btn} ${styles.btnSecondary}`}
            disabled={!sidecarReady || busy}
            onClick={() => void refresh()}
          >
            Refresh
          </button>
        </div>

        <label htmlFor={inputId} className={styles.fieldLabel}>
          Add fact
        </label>
        <textarea
          id={inputId}
          className={styles.textarea}
          rows={2}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Remember that I prefer dark mode…"
          disabled={!sidecarReady || busy || !enabled}
        />
        <div className={styles.btnRow}>
          <button
            className={`${styles.btn} ${styles.btnPrimary}`}
            disabled={!draft.trim() || !enabled || busy}
            onClick={() => void addFact()}
          >
            Save fact
          </button>
          <button
            className={`${styles.btn} ${styles.btnSecondary}`}
            disabled={busy}
            onClick={() =>
              void (async () => {
                await send({ action: "memory_clear_session" });
              })()
            }
          >
            Clear session
          </button>
          <button
            className={`${styles.btn} ${styles.btnDanger}`}
            disabled={busy}
            onClick={() =>
              void (async () => {
                await send({ action: "memory_clear" });
                await refresh();
              })()
            }
          >
            Delete all
          </button>
        </div>

        {error && (
          <div className={styles.errorState} role="alert">
            {error}
          </div>
        )}

        <ul className={styles.auditList} aria-label="Saved memories">
          {facts.map((f) => (
            <li key={f.id} className={styles.auditRow}>
              <span className={styles.auditLabel}>{f.text}</span>
              <button
                className={styles.btnSecondary}
                onClick={() =>
                  void (async () => {
                    await send({ action: "memory_delete", id: f.id });
                    await refresh();
                  })()
                }
              >
                Forget
              </button>
            </li>
          ))}
          {facts.length === 0 && <li className={styles.idleHint}>No saved memories yet.</li>}
        </ul>
      </div>
    </div>
  );
}
