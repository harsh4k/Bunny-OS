/**
 * First-run privacy notice. Mic starts muted; Ollama is external; memory is opt-in.
 * Dismissal is stored in localStorage only (no cloud).
 */
import { useEffect, useState } from "react";
import styles from "./ChatPanel.module.css";

const KEY = "bunnyos.firstRunAck.v1";

interface Props {
  onDismiss?: () => void;
}

export function FirstRunNotice({ onDismiss }: Props) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(KEY) !== "1") setVisible(true);
    } catch {
      setVisible(true);
    }
  }, []);

  if (!visible) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      /* ignore quota / private mode */
    }
    setVisible(false);
    onDismiss?.();
  };

  return (
    <div className={styles.overlay} role="dialog" aria-label="First-run privacy notice">
      <div className={styles.header}>
        <span className={styles.title}>Welcome to Bunny OS</span>
      </div>
      <div className={styles.body}>
        <p className={styles.idleHint}>
          Local-only assistant. Nothing is sent to a cloud service.
        </p>
        <ul className={styles.idleHint}>
          <li>
            Hold F9 to talk — that temporarily unmutes the mic. Use Mute in Overview
            to keep it off.
          </li>
          <li>
            Windows controls mic access in Settings → Privacy → Microphone (desktop
            apps don’t show a browser-style prompt).
          </li>
          <li>Ollama must already be installed and running locally.</li>
          <li>Model downloads require an explicit click.</li>
          <li>Memory is reviewable and can be turned Off anytime.</li>
          <li>Voice never approves app/URL actions — confirm in the UI.</li>
        </ul>
        <button
          className={`${styles.btn} ${styles.btnPrimary}`}
          onClick={dismiss}
          aria-label="Acknowledge first-run notice"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
