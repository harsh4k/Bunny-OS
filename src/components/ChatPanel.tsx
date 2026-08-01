/**
 * ChatPanel — typed developer chat interface for Bunny OS assistant.
 *
 * Security: no dangerouslySetInnerHTML; text nodes only.
 * Correlation: crypto.randomUUID per request; mismatched IDs ignored.
 * Cancel: sends cancel_chat to sidecar so network work actually stops.
 */
import { useState, useEffect, useCallback, useRef, useId } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import type { AppEvent, AssistantAction, AuditEvent } from "~contracts/ipc";
import { parseAssistantResult } from "../lib/assistantResult";
import { useVoiceTurns } from "../lib/voiceTurns";
import { ChatPhaseDisplay } from "./chat/ChatPhaseDisplay";
import { ChatAuditList } from "./chat/ChatAuditList";
import { OllamaGate } from "./OllamaGate";
import {
  CHAT_TIMEOUT_MS,
  DEFAULT_MODEL,
  type ChatPhase,
} from "./chat/chatTypes";
import styles from "./ChatPanel.module.css";

interface Props {
  onClose: () => void;
  sidecarReady: boolean;
}

export function ChatPanel({ onClose, sidecarReady }: Props) {
  const [phase, setPhase] = useState<ChatPhase>({ phase: "idle" });
  const [input, setInput] = useState("");
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [audits, setAudits] = useState<AuditEvent[]>([]);
  const voiceTurns = useVoiceTurns();

  const unlistenSidecarRef = useRef<UnlistenFn | null>(null);
  const unlistenAuditRef = useRef<UnlistenFn | null>(null);
  const auditAbortedRef = useRef(false);
  const watchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeRequestRef = useRef<string | null>(null);
  const modelInputId = useId();
  const messageInputId = useId();

  const clearWatchdog = useCallback(() => {
    if (watchdogRef.current !== null) {
      clearTimeout(watchdogRef.current);
      watchdogRef.current = null;
    }
  }, []);

  const clearSidecarListener = useCallback(() => {
    unlistenSidecarRef.current?.();
    unlistenSidecarRef.current = null;
  }, []);

  /** (Re)start the inactivity watchdog for the in-flight request. */
  const armWatchdog = useCallback(() => {
    clearWatchdog();
    watchdogRef.current = setTimeout(() => {
      clearSidecarListener();
      setPhase({
        phase: "error",
        message:
          "No response for 2 minutes. Ollama may still be loading a large " +
          "model — try again, or pick a smaller one.",
      });
    }, CHAT_TIMEOUT_MS);
  }, [clearWatchdog, clearSidecarListener]);

  // The bundled default may not be pulled on this machine; ask what is.
  useEffect(() => {
    if (!sidecarReady) return;
    const id = crypto.randomUUID();
    let unlisten: UnlistenFn | null = null;
    void listen<AppEvent>("app-event", (e) => {
      const ev = e.payload;
      if (ev.event !== "sidecar-message") return;
      const msg = ev.message;
      if (!("id" in msg) || msg.id !== id) return;
      unlisten?.();
      if (msg.type !== "response") return;
      try {
        const { model: resolved } = JSON.parse(msg.result) as { model: string | null };
        if (resolved) setModel(resolved);
      } catch {
        /* keep the fallback default */
      }
    }).then((fn) => {
      unlisten = fn;
    });
    invoke("send_action", { id, payload: { action: "get_default_model" } }).catch(
      () => unlisten?.()
    );
    return () => unlisten?.();
  }, [sidecarReady]);

  useEffect(() => {
    auditAbortedRef.current = false;
    listen<AuditEvent>("audit-event", (e) => {
      setAudits((prev) => [e.payload, ...prev].slice(0, 50));
    })
      .then((fn) => {
        if (auditAbortedRef.current) {
          fn();
          return;
        }
        unlistenAuditRef.current = fn;
      })
      .catch(console.error);

    return () => {
      auditAbortedRef.current = true;
      clearWatchdog();
      clearSidecarListener();
      unlistenAuditRef.current?.();
      unlistenAuditRef.current = null;
    };
  }, [clearWatchdog, clearSidecarListener]);

  const send = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || !sidecarReady) return;
    if (phase.phase === "streaming" || phase.phase === "executing") return;

    const requestId = crypto.randomUUID();
    activeRequestRef.current = requestId;
    setPhase({ phase: "streaming", requestId, text: "" });
    setInput("");
    clearSidecarListener();
    armWatchdog();

    unlistenSidecarRef.current = await listen<AppEvent>("app-event", (e) => {
      const ev = e.payload;
      if (ev.event !== "sidecar-message") return;
      const msg = ev.message;
      if ("id" in msg && msg.id !== requestId) return;

      if (msg.type === "stream" && msg.id === requestId) {
        setPhase((prev) => {
          if (prev.phase !== "streaming") return prev;
          return { ...prev, text: prev.text + msg.chunk };
        });
        // Restart the clock on progress: the watchdog guards against silence,
        // not against long answers.
        if (msg.finished) clearWatchdog();
        else armWatchdog();
        return;
      }

      if (msg.type === "response" && msg.id === requestId) {
        clearWatchdog();
        clearSidecarListener();
        const result = parseAssistantResult(msg.result);
        if (!result) {
          setPhase({ phase: "error", message: "Failed to parse assistant response." });
          return;
        }
        if (result.kind === "action") {
          setPhase((prev) => ({
            phase: "awaiting_action",
            result,
            streamed: prev.phase === "streaming" ? prev.text : "",
          }));
        } else {
          setPhase({ phase: "done", outcome: result.text });
        }
        return;
      }

      if (msg.type === "error" && msg.id === requestId) {
        clearWatchdog();
        clearSidecarListener();
        setPhase({ phase: "error", message: msg.error });
      }
    });

    try {
      await invoke("send_action", {
        id: requestId,
        // Blank model lets the sidecar pick an installed one.
        payload: { action: "chat", model: model.trim() || undefined, message: trimmed },
      });
    } catch (err) {
      clearWatchdog();
      clearSidecarListener();
      setPhase({ phase: "error", message: String(err) });
    }
  }, [input, model, sidecarReady, phase.phase, armWatchdog, clearWatchdog, clearSidecarListener]);

  const cancel = useCallback(async () => {
    const requestId = activeRequestRef.current;
    clearWatchdog();
    clearSidecarListener();
    setPhase({ phase: "idle" });
    if (!requestId) return;
    try {
      await invoke("send_action", {
        id: crypto.randomUUID(),
        payload: { action: "cancel_chat", request_id: requestId },
      });
    } catch (err) {
      console.error("cancel_chat failed", err);
    }
  }, [clearWatchdog, clearSidecarListener]);

  const executeAction = useCallback(async (action: AssistantAction) => {
    setPhase({ phase: "executing", action });
    try {
      const result = await invoke<string>("execute_assistant_action", { action });
      setPhase({ phase: "done", outcome: result });
    } catch (err) {
      setPhase({ phase: "error", message: String(err) });
    }
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (canSend) void send();
    }
    if (e.key === "Escape" && phase.phase === "streaming") {
      void cancel();
    }
  };

  const canSend =
    input.trim().length > 0 &&
    sidecarReady &&
    phase.phase !== "streaming" &&
    phase.phase !== "executing";

  return (
    <div className={styles.overlay} role="dialog" aria-label="Assistant Chat">
      <div className={styles.header}>
        <span className={styles.title}>Assistant</span>
        <button className={styles.closeBtn} onClick={onClose} aria-label="Close chat">
          ×
        </button>
      </div>

      <div className={styles.body}>
        <OllamaGate onReady={() => setPhase({ phase: "idle" })} />
        <div className={styles.modelRow}>
          <label htmlFor={modelInputId} className={styles.fieldLabel}>
            Model
          </label>
          <input
            id={modelInputId}
            className={styles.modelInput}
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="Auto — uses an installed model"
            disabled={phase.phase === "streaming" || phase.phase === "executing"}
            aria-label="Ollama model name"
            spellCheck={false}
          />
        </div>

        <div className={styles.outputArea} role="log" aria-live="polite" aria-label="Chat output">
          {voiceTurns.length > 0 && (
            <ol className={styles.voiceLog} aria-label="Voice conversation">
              {voiceTurns.map((turn) => (
                <li key={turn.id} className={styles.voiceTurn}>
                  <span className={styles.voiceTag}>Voice</span>
                  {turn.transcript && (
                    <p className={styles.voiceUser}>
                      <span className={styles.voiceRole}>You</span>
                      {turn.transcript}
                    </p>
                  )}
                  {turn.reply && (
                    <p className={styles.voiceAssistant}>
                      <span className={styles.voiceRole}>Bunny</span>
                      {turn.reply}
                    </p>
                  )}
                  {turn.error && (
                    <p className={styles.voiceError} role="alert">
                      {turn.error}
                    </p>
                  )}
                </li>
              ))}
            </ol>
          )}
          <ChatPhaseDisplay
            phase={phase}
            onExecuteAction={(a) => void executeAction(a)}
            onRetry={() => setPhase({ phase: "idle" })}
          />
        </div>

        <ChatAuditList audits={audits} />
      </div>

      <div className={styles.inputArea}>
        <label htmlFor={messageInputId} className={styles.srOnly}>
          Message
        </label>
        <textarea
          id={messageInputId}
          className={styles.textarea}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask Bunny OS… (Enter to send, Shift+Enter for newline)"
          disabled={phase.phase === "streaming" || phase.phase === "executing"}
          rows={3}
          aria-label="Message input"
          aria-disabled={!canSend}
        />
        <div className={styles.btnRow}>
          {phase.phase === "streaming" ? (
            <button
              className={`${styles.btn} ${styles.btnSecondary}`}
              onClick={() => void cancel()}
              aria-label="Cancel streaming"
            >
              Cancel
            </button>
          ) : (
            <button
              className={`${styles.btn} ${styles.btnPrimary}`}
              onClick={() => void send()}
              disabled={!canSend}
              aria-label="Send message"
            >
              {phase.phase === "executing" ? "Executing…" : "Send"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
