/**
 * OllamaGate — banner shown when the local Ollama server isn't answering.
 *
 * Chat, the model advisor, and voice all fail with the same root cause, so
 * rather than surfacing a raw connection-refused string in three places, this
 * detects the condition up front and offers to start the installed app.
 */
import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import styles from "./ChatPanel.module.css";

interface Props {
  /** Called once the server becomes reachable, so the parent can retry. */
  onReady?: () => void;
}

type Phase = "checking" | "running" | "down" | "starting" | "failed";

export function OllamaGate({ onReady }: Props) {
  const [phase, setPhase] = useState<Phase>("checking");
  const [message, setMessage] = useState<string | null>(null);

  const check = useCallback(async () => {
    try {
      const running = await invoke<boolean>("ollama_running");
      // Only nag when we affirmatively know it's down. An unrecognised answer
      // means no Tauri backend (browser preview, tests) — stay out of the way.
      setPhase(running === false ? "down" : "running");
    } catch {
      setPhase("running");
    }
  }, []);

  useEffect(() => {
    void check();
  }, [check]);

  const start = async () => {
    setPhase("starting");
    setMessage(null);
    try {
      await invoke<string>("start_ollama");
      setPhase("running");
      onReady?.();
    } catch (err) {
      setPhase("failed");
      setMessage(err instanceof Error ? err.message : String(err));
    }
  };

  if (phase === "checking" || phase === "running") return null;

  return (
    <div className={styles.errorState} role="alert">
      <p className={styles.errorMsg}>
        Ollama isn’t running, so Bunny can’t think or answer out loud. Everything
        else keeps working.
      </p>
      {message && <p className={styles.errorMsg}>{message}</p>}
      <button
        className={`${styles.btn} ${styles.btnPrimary}`}
        onClick={() => void start()}
        disabled={phase === "starting"}
      >
        {phase === "starting" ? "Starting Ollama…" : "Start Ollama"}
      </button>
    </div>
  );
}
