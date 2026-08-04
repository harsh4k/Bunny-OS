/**
 * Learning — review what Bunny picked up. Voice-first; typing is secondary.
 */
import { useCallback, useEffect, useId, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { AppEvent } from "~contracts/ipc";
import { friendlyError, invokeErrorMessage } from "../lib/voiceStatus";
import { IconMic, IconTalk } from "./icons";
import learningAtmosphere from "../assets/learning-atmosphere.png";
import { PageHero } from "./PageHero";
import chrome from "./PageChrome.module.css";
import styles from "./LearningPanel.module.css";

interface Fact {
  id: number;
  text: string;
  source: string;
  timestamp: number;
  confidence: number;
}

interface SessionTurn {
  id: number;
  role: string;
  channel: string;
  text: string;
  timestamp: number;
}

interface Props {
  onClose: () => void;
  sidecarReady: boolean;
}

export function LearningPanel({ onClose, sidecarReady }: Props) {
  const [enabled, setEnabled] = useState(false);
  const [screenOn, setScreenOn] = useState(false);
  const [facts, setFacts] = useState<Fact[]>([]);
  const [session, setSession] = useState<SessionTurn[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const inputId = useId();

  const send = useCallback(async (payload: Record<string, unknown>) => {
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
  }, []);

  const refresh = useCallback(
    async (opts?: { quiet?: boolean }) => {
      if (!sidecarReady) return;
      const quiet = Boolean(opts?.quiet);
      if (!quiet) {
        setBusy(true);
        setError(null);
      }
      try {
        const raw = await send({ action: "memory_list" });
        const parsed = JSON.parse(raw) as {
          enabled: boolean;
          screen_context?: boolean;
          facts: Fact[];
          session?: SessionTurn[];
        };
        setEnabled(parsed.enabled);
        setScreenOn(Boolean(parsed.screen_context));
        setFacts(parsed.facts ?? []);
        setSession(parsed.session ?? []);
        if (quiet) setError(null);
      } catch (err) {
        const msg = friendlyError(invokeErrorMessage(err));
        setError((prev) => (prev === msg ? prev : msg));
      } finally {
        if (!quiet) setBusy(false);
      }
    },
    [send, sidecarReady]
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!sidecarReady) return;
    const timer = setInterval(() => {
      void refresh({ quiet: true });
    }, 4_000);
    return () => clearInterval(timer);
  }, [sidecarReady, refresh]);

  const addFact = async () => {
    const text = draft.trim();
    if (!text) return;
    setBusy(true);
    setError(null);
    try {
      const raw = await send({ action: "memory_add", text, source: "user" });
      const parsed = JSON.parse(raw) as { ok: boolean; error?: string };
      if (!parsed.ok) {
        setError(friendlyError(parsed.error ?? "failed to add"));
      } else {
        setDraft("");
        setShowAdd(false);
      }
      await refresh();
    } catch (err) {
      setError(friendlyError(invokeErrorMessage(err)));
    } finally {
      setBusy(false);
    }
  };

  const toggleLearning = async () => {
    await send({ action: "memory_set_enabled", enabled: !enabled });
    await refresh();
  };

  const learningNotes = session.filter((t) => t.role === "user");

  return (
    <div className={styles.root} role="dialog" aria-label="How Bunny learns">
      <PageHero
        tone="sand"
        atmosphere={learningAtmosphere}
        eyebrow="Memory"
        title="Learning"
        lede="Picks up from talk. Stays on this PC."
        statusLabel={enabled ? "On" : "Off"}
        statusTone={enabled ? "ok" : "off"}
        statusMeta={`${facts.length} known`}
        onClose={onClose}
        closeLabel="Close learning"
        actions={
          <button
            type="button"
            className={styles.switch}
            role="switch"
            aria-checked={enabled}
            disabled={!sidecarReady || busy}
            onClick={() => void toggleLearning()}
          >
            <span className={styles.switchTrack} data-on={enabled} aria-hidden="true">
              <span className={styles.switchThumb} />
            </span>
            <span className={styles.switchLabel}>{enabled ? "On" : "Off"}</span>
          </button>
        }
      />

      <section className={chrome.metrics} data-cols="3" aria-label="Learning summary">
        <div className={chrome.metric} data-tone={facts.length > 0 ? "ok" : "off"}>
          <span className={chrome.metricLabel}>Known</span>
          <span className={chrome.metricValue}>{facts.length}</span>
        </div>
        <div
          className={chrome.metric}
          data-tone={learningNotes.length > 0 ? "ok" : "off"}
        >
          <span className={chrome.metricLabel}>From talks</span>
          <span className={chrome.metricValue}>{learningNotes.length}</span>
        </div>
        <div className={chrome.metric} data-tone={screenOn ? "ok" : "off"}>
          <span className={chrome.metricLabel}>Screen</span>
          <span className={chrome.metricValue}>{screenOn ? "On" : "Off"}</span>
        </div>
      </section>

      {!enabled && (
        <p className={styles.banner} role="status">
          Learning is off — Bunny won’t keep new details until you turn it on.
        </p>
      )}

      <div className={styles.grid}>
        <section
          className={`${styles.col} ${chrome.card}`}
          data-tone="sand"
          aria-labelledby="known-heading"
        >
          <div className={styles.colHead}>
            <h3 id="known-heading" className={styles.colTitle}>
              Known
            </h3>
            <span className={styles.count}>{facts.length}</span>
          </div>
          {facts.length === 0 ? (
            <p className={styles.empty}>
              Empty for now. Talk naturally — useful bits land here.
            </p>
          ) : (
            <ul className={styles.chips} aria-label="Things Bunny has learned">
              {facts.map((f) => (
                <li key={f.id} className={styles.chip}>
                  <span className={styles.chipText}>{f.text}</span>
                  <button
                    type="button"
                    className={styles.chipAction}
                    disabled={busy}
                    aria-label={`Forget: ${f.text}`}
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
            </ul>
          )}
          {!showAdd ? (
            <button
              type="button"
              className={styles.addToggle}
              disabled={!sidecarReady || busy || !enabled}
              onClick={() => setShowAdd(true)}
            >
              + Add a note
            </button>
          ) : (
            <div className={styles.addBox}>
              <label htmlFor={inputId} className={styles.srOnly}>
                Note for Bunny to remember
              </label>
              <input
                id={inputId}
                className={styles.addInput}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="e.g. I prefer dark mode"
                disabled={!sidecarReady || busy || !enabled}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void addFact();
                  }
                  if (e.key === "Escape") {
                    setShowAdd(false);
                    setDraft("");
                  }
                }}
                autoFocus
              />
              <div className={styles.addRow}>
                <button
                  type="button"
                  className={chrome.btnInk}
                  disabled={!draft.trim() || !enabled || busy}
                  onClick={() => void addFact()}
                >
                  Save
                </button>
                <button
                  type="button"
                  className={chrome.btnGhost}
                  onClick={() => {
                    setShowAdd(false);
                    setDraft("");
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </section>

        <section
          className={`${styles.col} ${chrome.card}`}
          data-tone="sand"
          aria-labelledby="recent-heading"
        >
          <div className={styles.colHead}>
            <h3 id="recent-heading" className={styles.colTitle}>
              From talks
            </h3>
            <span className={styles.count}>{learningNotes.length}</span>
            {learningNotes.length > 0 ? (
              <button
                type="button"
                className={styles.linkQuiet}
                disabled={busy}
                onClick={() =>
                  void (async () => {
                    await send({ action: "memory_clear_session" });
                    await refresh();
                  })()
                }
              >
                Clear
              </button>
            ) : null}
          </div>
          {learningNotes.length === 0 ? (
            <p className={styles.empty}>
              Recent voice lines show here so you can dismiss noise.
            </p>
          ) : (
            <ul className={styles.feed} aria-label="Recent learning notes">
              {learningNotes.slice(0, 10).map((t) => (
                <li key={t.id} className={styles.feedRow}>
                  <span className={styles.feedIcon} aria-hidden="true">
                    {t.channel === "voice" ? (
                      <IconMic size={14} />
                    ) : (
                      <IconTalk size={14} />
                    )}
                  </span>
                  <span className={styles.feedText}>{t.text}</span>
                  <button
                    type="button"
                    className={styles.chipAction}
                    disabled={busy}
                    aria-label="Dismiss"
                    onClick={() =>
                      void (async () => {
                        await send({ action: "memory_delete_session", id: t.id });
                        await refresh();
                      })()
                    }
                  >
                    Dismiss
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      <footer className={styles.foot}>
        <button
          type="button"
          className={chrome.btnGhost}
          onClick={() => setShowPrivacy((v) => !v)}
        >
          {showPrivacy ? "Hide privacy" : "Privacy & export"}
        </button>
      </footer>

      {showPrivacy && (
        <div className={`${styles.privacy} ${chrome.card}`} data-tone="sand">
          <p className={styles.privacyHint}>
            Screen reading is off by default. When on, only screen questions may
            read the focused window — local only.
          </p>
          <div className={styles.privacyRow}>
            <button
              type="button"
              className={chrome.btnGhost}
              disabled={!sidecarReady || busy}
              onClick={() =>
                void (async () => {
                  await send({
                    action: "screen_set_enabled",
                    enabled: !screenOn,
                  });
                  await refresh();
                })()
              }
            >
              Screen: {screenOn ? "On" : "Off"}
            </button>
            <button
              type="button"
              className={chrome.btnGhost}
              disabled={!sidecarReady || busy}
              onClick={() =>
                void (async () => {
                  const raw = await send({ action: "memory_export" });
                  const blob = new Blob([raw], { type: "application/json" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = "bunny-learning-export.json";
                  a.click();
                  URL.revokeObjectURL(url);
                })()
              }
            >
              Export
            </button>
            <button
              type="button"
              className={styles.btnDanger}
              disabled={busy}
              onClick={() =>
                void (async () => {
                  await send({ action: "memory_clear" });
                  await refresh();
                })()
              }
            >
              Forget all
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
