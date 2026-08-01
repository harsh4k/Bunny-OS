/**
 * OllamaGate — banner when the local Ollama server isn't answering.
 *
 * Offers Install & start (downloads official Ollama if missing, then pulls a
 * default chat model) so end users never need a separate manual install.
 */
import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import styles from "./ChatPanel.module.css";

interface Props {
  /** Called once the server becomes reachable, so the parent can retry. */
  onReady?: () => void;
}

type Phase =
  | "checking"
  | "running"
  | "down"
  | "starting"
  | "installing"
  | "failed";

export function OllamaGate({ onReady }: Props) {
  const [phase, setPhase] = useState<Phase>("checking");
  const [message, setMessage] = useState<string | null>(null);
  const [installed, setInstalled] = useState(true);

  const check = useCallback(async () => {
    try {
      const [running, hasApp] = await Promise.all([
        invoke<boolean>("ollama_running"),
        invoke<boolean>("ollama_installed").catch(() => true),
      ]);
      setInstalled(hasApp !== false);
      setPhase(running === false ? "down" : "running");
    } catch {
      setPhase("running");
    }
  }, []);

  useEffect(() => {
    void check();
  }, [check]);

  const ensure = async () => {
    setPhase(installed ? "starting" : "installing");
    setMessage(
      installed
        ? "Starting Ollama…"
        : "Downloading official Ollama (one-time). This can take several minutes…"
    );
    try {
      const result = await invoke<string>("ensure_ollama");
      setMessage(result);
      setPhase("running");
      onReady?.();
    } catch (err) {
      setPhase("failed");
      setMessage(err instanceof Error ? err.message : String(err));
    }
  };

  if (phase === "checking" || phase === "running") return null;

  const busy = phase === "starting" || phase === "installing";

  return (
    <div className={styles.errorState} role="alert">
      <p className={styles.errorMsg}>
        {installed
          ? "Ollama isn’t running, so Bunny can’t chat or answer out loud."
          : "Bunny will download and install Ollama for you (official build). One-time, on this machine only."}
      </p>
      {message && <p className={styles.errorMsg}>{message}</p>}
      <button
        className={`${styles.btn} ${styles.btnPrimary}`}
        onClick={() => void ensure()}
        disabled={busy}
      >
        {phase === "installing"
          ? "Installing Ollama…"
          : phase === "starting"
            ? "Starting Ollama…"
            : installed
              ? "Start Ollama"
              : "Install & start Ollama"}
      </button>
    </div>
  );
}
