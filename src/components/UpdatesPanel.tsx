/**
 * UpdatesPanel — status board for Bunny, Ollama, models, and bundled voice.
 */
import { useCallback, useEffect, useState, type ReactNode } from "react";
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
  voice: ComponentRow;
}

interface Props {
  onClose: () => void;
}

export function UpdatesPanel({ onClose }: Props) {
  const [version, setVersion] = useState<string>("…");
  const [board, setBoard] = useState<DependencyBoard | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionNote, setActionNote] = useState<string | null>(null);
  const [check, setCheck] = useState<UpdateCheck | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshBoard = useCallback(async () => {
    try {
      const next = await invoke<DependencyBoard>("get_dependency_board");
      setBoard(next);
    } catch (err) {
      setError(String(err));
    }
  }, []);

  useEffect(() => {
    void getVersion()
      .then(setVersion)
      .catch(() => setVersion("unknown"));
    void refreshBoard();
  }, [refreshBoard]);

  const openReleases = useCallback(async () => {
    setError(null);
    try {
      await invoke("open_releases_page");
    } catch (err) {
      setError(String(err));
    }
  }, []);

  const openOllamaDownload = useCallback(async () => {
    setError(null);
    try {
      await invoke("open_ollama_download");
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

  const ensureOllama = useCallback(async () => {
    setBusy(true);
    setError(null);
    setActionNote(null);
    try {
      const note = await invoke<string>("ensure_ollama");
      setActionNote(note);
      await refreshBoard();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }, [refreshBoard]);

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
            onClick={() => void refreshBoard()}
          >
            Refresh status
          </button>
        </div>

        {/* Bunny OS */}
        <div className={styles.actionCard} data-testid="row-bunny">
          <p className={styles.fieldLabel}>Bunny OS</p>
          <p className={styles.idleHint} data-testid="installed-version">
            Installed {board?.bunny_version ?? version}
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
        </div>

        {/* Ollama */}
        <StatusCard
          testId="row-ollama"
          row={board?.ollama}
          fallbackTitle="Ollama"
        >
          <div className={styles.btnRow}>
            <button
              className={`${styles.btn} ${styles.btnPrimary}`}
              disabled={busy}
              onClick={() => void ensureOllama()}
            >
              Install / start Ollama
            </button>
            <button
              className={`${styles.btn} ${styles.btnSecondary}`}
              disabled={busy}
              onClick={() => void openOllamaDownload()}
            >
              Open Ollama download
            </button>
          </div>
        </StatusCard>

        {/* Models */}
        <StatusCard
          testId="row-models"
          row={board?.models}
          fallbackTitle="Chat models"
        >
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
          <div className={styles.btnRow}>
            <button
              className={`${styles.btn} ${styles.btnPrimary}`}
              disabled={busy}
              onClick={() => void ensureOllama()}
            >
              Pull / refresh recommended
            </button>
          </div>
        </StatusCard>

        {/* Voice */}
        <StatusCard
          testId="row-voice"
          row={board?.voice}
          fallbackTitle="Voice (sidecar + Whisper)"
        />

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
