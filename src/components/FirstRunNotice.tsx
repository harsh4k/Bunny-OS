/**
 * First-run onboarding: privacy → system scan → permissions → Ollama → done.
 * Dismissal is localStorage only (no cloud).
 */
import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import bunnyMark from "../assets/bunny-mark.png";
import { friendlyError, invokeErrorMessage } from "../lib/voiceStatus";
import styles from "./Onboarding.module.css";

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
  const [ollamaError, setOllamaError] = useState<string | null>(null);
  const [ollamaOk, setOllamaOk] = useState<boolean | null>(null);
  const [ollamaNote, setOllamaNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [acceptedLegal, setAcceptedLegal] = useState(false);

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
      setScanError(friendlyError(invokeErrorMessage(e)));
    } finally {
      setBusy(false);
    }
  }, []);

  const skipScan = useCallback(() => {
    setScanError(null);
    setScan(null);
    setStep("permissions");
  }, []);

  const checkOllama = useCallback(async () => {
    setBusy(true);
    setOllamaError(null);
    setStep("ollama");
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

  const installOllama = useCallback(async () => {
    setBusy(true);
    setStep("ollama");
    setOllamaError(null);
    try {
      setOllamaNote(await invoke<string>("ensure_ollama"));
      setOllamaOk(true);
    } catch (e) {
      setOllamaOk(false);
      setOllamaError(friendlyError(invokeErrorMessage(e)));
    } finally {
      setBusy(false);
      setStep("done");
    }
  }, []);

  if (!visible) return null;

  const tab = tabFor(step);

  return (
    <div className={styles.stage} role="dialog" aria-label="Bunny OS onboarding">
      <div className={styles.top}>
        <span />
        <div className={styles.tabs} aria-label="Setup progress">
          <span className={styles.tab} data-active={tab === "setup"}>
            Setup
          </span>
          <span className={styles.tab} data-active={tab === "voice"}>
            Voice
          </span>
          <span className={styles.tab} data-active={tab === "ready"}>
            Ready
          </span>
        </div>
        <div className={styles.traffic} aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </div>

      <div className={styles.split}>
        <div className={styles.pane}>
          {step === "welcome" && (
            <>
              <div className={styles.markRow}>
                <img className={styles.mark} src={bunnyMark} alt="" width={28} height={28} />
                <p className={styles.kicker}>Welcome to Bunny OS</p>
              </div>
              <h1 className={styles.title}>A helper that stays on this computer</h1>
              <p className={styles.lead}>
                No account. No Bunny cloud. Hold F9 to talk — the mic starts muted.
              </p>
              <ul className={styles.list}>
                <li>Learning and screen reading stay off until you turn them on.</li>
                <li>Bunny asks before typing or clicking in a browser.</li>
                <li>
                  Read{" "}
                  <button
                    type="button"
                    className={styles.link}
                    onClick={() =>
                      void invoke("open_trusted_https", {
                        url: "https://harsh4k.github.io/Bunny-OS/privacy/",
                      })
                    }
                  >
                    Privacy
                  </button>{" "}
                  and{" "}
                  <button
                    type="button"
                    className={styles.link}
                    onClick={() =>
                      void invoke("open_trusted_https", {
                        url: "https://harsh4k.github.io/Bunny-OS/terms/",
                      })
                    }
                  >
                    Terms
                  </button>{" "}
                  before continuing.
                </li>
              </ul>
              <label className={styles.checkRow}>
                <input
                  type="checkbox"
                  checked={acceptedLegal}
                  onChange={(e) => setAcceptedLegal(e.target.checked)}
                />
                <span>I am 18+ and I agree to the Privacy Policy and Terms of Use.</span>
              </label>
              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.continue}
                  disabled={!acceptedLegal}
                  onClick={() => setStep("scan")}
                  aria-label="Continue to system scan"
                >
                  Continue
                </button>
              </div>
            </>
          )}

          {step === "scan" && (
            <>
              <p className={styles.kicker}>Apps on this PC</p>
              <h1 className={styles.title}>Find apps Bunny can open</h1>
              <p className={styles.lead}>
                Read-only scan of Start Menu / Applications. Saved locally — no shell, no cloud.
              </p>
              {scanError ? (
                <p className={styles.error} role="alert">
                  {scanError}
                </p>
              ) : null}
              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.continue}
                  onClick={() => void runScan()}
                  disabled={busy}
                  aria-label="Run system scan"
                >
                  {busy ? "Scanning…" : "Scan this machine"}
                </button>
                {scanError ? (
                  <button
                    type="button"
                    className={styles.ghost}
                    onClick={skipScan}
                    disabled={busy}
                    aria-label="Skip scan for now"
                  >
                    Skip for now
                  </button>
                ) : null}
              </div>
            </>
          )}

          {step === "permissions" && (
            <>
              <p className={styles.kicker}>Core features</p>
              <h1 className={styles.title}>Enable mic & sound</h1>
              <p className={styles.lead}>
                {scan
                  ? `Saved ${scan.app_count} apps on ${scan.os}. Open system settings for Bunny, then continue.`
                  : "You can scan apps later. First, give Bunny mic and speaker access."}
              </p>
              <div className={styles.permCards}>
                <button
                  type="button"
                  className={styles.permCard}
                  onClick={() => void invoke("open_mic_privacy_settings")}
                  aria-label="Open microphone privacy settings"
                >
                  <span className={styles.permCopy}>
                    <span className={styles.permTitle}>Microphone</span>
                    <span className={styles.permHint}>Speech stays on this machine</span>
                  </span>
                  <span className={styles.permGo}>Open</span>
                </button>
                <button
                  type="button"
                  className={styles.permCard}
                  onClick={() => void invoke("open_sound_settings")}
                  aria-label="Open sound settings"
                >
                  <span className={styles.permCopy}>
                    <span className={styles.permTitle}>Speakers</span>
                    <span className={styles.permHint}>So Bunny can talk back</span>
                  </span>
                  <span className={styles.permGo}>Open</span>
                </button>
                {(scan?.os ?? "") === "macOS" ? (
                  <button
                    type="button"
                    className={styles.permCard}
                    onClick={() => void invoke("open_accessibility_settings")}
                    aria-label="Open Accessibility privacy settings"
                  >
                    <span className={styles.permCopy}>
                      <span className={styles.permTitle}>Accessibility</span>
                      <span className={styles.permHint}>Needed for media keys</span>
                    </span>
                    <span className={styles.permGo}>Open</span>
                  </button>
                ) : null}
              </div>
              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.continue}
                  onClick={() => void checkOllama()}
                  disabled={busy}
                  aria-label="Continue to Ollama check"
                >
                  Continue
                </button>
              </div>
            </>
          )}

          {step === "ollama" && (
            <>
              <p className={styles.kicker}>Local chat</p>
              <h1 className={styles.title}>
                {busy ? "Setting up Ollama…" : "Checking Ollama…"}
              </h1>
              <p className={styles.lead}>
                If you already have a chat model, Bunny keeps it. This can take a few minutes.
              </p>
            </>
          )}

          {step === "done" && (
            <>
              <p className={styles.kicker}>You&apos;re ready</p>
              <h1 className={styles.title}>
                {ollamaOk ? "Bunny is ready to talk" : "Almost there"}
              </h1>
              <p className={styles.lead}>
                {ollamaOk
                  ? (ollamaNote ?? "Ollama is ready with a chat model. Hold F9 to talk.")
                  : "Ollama isn’t ready yet. Install it here, or finish and set chat up later."}
              </p>
              {ollamaError ? (
                <p className={styles.error} role="alert">
                  {ollamaError}
                </p>
              ) : null}
              <div className={styles.actions}>
                {!ollamaOk ? (
                  <button
                    type="button"
                    className={styles.continue}
                    onClick={() => void installOllama()}
                    disabled={busy}
                    aria-label="Install and start Ollama"
                  >
                    {busy ? "Installing…" : "Install & start Ollama"}
                  </button>
                ) : null}
                <button
                  type="button"
                  className={ollamaOk ? styles.continue : styles.ghost}
                  onClick={finish}
                  disabled={busy}
                  aria-label="Finish onboarding"
                >
                  {ollamaOk ? "Finish" : "Finish without chat for now"}
                </button>
              </div>
            </>
          )}
        </div>

        <div className={styles.hero} aria-hidden="true">
          <div className={styles.orb}>
            <div className={styles.floatCard}>
              <div className={styles.floatDots}>
                <span />
                <span />
                <span />
              </div>
              <div className={styles.floatLine} />
              <div className={styles.floatLine} />
              <div className={styles.floatLine} />
            </div>
            <div className={styles.island}>
              <span className={styles.islandLabel}>Hey Bunny</span>
              <span className={styles.wave}>
                <i />
                <i />
                <i />
                <i />
                <i />
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function tabFor(step: Step): "setup" | "voice" | "ready" {
  switch (step) {
    case "welcome":
    case "scan":
      return "setup";
    case "permissions":
      return "voice";
    case "ollama":
    case "done":
      return "ready";
  }
}
