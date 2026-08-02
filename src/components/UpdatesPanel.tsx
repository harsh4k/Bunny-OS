/**
 * UpdatesPanel — status board for Bunny, Ollama, and chat models.
 */
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { RELEASES_PAGE, OLLAMA_DOWNLOAD_PAGE } from "../lib/updateLinks";
import styles from "./ChatPanel.module.css";

interface UpdateCheck {
  current: string;
  latest: string | null;
  newer: boolean;
  message: string;
}

interface ComponentRow {
  title: string;
  state: string;
  detail: string;
  needs_attention: boolean;
}

interface ModelsRow extends ComponentRow {
  recommended: string;
  recommended_present: boolean;
  installed: string[];
}

interface DependencyBoard {
  bunny_version: string;
  ollama: ComponentRow;
  models: ModelsRow;
}

interface Props {
  onClose: () => void;
}

export function UpdatesPanel({ onClose }: Props) {
  const [board, setBoard] = useState<DependencyBoard | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionNote, setActionNote] = useState<string | null>(null);
  const [check, setCheck] = useState<UpdateCheck | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshBoard = useCallback(async () => {
    try {
      setBoard(await invoke<DependencyBoard>("get_dependency_board"));
    } catch (err) {
      setError(String(err));
    }
  }, []);

  useEffect(() => {
    void refreshBoard();
  }, [refreshBoard]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.overlay} role="dialog" aria-label="Updates">
      <div className={styles.header}>
        <span className={styles.title}>Updates</span>
        <button className={styles.closeBtn} onClick={onClose} aria-label="Close updates">
          ×
        </button>
      </div>
      <div className={styles.body}>
        <p className={styles.idleHint}>
          Status of Bunny and its local dependencies. Nothing updates silently —
          use the buttons when something needs attention.
        </p>

        <div className={styles.btnRow}>
          <button
            className={`${styles.btn} ${styles.btnSecondary}`}
            disabled={busy}
            onClick={() => void run(refreshBoard)}
          >
            Refresh status
          </button>
        </div>

        <div className={styles.actionCard} data-testid="row-bunny">
          <p className={styles.fieldLabel}>Bunny OS</p>
          <p className={styles.idleHint} data-testid="installed-version">
            Installed {board?.bunny_version ?? "…"}
            {check?.newer ? " · update available" : ""}
          </p>
          {check && (
            <p className={styles.idleHint} data-testid="update-check-result">
              {check.newer ? "Update available — " : "Up to date — "}
              {check.message}
            </p>
          )}
          <div className={styles.btnRow}>
            <button
              className={`${styles.btn} ${styles.btnPrimary}`}
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  setCheck(await invoke<UpdateCheck>("check_github_release"));
                })
              }
            >
              {busy ? "Checking…" : "Compare with latest"}
            </button>
            <button
              className={`${styles.btn} ${styles.btnSecondary}`}
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await invoke("open_trusted_https", { url: RELEASES_PAGE });
                })
              }
            >
              Open Releases
            </button>
          </div>
        </div>

        <StatusCard testId="row-ollama" row={board?.ollama} fallbackTitle="Ollama">
          <div className={styles.btnRow}>
            <button
              className={`${styles.btn} ${styles.btnPrimary}`}
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  setActionNote(await invoke<string>("ensure_ollama"));
                  await refreshBoard();
                })
              }
            >
              Install / start & refresh models
            </button>
            <button
              className={`${styles.btn} ${styles.btnSecondary}`}
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await invoke("open_trusted_https", { url: OLLAMA_DOWNLOAD_PAGE });
                })
              }
            >
              Open Ollama download
            </button>
          </div>
        </StatusCard>

        <StatusCard testId="row-models" row={board?.models} fallbackTitle="Chat models">
          {board?.models.installed && board.models.installed.length > 0 && (
            <ul className={styles.auditList} aria-label="Installed chat models">
              {board.models.installed.map((name) => (
                <li key={name} className={styles.auditRow}>
                  <span className={styles.auditLabel}>{name}</span>
                </li>
              ))}
            </ul>
          )}
          <p className={styles.idleHint}>
            Recommended: {board?.models.recommended ?? "llama3.2:1b"}
            {board?.models.recommended_present ? " (present)" : " (missing)"}
          </p>
        </StatusCard>

        <div className={styles.actionCard} data-testid="row-voice">
          <p className={styles.fieldLabel}>Voice (sidecar + Whisper)</p>
          <p className={styles.idleHint}>
            Bundled with Bunny OS — updates when you install a newer Bunny release.
          </p>
        </div>

        {actionNote && (
          <div className={styles.idleHint} role="status">
            {actionNote}
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

function StatusCard({
  testId,
  row,
  fallbackTitle,
  children,
}: {
  testId: string;
  row?: ComponentRow | null;
  fallbackTitle: string;
  children?: ReactNode;
}) {
  const attn = row?.needs_attention;
  return (
    <div
      className={styles.actionCard}
      data-testid={testId}
      data-needs-attention={attn ? "true" : "false"}
    >
      <p className={styles.fieldLabel}>
        {row?.title ?? fallbackTitle}
        {attn ? " · needs attention" : ""}
      </p>
      <p className={styles.idleHint}>
        <strong>{row?.state ?? "…"}</strong>
        {row?.detail ? ` — ${row.detail}` : ""}
      </p>
      {children}
    </div>
  );
}
