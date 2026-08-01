/**
 * WakePanel — enable/disable wake word + custom phrase (default Hey Bunny).
 * Hotkey / Talk remains the reliable fallback. Wake never authorizes actions.
 */
import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { AppEvent } from "~contracts/ipc";
import styles from "./ChatPanel.module.css";

interface WakeStatus {
  available: boolean;
  enabled: boolean;
  state: "off" | "loading" | "listening" | "error";
  phrase: string;
  mode?: "text" | "model";
  phrases: string[];
  sensitivity: number;
  cooldown_secs: number;
  error: string;
  hotkey_fallback: boolean;
  default_phrase?: string;
}

const STATE_LABEL: Record<WakeStatus["state"], string> = {
  off: "Off",
  loading: "Loading model…",
  listening: "Listening for the wake phrase",
  error: "Stopped",
};

function prettyPhrase(phrase: string): string {
  return phrase
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

interface Props {
  onClose: () => void;
  sidecarReady: boolean;
}

export function WakePanel({ onClose, sidecarReady }: Props) {
  const [status, setStatus] = useState<WakeStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [draftPhrase, setDraftPhrase] = useState("hey bunny");

  const send = useCallback(async (payload: Record<string, unknown>) => {
    const id = crypto.randomUUID();
    return new Promise<string>((resolve, reject) => {
      let unlisten: UnlistenFn | null = null;
      const timer = setTimeout(() => {
        unlisten?.();
        reject(new Error("wake request timed out"));
      }, 60_000);
      void listen<AppEvent>("app-event", (e) => {
        const ev = e.payload;
        if (ev.event !== "sidecar-message") return;
        const msg = ev.message;
        if (!("id" in msg) || msg.id !== id) return;
        clearTimeout(timer);
        unlisten?.();
        if (msg.type === "error") reject(new Error(msg.error));
        else if (msg.type === "response") resolve(msg.result);
        else reject(new Error("unexpected message"));
      }).then((fn) => {
        unlisten = fn;
      });
      invoke("send_action", { id, payload }).catch((err) => {
        clearTimeout(timer);
        unlisten?.();
        reject(err);
      });
    });
  }, []);

  const refresh = useCallback(async () => {
    if (!sidecarReady) return;
    setBusy(true);
    setError(null);
    try {
      const raw = await send({ action: "wake_status" });
      const next = JSON.parse(raw) as WakeStatus;
      setStatus(next);
      setDraftPhrase(next.phrase);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [send, sidecarReady]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (status?.state !== "loading") return;
    const timer = setInterval(() => void refresh(), 1_500);
    return () => clearInterval(timer);
  }, [status?.state, refresh]);

  const toggle = async () => {
    if (!status) return;
    setBusy(true);
    setError(null);
    try {
      const action = status.enabled ? "wake_stop" : "wake_start";
      const raw = await send({ action });
      const next = JSON.parse(raw) as WakeStatus;
      setStatus(next);
      setDraftPhrase(next.phrase);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const configure = async (patch: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await send({ action: "wake_configure", ...patch });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const applyPhrase = () => {
    const next = draftPhrase.trim();
    if (!next || next === status?.phrase) return;
    void configure({ phrase: next });
  };

  const defaultPhrase = status?.default_phrase ?? "hey bunny";

  return (
    <div className={styles.overlay} role="dialog" aria-label="Wake word settings">
      <div className={styles.header}>
        <span className={styles.title}>Wake word</span>
        <button className={styles.closeBtn} onClick={onClose} aria-label="Close wake settings">
          ×
        </button>
      </div>
      <div className={styles.body}>
        <p className={styles.idleHint}>
          Say your phrase (default “{prettyPhrase(defaultPhrase)}”) to start listening.
          It runs on this machine only and never approves an action. Push-to-talk always
          works as a fallback.
        </p>
        {error && (
          <div className={styles.errorState} role="alert">
            <p className={styles.errorMsg}>{error}</p>
          </div>
        )}
        {status && (
          <>
            <p className={styles.idleHint}>
              Status: {STATE_LABEL[status.state]} · “{prettyPhrase(status.phrase)}”
              {status.mode ? ` · ${status.mode === "text" ? "custom phrase" : "model"}` : ""}
            </p>
            {status.error ? <p className={styles.errorMsg}>{status.error}</p> : null}
            <button
              className={`${styles.btn} ${styles.btnPrimary}`}
              disabled={!sidecarReady || busy}
              onClick={() => void toggle()}
            >
              {status.enabled ? "Disable wake word" : "Enable wake word"}
            </button>
            <label className={styles.fieldLabel}>
              Custom wake phrase
              <input
                className={styles.modelInput}
                type="text"
                value={draftPhrase}
                maxLength={48}
                disabled={!sidecarReady || busy}
                placeholder={defaultPhrase}
                aria-label="Custom wake phrase"
                onChange={(e) => setDraftPhrase(e.target.value)}
                onBlur={() => applyPhrase()}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    applyPhrase();
                  }
                }}
              />
            </label>
            <button
              className={styles.btn}
              disabled={!sidecarReady || busy || draftPhrase.trim() === defaultPhrase}
              onClick={() => {
                setDraftPhrase(defaultPhrase);
                void configure({ phrase: defaultPhrase });
              }}
            >
              Reset to {prettyPhrase(defaultPhrase)}
            </button>
            {status.phrases.length > 0 ? (
              <label className={styles.fieldLabel}>
                Optional model phrase
                <select
                  value={status.phrases.includes(status.phrase) ? status.phrase : ""}
                  disabled={!sidecarReady || busy}
                  onChange={(e) => {
                    if (e.target.value) void configure({ phrase: e.target.value });
                  }}
                  aria-label="Optional model wake phrase"
                >
                  <option value="">Use custom text above</option>
                  {status.phrases.map((phrase) => (
                    <option key={phrase} value={phrase}>
                      {prettyPhrase(phrase)}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <label className={styles.fieldLabel}>
              Sensitivity {status.sensitivity.toFixed(2)}
              <input
                type="range"
                min={0.1}
                max={0.95}
                step={0.05}
                value={status.sensitivity}
                disabled={!sidecarReady || busy}
                onChange={(e) => void configure({ sensitivity: Number(e.target.value) })}
                aria-label="Wake sensitivity"
              />
            </label>
          </>
        )}
      </div>
    </div>
  );
}
