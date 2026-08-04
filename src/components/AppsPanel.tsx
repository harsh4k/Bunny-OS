/**
 * AppsPanel — light catalog with Home-matching page chrome.
 * Persists under BunnyOS/user_apps.json (shared with voice open_app).
 * Icons browse in a macOS-style magnifying dock (left → right).
 */
import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { friendlyError, invokeErrorMessage } from "../lib/voiceStatus";
import { DropdownMenu } from "./ui/dropdown-menu";
import { DockNav, type DockNavItem } from "./ui/dock-nav";
import appsAtmosphere from "../assets/apps-atmosphere.png";
import { PageHero } from "./PageHero";
import chrome from "./PageChrome.module.css";
import { Plus, RefreshCw, Tag } from "lucide-react";
import styles from "./AppsPanel.module.css";

interface AppRow {
  id: string | null;
  name: string;
  source: string;
  path: string;
  removable: boolean;
}

type Composer = "none" | "nickname" | "custom";

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
      return "Installed";
    default:
      return source;
  }
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function tint(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360} 48% 46%)`;
}

export function AppsPanel({ onClose }: Props) {
  const [apps, setApps] = useState<AppRow[]>([]);
  const [iconUrls, setIconUrls] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [composer, setComposer] = useState<Composer>("none");
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
          `${rows.filter((r) => r.source !== "alias").length} apps saved locally`,
        );
      }
    } catch (err) {
      setError(friendlyError(invokeErrorMessage(err)));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load(false);
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    for (const app of apps) {
      if (!app.path || app.source === "alias") continue;
      void invoke<string | null>("get_app_icon", { path: app.path }).then((filePath) => {
        if (cancelled || !filePath) return;
        const url = convertFileSrc(filePath);
        setIconUrls((prev) =>
          prev[app.path] ? prev : { ...prev, [app.path]: url },
        );
      });
    }
    return () => {
      cancelled = true;
    };
  }, [apps]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return apps;
    return apps.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        sourceLabel(a.source).toLowerCase().includes(q),
    );
  }, [apps, filter]);

  const nicknames = apps.filter((a) => a.source === "alias").length;
  const onPc = apps.filter((a) => a.source !== "alias").length;

  const remove = useCallback(
    async (id: string) => {
      setBusy(true);
      setError(null);
      try {
        await invoke("remove_user_app", { id });
        await load(false);
      } catch (err) {
        setError(friendlyError(invokeErrorMessage(err)));
      } finally {
        setBusy(false);
      }
    },
    [load],
  );

  const dockItems: DockNavItem[] = useMemo(
    () =>
      filtered.map((app) => {
        const iconSrc = app.path ? iconUrls[app.path] : undefined;
        return {
          id: `${app.source}:${app.id ?? app.name}`,
          label: app.name,
          alt: `${app.name} — ${sourceLabel(app.source)}`,
          iconSrc,
          icon: iconSrc ? undefined : (
            <span
              className={styles.appGlyph}
              style={{ background: tint(app.name) }}
              aria-hidden="true"
            >
              {initials(app.name)}
            </span>
          ),
          onRemove:
            app.removable && app.id
              ? () => {
                  void remove(app.id!);
                }
              : undefined,
        };
      }),
    [filtered, iconUrls, remove],
  );

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
      setComposer("none");
      setNote("Nickname saved");
      await load(false);
    } catch (err) {
      setError(friendlyError(invokeErrorMessage(err)));
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
      setComposer("none");
      setNote("App saved");
      await load(false);
    } catch (err) {
      const msg = invokeErrorMessage(err);
      if (!/no file selected/i.test(msg)) setError(friendlyError(msg));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.root} role="dialog" aria-label="Apps">
      <PageHero
        tone="mint"
        atmosphere={appsAtmosphere}
        eyebrow="On this PC"
        title="Apps"
        lede="Say open + name. Catalog stays local."
        statusLabel={busy ? "Scanning" : "Ready"}
        statusTone={busy ? "warn" : apps.length > 0 ? "ok" : "off"}
        statusMeta={`${apps.length} saved`}
        onClose={onClose}
        closeLabel="Close apps"
        actions={
          <button
            type="button"
            className={chrome.btnGlass}
            disabled={busy}
            onClick={() => void load(true)}
          >
            {busy ? "…" : "Rescan"}
          </button>
        }
      />

      <section className={chrome.metrics} data-cols="3" aria-label="Catalog summary">
        <div className={chrome.metric} data-tone={onPc > 0 ? "ok" : "off"}>
          <span className={chrome.metricLabel}>On PC</span>
          <span className={chrome.metricValue}>{onPc}</span>
        </div>
        <div className={chrome.metric} data-tone={nicknames > 0 ? "ok" : "off"}>
          <span className={chrome.metricLabel}>Nicknames</span>
          <span className={chrome.metricValue}>{nicknames}</span>
        </div>
        <div className={chrome.metric} data-tone={filter ? "warn" : "off"}>
          <span className={chrome.metricLabel}>Showing</span>
          <span className={chrome.metricValue}>{filtered.length}</span>
        </div>
      </section>

      <div className={styles.toolbar}>
        <label className={styles.search} htmlFor={filterId}>
          <span className={styles.srOnly}>Search apps</span>
          <input
            id={filterId}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter apps…"
            disabled={busy}
          />
        </label>
      </div>

      {composer !== "none" && (
        <div className={`${styles.composer} ${chrome.card}`} data-tone="mint" data-mode={composer}>
          {composer === "nickname" ? (
            <>
              <div className={styles.composerGrid}>
                <label className={styles.field} htmlFor={aliasId}>
                  Say
                  <input
                    id={aliasId}
                    value={aliasName}
                    onChange={(e) => setAliasName(e.target.value)}
                    placeholder="chrome"
                    disabled={busy}
                    autoFocus
                  />
                </label>
                <label className={styles.field} htmlFor={targetId}>
                  Opens
                  <input
                    id={targetId}
                    value={aliasTarget}
                    onChange={(e) => setAliasTarget(e.target.value)}
                    placeholder="Google Chrome"
                    disabled={busy}
                  />
                </label>
              </div>
              <div className={styles.composerRow}>
                <button
                  type="button"
                  className={chrome.btnInk}
                  disabled={busy || !aliasName.trim() || !aliasTarget.trim()}
                  onClick={() => void addAlias()}
                >
                  Save nickname
                </button>
                <button
                  type="button"
                  className={chrome.btnGhost}
                  onClick={() => setComposer("none")}
                >
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <>
              <label className={styles.field} htmlFor={customId}>
                Voice name
                <input
                  id={customId}
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder="Notion"
                  disabled={busy}
                  autoFocus
                />
              </label>
              <div className={styles.composerRow}>
                <button
                  type="button"
                  className={chrome.btnInk}
                  disabled={busy || !customName.trim()}
                  onClick={() => void addCustom()}
                >
                  Choose file…
                </button>
                <button
                  type="button"
                  className={chrome.btnGhost}
                  onClick={() => setComposer("none")}
                >
                  Cancel
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {(error || note) && (
        <p
          className={error ? styles.bannerError : styles.banner}
          role={error ? "alert" : "status"}
        >
          {error ?? note}
        </p>
      )}

      <section className={styles.dockStage} aria-label="App icons">
        {filtered.length === 0 ? (
          <div className={`${styles.empty} ${chrome.card}`} data-tone="mint">
            <p className={styles.emptyTitle}>
              {apps.length === 0 ? "No apps yet" : "No matches"}
            </p>
            <p className={styles.emptyHint}>
              {apps.length === 0
                ? "Scan Start Menu / Applications so Bunny can open them by voice."
                : `Nothing matches “${filter.trim()}”.`}
            </p>
            {apps.length === 0 && (
              <button
                type="button"
                className={chrome.btnInk}
                disabled={busy}
                onClick={() => void load(true)}
              >
                Rescan this PC
              </button>
            )}
          </div>
        ) : (
          <div className={styles.dockTray}>
            <DockNav
              align="center"
              items={dockItems}
              aria-label="Apps dock"
            />
          </div>
        )}
      </section>

      <footer className={styles.dock}>
        <p className={styles.dockHint}>
          Say <kbd className={styles.kbd}>open</kbd> or hold to speak
        </p>
        <DropdownMenu
          tone="dark"
          align="end"
          side="top"
          disabled={busy}
          aria-label="Apps dock menu"
          options={[
            {
              label: "Nickname",
              Icon: <Tag className={styles.dockIcon} />,
              onClick: () => setComposer("nickname"),
            },
            {
              label: "Add app",
              Icon: <Plus className={styles.dockIcon} />,
              onClick: () => setComposer("custom"),
            },
            {
              label: "Rescan",
              Icon: <RefreshCw className={styles.dockIcon} />,
              disabled: busy,
              onClick: () => void load(true),
            },
          ]}
        >
          Options
        </DropdownMenu>
      </footer>
    </div>
  );
}
