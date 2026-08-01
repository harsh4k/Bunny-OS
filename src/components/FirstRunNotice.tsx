/**
 * First-run onboarding: privacy → system scan → permissions → Ollama → done.
 * Dismissal is localStorage only (no cloud).
 */
import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import styles from "./ChatPanel.module.css";

const KEY = "bunnyos.onboarding.v1";
const LEGACY_KEY = "bunnyos.firstRunAck.v1";

type Step = "welcome" | "scan" | "permissions" | "ollama" | "done";

interface ScanResult {
  os: string;
  arch: string;
  app_count: number;
  sample_apps: string[];
}

interface Props {
  onDismiss?: () => void;
}

export function FirstRunNotice({ onDismiss }: Props) {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState<Step>("welcome");
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [ollamaOk, setOllamaOk] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(KEY) === "1" || localStorage.getItem(LEGACY_KEY) === "1") {
        return;
      }
      setVisible(true);
    } catch {
      setVisible(true);
    }
  }, []);

  const finish = useCallback(() => {
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      /* ignore */
    }
    setVisible(false);
    onDismiss?.();
  }, [onDismiss]);

  const runScan = useCallback(async () => {
    setBusy(true);
    setScanError(null);
    try {
      const result = await invoke<ScanResult>("onboarding_scan");
      setScan(result);
      setStep("permissions");
    } catch (e) {
      setScanError(e instanceof Error ? e.message : String(e));
      // Browser/Vitest: fake a scan so the wizard is still testable.
      setScan({
        os: navigator.platform.toLowerCase().includes("mac") ? "macOS" : "Windows",
        arch: "x86_64",
        app_count: 0,
        sample_apps: [],
      });
      setStep("permissions");
    } finally {
      setBusy(false);
    }
  }, []);

  const checkOllama = useCallback(async () => {
    setBusy(true);
    try {
      const ok = await invoke<boolean>("ollama_running");
      setOllamaOk(ok);
    } catch {
      setOllamaOk(false);
    } finally {
      setBusy(false);
      setStep("done");
    }
  }, []);

  if (!visible) return null;

  return (
    <div className={styles.overlay} role="dialog" aria-label="Bunny OS onboarding">
      <div className={styles.header}>
        <span className={styles.title}>Set up Bunny OS</span>
        <span className={styles.idleHint} aria-live="polite">
          {stepLabel(step)}
        </span>
      </div>
      <div className={styles.body}>
        {step === "welcome" && (
          <>
            <p className={styles.idleHint}>
              Local-only assistant. Nothing is sent to a cloud service.
            </p>
            <ul className={styles.idleHint}>
              <li>Mic starts muted — F9 temporarily unmutes while you talk.</li>
              <li>Memory is opt-in and reviewable.</li>
              <li>Voice never auto-approves app or URL actions.</li>
            </ul>
            <button
              className={`${styles.btn} ${styles.btnPrimary}`}
              onClick={() => setStep("scan")}
              aria-label="Continue to system scan"
            >
              Continue
            </button>
          </>
        )}

        {step === "scan" && (
          <>
            <p className={styles.idleHint}>
              Scan installed apps so Bunny can open them by name. Read-only — no
              shell, no cloud.
            </p>
            {scanError && (
              <p className={styles.idleHint} role="alert">
                Scan note: {scanError}
              </p>
            )}
            <button
              className={`${styles.btn} ${styles.btnPrimary}`}
              onClick={() => void runScan()}
              disabled={busy}
              aria-label="Run system scan"
            >
              {busy ? "Scanning…" : "Scan this machine"}
            </button>
          </>
        )}

        {step === "permissions" && (
          <>
            <p className={styles.idleHint}>
              {scan
                ? `Found ${scan.app_count} apps on ${scan.os} (${scan.arch}).`
                : "Permissions"}
            </p>
            {scan && scan.sample_apps.length > 0 && (
              <p className={styles.idleHint}>
                Examples: {scan.sample_apps.slice(0, 5).join(", ")}
              </p>
            )}
            <p className={styles.idleHint}>
              {(scan?.os ?? "Your OS") === "macOS"
                ? "macOS controls mic and speakers in System Settings. Bunny will open the right panes — enable access, then continue."
                : "Windows controls mic and speakers in Settings. Bunny will open the right pages — enable access for desktop apps, then continue."}
            </p>
            <div className={styles.modelRow}>
              <button
                className={`${styles.btn} ${styles.btnGhost}`}
                onClick={() => void invoke("open_mic_privacy_settings")}
                aria-label="Open microphone privacy settings"
              >
                Microphone…
              </button>
              <button
                className={`${styles.btn} ${styles.btnGhost}`}
                onClick={() => void invoke("open_sound_settings")}
                aria-label="Open sound settings"
              >
                Speakers…
              </button>
            </div>
            <button
              className={`${styles.btn} ${styles.btnPrimary}`}
              onClick={() => void checkOllama()}
              disabled={busy}
              aria-label="Continue to Ollama check"
            >
              Continue
            </button>
          </>
        )}

        {step === "ollama" && (
          <p className={styles.idleHint}>Checking Ollama…</p>
        )}

        {step === "done" && (
          <>
            <p className={styles.idleHint}>
              {ollamaOk
                ? "Ollama is reachable. You’re ready."
                : "Ollama is not running yet. Install it from ollama.com and use Start Ollama in Chat when ready."}
            </p>
            <p className={styles.idleHint}>
              Hold F9 to talk. Expand the island from the tray for Chat, Memory, and Wake.
            </p>
            <button
              className={`${styles.btn} ${styles.btnPrimary}`}
              onClick={finish}
              aria-label="Finish onboarding"
            >
              Finish
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function stepLabel(step: Step): string {
  switch (step) {
    case "welcome":
      return "1 / 4 Privacy";
    case "scan":
      return "2 / 4 Scan";
    case "permissions":
      return "3 / 4 Permissions";
    case "ollama":
    case "done":
      return "4 / 4 Ready";
  }
}
