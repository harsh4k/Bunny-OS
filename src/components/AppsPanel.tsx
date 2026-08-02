/**
 * AppsPanel — browsable Start Menu / Applications catalog + user adds.
 * Persisted under BunnyOS/user_apps.json (shared with voice open_app).
 */
import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import styles from "./ChatPanel.module.css";

interface AppRow {
  id: string | null;
  name: string;
  source: string;
  path: string;
  removable: boolean;
}

interface Props {
  onClose: () => void;
}

function sourceLabel(source: string): string {
  switch (source) {
    case "user":
      return "Added by you";
    case "alias":
      return "Nickname";
    case "applications":
      return "Applications";
    case "start_menu":
      return "Start Menu";
    case "registry":
      return "Installed (name only)";
    default:
      return source;
  }
}

export function AppsPanel({ onClose }: Props) {
  const [apps, setApps] = useState<AppRow[]>([]);
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [aliasName, setAliasName] = useState("");
  const [aliasTarget, setAliasTarget] = useState("");
  const [customName, setCustomName] = useState("");
  const filterId = useId();
  const aliasId = useId();
  const targetId = useId();
  const customId = useId();

  const load = useCallback(async (rescan: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const rows = await invoke<AppRow[]>(rescan ? "rescan_apps" : "list_apps");
      setApps(rows);
      if (rescan) {
        setNote(
          `Saved ${rows.filter((r) => r.source !== "alias").length} apps locally.`,
        );
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load(false);
  }, [load]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return apps;
    return apps.filter(
      (a) =>
        a.name.toLowerCase().includes(q) || a.source.toLowerCase().includes(q),
    );
  }, [apps, filter]);

  const addAlias = async () => {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      await invoke("add_app_alias", {
        alias: aliasName.trim(),
        target: aliasTarget.trim(),
      });
      setAliasName("");
      setAliasTarget("");
      setNote("Nickname saved.");
      await load(false);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  };

  const addCustom = async () => {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      await invoke("pick_and_add_app", { name: customName.trim() });
      setCustomName("");
      setNote("App saved. Say “open …” with that name.");
      await load(false);
    } catch (err) {
      const msg = String(err);
      if (!/no file selected/i.test(msg)) setError(msg);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      await invoke("remove_user_app", { id });
      await load(false);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.overlay} role="dialog" aria-label="Apps">
      <div className={styles.header}>
        <span className={styles.title}>Apps</span>
        <button className={styles.closeBtn} onClick={onClose} aria-label="Close apps">
          ×
        </button>
      </div>
      <div className={styles.body}>
        <p className={styles.idleHint}>
          Bunny opens apps from your Start Menu (Windows) or Applications (Mac).
          Scans are saved on this PC. Missing something? Add a nickname or pick a
          shortcut / program below.
        </p>

        <div className={styles.btnRow}>
          <button
            className={`${styles.btn} ${styles.btnSecondary}`}
            disabled={busy}
            onClick={() => void load(true)}
          >
            {busy ? "Working…" : "Rescan & save"}
          </button>
        </div>

        <label className={styles.fieldLabel} htmlFor={filterId}>
          Search
          <input
            id={filterId}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter by name…"
            disabled={busy}
          />
        </label>

        <div className={styles.actionCard}>
          <p className={styles.fieldLabel}>Add nickname</p>
          <p className={styles.idleHint}>
            Map a short name to a scanned app (e.g. chrome → Google Chrome).
          </p>
          <label className={styles.fieldLabel} htmlFor={aliasId}>
            Say / type
            <input
              id={aliasId}
              value={aliasName}
              onChange={(e) => setAliasName(e.target.value)}
              placeholder="chrome"
              disabled={busy}
            />
          </label>
          <label className={styles.fieldLabel} htmlFor={targetId}>
            Opens
            <input
              id={targetId}
              value={aliasTarget}
              onChange={(e) => setAliasTarget(e.target.value)}
              placeholder="Google Chrome"
              disabled={busy}
            />
          </label>
          <div className={styles.btnRow}>
            <button
              className={`${styles.btn} ${styles.btnPrimary}`}
              disabled={busy || !aliasName.trim() || !aliasTarget.trim()}
              onClick={() => void addAlias()}
            >
              Save nickname
            </button>
          </div>
        </div>

        <div className={styles.actionCard}>
          <p className={styles.fieldLabel}>Add app</p>
          <p className={styles.idleHint}>
            Pick a .lnk / .exe (Windows) or .app (Mac), then give it a voice name.
          </p>
          <label className={styles.fieldLabel} htmlFor={customId}>
            Name
            <input
              id={customId}
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              placeholder="Notion"
              disabled={busy}
            />
          </label>
          <div className={styles.btnRow}>
            <button
              className={`${styles.btn} ${styles.btnPrimary}`}
              disabled={busy || !customName.trim()}
              onClick={() => void addCustom()}
            >
              Choose file…
            </button>
          </div>
        </div>

        {error && (
          <div className={styles.errorState} role="alert">
            <p className={styles.errorMsg}>{error}</p>
          </div>
        )}
        {note && <p className={styles.idleHint}>{note}</p>}

        <p className={styles.fieldLabel}>
          Catalog ({filtered.length}
          {filter.trim() ? ` of ${apps.length}` : ""})
        </p>
        <ul className={styles.auditList} aria-label="Saved apps">
          {filtered.map((app) => (
            <li
              key={`${app.source}:${app.id ?? app.name}`}
              className={styles.auditRow}
            >
              <span className={styles.auditLabel}>
                {app.name}
                <br />
                <span className={styles.idleHint}>{sourceLabel(app.source)}</span>
              </span>
              {app.removable && app.id ? (
                <button
                  type="button"
                  className={`${styles.btn} ${styles.btnSecondary} ${styles.btnCompact}`}
                  disabled={busy}
                  onClick={() => void remove(app.id!)}
                >
                  Remove
                </button>
              ) : null}
            </li>
          ))}
          {filtered.length === 0 && (
            <li className={styles.idleHint}>No apps yet — tap Rescan &amp; save.</li>
          )}
        </ul>
      </div>
    </div>
  );
}
