/**
 * WakePanel — enable/disable wake word + custom phrase (default Hey Bunny).
 * Hotkey / Talk remains the reliable fallback. Wake never authorizes actions.
 */
import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { AppEvent } from "~contracts/ipc";
import { friendlyError, invokeErrorMessage } from "../lib/voiceStatus";
import voiceAtmosphere from "../assets/voice-atmosphere.png";
import { PageHero, type StatusTone } from "./PageHero";
import { SelectMenu } from "./ui/dropdown-menu";
import chrome from "./PageChrome.module.css";
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
  profile?: string;
  profiles?: string[];
  error: string;
  hotkey_fallback: boolean;
  default_phrase?: string;
}

const STATE_LABEL: Record<WakeStatus["state"], string> = {
  off: "Off",
  loading: "Loading",
  listening: "Listening",
  error: "Error",
};

function prettyPhrase(phrase: string): string {
  return phrase
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function wakeStatusTone(state: WakeStatus["state"] | undefined): StatusTone {
  if (state === "listening") return "ok";
  if (state === "loading" || state === "error") return "warn";
  return "off";
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

  const refresh = useCallback(async (opts?: { quiet?: boolean }) => {
    if (!sidecarReady) return;
    const quiet = Boolean(opts?.quiet);
    if (!quiet) {
      setBusy(true);
      setError(null);
    }
    try {
      const raw = await send({ action: "wake_status" });
      const next = JSON.parse(raw) as WakeStatus;
      setStatus(next);
      if (!quiet) setDraftPhrase(next.phrase);
    } catch (err) {
      const msg = friendlyError(invokeErrorMessage(err));
      setError((prev) => (prev === msg ? prev : msg));
    } finally {
      if (!quiet) setBusy(false);
    }
  }, [send, sidecarReady]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Poll only while the model is loading — not on stable error (stops banner blink).
  useEffect(() => {
    if (status?.state !== "loading") return;
    const timer = setInterval(() => void refresh({ quiet: true }), 1_500);
    return () => clearInterval(timer);
  }, [status?.state, refresh]);

  const toggle = async () => {
    if (!status) return;
    setBusy(true);
    setError(null);
    try {
      const running = status.state === "listening" || status.state === "loading";
      // Preference on but not running → retry start; running → stop; else enable.
      const action = running ? "wake_stop" : "wake_start";
      const raw = await send({ action });
      const next = JSON.parse(raw) as WakeStatus;
      setStatus(next);
      setDraftPhrase(next.phrase);
    } catch (err) {
      setError(friendlyError(invokeErrorMessage(err)));
    } finally {
      setBusy(false);
    }
  };

  const disableWake = async () => {
    if (!status) return;
    setBusy(true);
    setError(null);
    try {
      const raw = await send({ action: "wake_stop" });
      const next = JSON.parse(raw) as WakeStatus;
      setStatus(next);
      setDraftPhrase(next.phrase);
    } catch (err) {
      setError(friendlyError(invokeErrorMessage(err)));
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
      setError(friendlyError(invokeErrorMessage(err)));
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
  const running =
    status?.state === "listening" || status?.state === "loading";
  const toggleLabel = running
    ? "Disable wake word"
    : status?.enabled
      ? "Retry wake word"
      : "Enable wake word";

  return (
    <div className={styles.overlay} role="dialog" aria-label="Wake word settings">
      <PageHero
        tone="ink"
        atmosphere={voiceAtmosphere}
        eyebrow="Voice"
        title="Wake & talk"
        lede="Say your phrase to start listening — local only, never approves actions. Push-to-talk always works."
        statusLabel={status ? STATE_LABEL[status.state] : "…"}
        statusTone={wakeStatusTone(status?.state)}
        statusMeta={status ? prettyPhrase(status.phrase) : undefined}
        onClose={onClose}
        closeLabel="Close wake settings"
        actions={
          status ? (
            <button
              type="button"
              className={running ? chrome.btnGlass : chrome.btnInk}
              disabled={!sidecarReady || busy}
              onClick={() => void toggle()}
            >
              {toggleLabel}
            </button>
          ) : null
        }
      />

      <section className={chrome.metrics} data-cols="3" aria-label="Wake summary">
        <div className={chrome.metric} data-tone={wakeStatusTone(status?.state)}>
          <span className={chrome.metricLabel}>State</span>
          <span className={chrome.metricValue}>
            {status ? STATE_LABEL[status.state] : "…"}
          </span>
        </div>
        <div className={chrome.metric}>
          <span className={chrome.metricLabel}>Phrase</span>
          <span className={chrome.metricValue}>
            {status ? prettyPhrase(status.phrase) : "…"}
          </span>
        </div>
        <div className={chrome.metric}>
          <span className={chrome.metricLabel}>Profile</span>
          <span className={chrome.metricValue}>
            {status?.profile
              ? status.profile.charAt(0).toUpperCase() + status.profile.slice(1)
              : "…"}
          </span>
        </div>
      </section>

      <div className={styles.body}>
        {error && (
          <div className={styles.errorState} role="alert">
            <p className={styles.errorMsg}>{error}</p>
          </div>
        )}
        {status && (
          <div className={chrome.card} data-tone="ink">
            {status.enabled && status.state === "off" ? (
              <p className={styles.idleHint}>Will retry on restart.</p>
            ) : null}
            {status.error ? (
              <div className={styles.errorState} role="alert">
                <p className={styles.errorMsg}>{friendlyError(status.error)}</p>
              </div>
            ) : null}
            {status.enabled &&
            status.state !== "listening" &&
            status.state !== "loading" ? (
              <button
                type="button"
                className={chrome.btnGhost}
                disabled={!sidecarReady || busy}
                onClick={() => void disableWake()}
              >
                Disable wake word
              </button>
            ) : null}
            <label className={styles.fieldLabel}>
              Sensitivity profile
              <SelectMenu
                tone="light"
                value={status.profile ?? "balanced"}
                disabled={!sidecarReady || busy}
                aria-label="Wake sensitivity profile"
                onChange={(value) => {
                  if (value) void configure({ profile: value });
                }}
                options={(status.profiles ?? ["strict", "balanced", "sensitive"]).map(
                  (name) => ({
                    value: name,
                    label: name.charAt(0).toUpperCase() + name.slice(1),
                  }),
                )}
              />
            </label>
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
              type="button"
              className={chrome.btnGhost}
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
                <SelectMenu
                  tone="light"
                  value={
                    status.phrases.includes(status.phrase) ? status.phrase : ""
                  }
                  disabled={!sidecarReady || busy}
                  aria-label="Optional model wake phrase"
                  placeholder="Use custom text above"
                  onChange={(value) => {
                    if (value) void configure({ phrase: value });
                  }}
                  options={[
                    { value: "", label: "Use custom text above" },
                    ...status.phrases.map((phrase) => ({
                      value: phrase,
                      label: prettyPhrase(phrase),
                    })),
                  ]}
                />
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
          </div>
        )}
      </div>
    </div>
  );
}
