/**
 * WakePanel — enable/disable wake-word scaffold + sensitivity.
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
  phrases: string[];
  sensitivity: number;
  cooldown_secs: number;
  error: string;
  hotkey_fallback: boolean;
}

const STATE_LABEL: Record<WakeStatus["state"], string> = {
  off: "Off",
  loading: "Loading model…",
  listening: "Listening for the wake phrase",
  error: "Stopped",
};

function prettyPhrase(phrase: string): string {
  return phrase
    .split("_")
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

  const send = useCallback(async (payload: Record<string, unknown>) => {
    const id = crypto.randomUUID();
    return new Promise<string>((resolve, reject) => {
      let unlisten: UnlistenFn | null = null;
      const timer = setTimeout(() => {
        unlisten?.();
        reject(new Error("wake request timed out"));
      }, 10_000);
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
      setStatus(JSON.parse(raw) as WakeStatus);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [send, sidecarReady]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Loading the wake model can download weights, so poll until it settles.
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
      setStatus(JSON.parse(raw) as WakeStatus);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const configure = async (patch: Record<string, unknown>) => {
    setBusy(true);
    try {
      await send({ action: "wake_configure", ...patch });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

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
          Detection runs entirely on this machine and only starts listening — it can
          never approve an action. There is no pretrained “Hey Bunny” model, so pick a
          phrase below, or drop your own .onnx into %LOCALAPPDATA%\BunnyOS\wake\ to have
          it appear here. The push-to-talk hotkey always works regardless.
        </p>
        {error && (
          <div className={styles.errorState} role="alert">
            <p className={styles.errorMsg}>{error}</p>
          </div>
        )}
        {status && (
          <>
            <p className={styles.idleHint}>
              Status: {STATE_LABEL[status.state]} · Phrase: “{prettyPhrase(status.phrase)}”
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
              Wake phrase
              <select
                value={status.phrase}
                disabled={!sidecarReady || busy}
                onChange={(e) => void configure({ phrase: e.target.value })}
                aria-label="Wake phrase"
              >
                {status.phrases.map((phrase) => (
                  <option key={phrase} value={phrase}>
                    {prettyPhrase(phrase)}
                  </option>
                ))}
              </select>
            </label>
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
