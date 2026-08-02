/**
 * UpdatesPanel — installed version + manual update help + optional GitHub compare.
 */
import { useCallback, useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import styles from "./ChatPanel.module.css";

interface UpdateCheck {
  current: string;
  latest: string | null;
  newer: boolean;
  release_url: string;
  html_url: string | null;
  message: string;
}

interface Props {
  onClose: () => void;
}

export function UpdatesPanel({ onClose }: Props) {
  const [version, setVersion] = useState<string>("…");
  const [busy, setBusy] = useState(false);
  const [check, setCheck] = useState<UpdateCheck | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void getVersion()
      .then(setVersion)
      .catch(() => setVersion("unknown"));
  }, []);

  const openReleases = useCallback(async () => {
    setError(null);
    try {
      await invoke("open_releases_page");
    } catch (err) {
      setError(String(err));
    }
  }, []);

  const compare = useCallback(async () => {
    setBusy(true);
    setError(null);
    setCheck(null);
    try {
      const result = await invoke<UpdateCheck>("check_github_release");
      setCheck(result);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }, []);

  return (
    <div className={styles.overlay} role="dialog" aria-label="Updates">
      <div className={styles.header}>
        <span className={styles.title}>Updates</span>
        <button className={styles.closeBtn} onClick={onClose} aria-label="Close updates">
          ×
        </button>
      </div>
      <div className={styles.body}>
        <p className={styles.fieldLabel}>Installed version</p>
        <p className={styles.idleHint} data-testid="installed-version">
          Bunny OS {version}
        </p>

        <p className={styles.fieldLabel}>How updates work</p>
        <p className={styles.idleHint}>
          There is no silent auto-update yet. Download the new installer from GitHub
          Releases (or re-run the install script), install over this build, and verify
          SHA256 when published. Your local data under the BunnyOS app-data folder is
          kept.
        </p>

        <div className={styles.btnRow}>
          <button
            className={`${styles.btn} ${styles.btnPrimary}`}
            disabled={busy}
            onClick={() => void compare()}
          >
            {busy ? "Checking…" : "Compare with latest"}
          </button>
          <button
            className={`${styles.btn} ${styles.btnSecondary}`}
            disabled={busy}
            onClick={() => void openReleases()}
          >
            Open Releases
          </button>
        </div>

        {check && (
          <div
            className={styles.actionCard}
            role="status"
            data-testid="update-check-result"
          >
            <p className={styles.fieldLabel}>
              {check.newer ? "Update available" : "Up to date"}
            </p>
            <p className={styles.idleHint}>{check.message}</p>
            {check.latest && (
              <p className={styles.idleHint}>
                Latest tag: {check.latest}
                {check.current ? ` · Installed: ${check.current}` : ""}
              </p>
            )}
          </div>
        )}

        {error && (
          <div className={styles.errorState} role="alert">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
