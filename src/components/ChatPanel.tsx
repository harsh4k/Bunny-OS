/**
 * ChatPanel — typed fallback when voice isn’t practical.
 * Learning stays the main “what Bunny knows” surface; this is opt-in from there.
 */
import { useState, useEffect, useCallback, useRef, useId } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import type { AppEvent, AssistantAction } from "~contracts/ipc";
import { parseAssistantResult } from "../lib/assistantResult";
import { friendlyError, invokeErrorMessage } from "../lib/voiceStatus";
import { ChatPhaseDisplay } from "./chat/ChatPhaseDisplay";
import { OllamaGate } from "./OllamaGate";
import {
  CHAT_TIMEOUT_MS,
  DEFAULT_MODEL,
  type ChatPhase,
} from "./chat/chatTypes";
import learningAtmosphere from "../assets/learning-atmosphere.png";
import { PageHero } from "./PageHero";
import chrome from "./PageChrome.module.css";
import styles from "./ChatPanel.module.css";

interface Props {
  onClose: () => void;
  sidecarReady: boolean;
}

export function ChatPanel({ onClose, sidecarReady }: Props) {
  const [phase, setPhase] = useState<ChatPhase>({ phase: "idle" });
  const [input, setInput] = useState("");
  const [model, setModel] = useState(DEFAULT_MODEL);

  const unlistenSidecarRef = useRef<UnlistenFn | null>(null);
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
    return () => {
      clearWatchdog();
      clearSidecarListener();
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
        setPhase({ phase: "error", message: friendlyError(msg.error) });
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
      setPhase({ phase: "error", message: friendlyError(invokeErrorMessage(err)) });
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
      setPhase({ phase: "error", message: friendlyError(invokeErrorMessage(err)) });
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
    <div className={styles.overlay} role="dialog" aria-label="Type to Bunny">
      <PageHero
        tone="sand"
        atmosphere={learningAtmosphere}
        eyebrow="Fallback"
        title="Type to Bunny"
        lede="Same local Bunny as voice — for when you can’t talk out loud."
        statusLabel={
          phase.phase === "streaming"
            ? "Streaming"
            : phase.phase === "executing"
              ? "Working"
              : phase.phase === "error"
                ? "Error"
                : "Ready"
        }
        statusTone={
          phase.phase === "error"
            ? "warn"
            : phase.phase === "streaming" || phase.phase === "executing"
              ? "warn"
              : "ok"
        }
        statusMeta={model || "auto"}
        onClose={onClose}
        closeLabel="Back to learning"
      />

      <div className={styles.body}>
        <OllamaGate onReady={() => setPhase({ phase: "idle" })} />
        <div className={`${chrome.card} ${styles.modelCard}`} data-tone="sand">
          <label htmlFor={modelInputId} className={styles.fieldLabel}>
            Model
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
          </label>
        </div>

        <div className={styles.outputArea} role="log" aria-live="polite" aria-label="Reply">
          <ChatPhaseDisplay
            phase={phase}
            onExecuteAction={(a) => void executeAction(a)}
            onRetry={() => setPhase({ phase: "idle" })}
          />
        </div>
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
              type="button"
              className={chrome.btnGhost}
              onClick={() => void cancel()}
              aria-label="Cancel streaming"
            >
              Cancel
            </button>
          ) : (
            <button
              type="button"
              className={chrome.btnInk}
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
