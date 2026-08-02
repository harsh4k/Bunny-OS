/**
 * Learning — what Bunny picks up from talks with you.
 * Not a chat log or memory admin: user-facing “how I’m getting better.”
 */
import { useCallback, useEffect, useId, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { AppEvent } from "~contracts/ipc";
import { friendlyError, invokeErrorMessage } from "../lib/voiceStatus";
import styles from "./ChatPanel.module.css";

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
  /** Open typed fallback — not the main product surface. */
  onTypeInstead?: () => void;
}

export function LearningPanel({ onClose, sidecarReady, onTypeInstead }: Props) {
  const [enabled, setEnabled] = useState(true);
  const [screenOn, setScreenOn] = useState(false);
  const [facts, setFacts] = useState<Fact[]>([]);
  const [session, setSession] = useState<SessionTurn[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
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
      } else setDraft("");
      await refresh();
    } catch (err) {
      setError(friendlyError(invokeErrorMessage(err)));
    } finally {
      setBusy(false);
    }
  };

  // User turns only — not Bunny’s replies (those aren’t “learning”).
  const learningNotes = session.filter((t) => t.role === "user");

  return (
    <div className={styles.overlay} role="dialog" aria-label="How Bunny learns">
      <div className={styles.header}>
        <span className={styles.title}>Learning</span>
        <button
          className={styles.closeBtn}
          onClick={onClose}
          aria-label="Close learning"
        >
          ×
        </button>
      </div>
      <div className={styles.body}>
        <p className={styles.idleHint}>
          Bunny gets better from your conversations — preferences, names, and
          habits you mention. Nothing leaves this PC. Learning never runs actions
          on its own.
        </p>

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
            Learning: {enabled ? "On" : "Off"}
          </button>
        </div>

        {!enabled && (
          <p className={styles.idleHint}>
            Learning is off. Bunny won’t keep new details from talks until you
            turn it back on.
          </p>
        )}

        <p className={styles.fieldLabel}>What Bunny knows about you</p>
        <ul className={styles.auditList} aria-label="Things Bunny has learned">
          {facts.map((f) => (
            <li key={f.id} className={styles.auditRow}>
              <span className={styles.auditLabel}>{f.text}</span>
              <button
                className={`${styles.btn} ${styles.btnSecondary} ${styles.btnCompact}`}
                disabled={busy}
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
          {facts.length === 0 && (
            <li className={styles.idleHint}>
              Nothing saved yet — chat or talk naturally and Bunny will pick up
              useful details.
            </li>
          )}
        </ul>

        <p className={styles.fieldLabel}>Picking up from recent talks</p>
        <ul className={styles.auditList} aria-label="Recent learning notes">
          {learningNotes.slice(0, 8).map((t) => (
            <li key={t.id} className={styles.auditRow}>
              <span className={styles.auditLabel}>
                From {t.channel === "voice" ? "voice" : "a talk"}: {t.text}
              </span>
              <button
                className={`${styles.btn} ${styles.btnSecondary} ${styles.btnCompact}`}
                disabled={busy}
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
          {learningNotes.length === 0 && (
            <li className={styles.idleHint}>
              Recent talks will show here as Bunny learns — not a full chat
              history.
            </li>
          )}
        </ul>

        <label htmlFor={inputId} className={styles.fieldLabel}>
          Tell Bunny something to remember
        </label>
        <textarea
          id={inputId}
          className={styles.textarea}
          rows={2}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="I prefer dark mode…"
          disabled={!sidecarReady || busy || !enabled}
        />
        <div className={styles.btnRow}>
          <button
            className={`${styles.btn} ${styles.btnPrimary}`}
            disabled={!draft.trim() || !enabled || busy}
            onClick={() => void addFact()}
          >
            Remember this
          </button>
          <button
            className={`${styles.btn} ${styles.btnSecondary}`}
            disabled={busy || learningNotes.length === 0}
            onClick={() =>
              void (async () => {
                await send({ action: "memory_clear_session" });
                await refresh();
              })()
            }
          >
            Clear recent
          </button>
        </div>

        {error && (
          <div className={styles.errorState} role="alert">
            {error}
          </div>
        )}

        <button
          type="button"
          className={`${styles.btn} ${styles.btnGhost}`}
          onClick={() => setShowAdvanced((v) => !v)}
        >
          {showAdvanced ? "Hide privacy controls" : "Privacy & export…"}
        </button>

        {showAdvanced && (
          <>
            <p className={styles.idleHint}>
              Screen reading is Off by default. When On, only questions about
              your screen may read the focused window locally — never silent,
              never cloud.
            </p>
            <div className={styles.btnRow}>
              <button
                className={`${styles.btn} ${styles.btnSecondary}`}
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
                Screen reading: {screenOn ? "On" : "Off"}
              </button>
              <button
                className={`${styles.btn} ${styles.btnSecondary}`}
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
                Export…
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
                Forget everything
              </button>
            </div>
          </>
        )}

        {onTypeInstead && (
          <p className={styles.idleHint}>
            Prefer typing over voice?{" "}
            <button
              type="button"
              className={`${styles.btn} ${styles.btnGhost}`}
              onClick={onTypeInstead}
            >
              Type to Bunny
            </button>
          </p>
        )}
      </div>
    </div>
  );
}


