/**
 * UpdatesPanel — status board for Bunny, Ollama, and chat models.
 * Primary path: download Windows MSI / Mac DMG from GitHub Releases.
 */
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  RELEASES_PAGE,
  OLLAMA_DOWNLOAD_PAGE,
  WIN_MSI,
  MAC_DMG,
} from "../lib/updateLinks";
import updatesAtmosphere from "../assets/updates-atmosphere.png";
import { PageHero, type StatusTone } from "./PageHero";
import chrome from "./PageChrome.module.css";
import styles from "./ChatPanel.module.css";

interface UpdateCheck {
  current: string;
  latest: string | null;
  newer: boolean;
  message: string;
  win_msi_url?: string | null;
  mac_dmg_url?: string | null;
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

function rowTone(needsAttention?: boolean): StatusTone {
  return needsAttention ? "warn" : "ok";
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

  const openUrl = (url: string) =>
    run(async () => {
      await invoke("open_trusted_https", { url });
    });

  const winUrl = check?.win_msi_url || WIN_MSI;
  const macUrl = check?.mac_dmg_url || MAC_DMG;

  const statusLabel = check
    ? check.newer
      ? "Update available"
      : "Up to date"
    : "…";
  const statusTone: StatusTone = !check
    ? "off"
    : check.newer
      ? "warn"
      : "ok";

  return (
    <div className={styles.overlay} role="dialog" aria-label="Updates">
      <PageHero
        tone="sky"
        atmosphere={updatesAtmosphere}
        eyebrow="Installers"
        title="Updates"
        lede="Download a newer Bunny MSI or DMG here. Ollama updates separately from its own site."
        statusLabel={statusLabel}
        statusTone={statusTone}
        statusMeta={board?.bunny_version}
        onClose={onClose}
        closeLabel="Close updates"
        actions={
          <button
            type="button"
            className={chrome.btnGlass}
            disabled={busy}
            onClick={() =>
              void run(async () => {
                setCheck(await invoke<UpdateCheck>("check_github_release"));
              })
            }
          >
            {busy ? "Checking…" : "Check for update"}
          </button>
        }
      />

      <section className={chrome.metrics} data-cols="3" aria-label="Dependency summary">
        <div className={chrome.metric} data-tone="ok">
          <span className={chrome.metricLabel}>Bunny</span>
          <span className={chrome.metricValue}>{board?.bunny_version ?? "…"}</span>
        </div>
        <div className={chrome.metric} data-tone={rowTone(board?.ollama.needs_attention)}>
          <span className={chrome.metricLabel}>Ollama</span>
          <span className={chrome.metricValue}>{board?.ollama.state ?? "…"}</span>
        </div>
        <div className={chrome.metric} data-tone={rowTone(board?.models.needs_attention)}>
          <span className={chrome.metricLabel}>Models</span>
          <span className={chrome.metricValue}>{board?.models.state ?? "…"}</span>
        </div>
      </section>

      <div className={styles.body}>
        <div
          className={`${styles.actionCard} ${chrome.card}`}
          data-tone="sky"
          data-testid="row-bunny"
        >
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
          <div className={styles.btnRow} style={{ justifyContent: "flex-start" }}>
            <button
              type="button"
              className={chrome.btnInk}
              disabled={busy}
              data-testid="download-windows"
              onClick={() => void openUrl(winUrl)}
            >
              Download Windows
            </button>
            <button
              type="button"
              className={chrome.btnInk}
              disabled={busy}
              data-testid="download-mac"
              onClick={() => void openUrl(macUrl)}
            >
              Download Mac
            </button>
          </div>
          <div className={styles.btnRow} style={{ justifyContent: "flex-start" }}>
            <button
              type="button"
              className={chrome.btnGhost}
              disabled={busy}
              onClick={() => void openUrl(RELEASES_PAGE)}
            >
              All releases
            </button>
          </div>
        </div>

        <StatusCard testId="row-ollama" row={board?.ollama} fallbackTitle="Ollama">
          <div className={styles.btnRow} style={{ justifyContent: "flex-start" }}>
            <button
              type="button"
              className={chrome.btnInk}
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  setActionNote(await invoke<string>("ensure_ollama"));
                  await refreshBoard();
                })
              }
            >
              Install / start
            </button>
            <button
              type="button"
              className={chrome.btnGhost}
              disabled={busy}
              onClick={() => void openUrl(OLLAMA_DOWNLOAD_PAGE)}
            >
              Ollama site
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

        <div
          className={`${styles.actionCard} ${chrome.card}`}
          data-tone="sky"
          data-testid="row-voice"
        >
          <p className={styles.fieldLabel}>Voice (sidecar + Whisper)</p>
          <p className={styles.idleHint}>
            Ships with Bunny — updates when you install a newer release above.
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
      className={`${styles.actionCard} ${chrome.card}`}
      data-tone="sky"
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
