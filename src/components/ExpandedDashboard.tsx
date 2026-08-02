import type { PanelView } from "./CompactPanel";
import { CompactPanel } from "./CompactPanel";
import {
  IconChat,
  IconCollapse,
  IconHome,
  IconMemory,
  IconModels,
  IconShield,
  IconUpdates,
  IconWave,
} from "./icons";
import { invoke } from "@tauri-apps/api/core";
import styles from "./ExpandedDashboard.module.css";

interface Props {
  activeView: PanelView;
  onViewChange: (view: PanelView) => void;
  onCollapse: () => void;
  onClose?: () => void;
  micMuted: boolean;
  onMicMutedChange: (muted: boolean) => void;
  onOnboardingDone?: () => void;
}

const NAV_ITEMS: Array<{
  view: PanelView;
  label: string;
  Icon: typeof IconHome;
}> = [
  { view: "overview", label: "Overview", Icon: IconHome },
  { view: "chat", label: "Conversation", Icon: IconChat },
  { view: "advisor", label: "Models", Icon: IconModels },
  { view: "wake", label: "Voice & wake", Icon: IconWave },
  { view: "memory", label: "Memory", Icon: IconMemory },
  { view: "updates", label: "Updates", Icon: IconUpdates },
];

export function ExpandedDashboard({
  activeView,
  onViewChange,
  onCollapse,
  onClose,
  micMuted,
  onMicMutedChange,
  onOnboardingDone,
}: Props) {
  return (
    <main className={styles.shell} aria-label="Bunny OS dashboard">
      <aside className={styles.sidebar}>
        <div className={styles.brand} data-tauri-drag-region="">
          <span className={styles.mark} aria-hidden="true">
            B
          </span>
          <div className={styles.brandText}>
            <span className={styles.brandName}>Bunny OS</span>
            <span className={styles.brandTag}>Local assistant</span>
          </div>
        </div>

        <nav className={styles.nav} aria-label="Bunny settings">
          {NAV_ITEMS.map(({ view, label, Icon }) => (
            <button
              key={view}
              type="button"
              className={styles.navItem}
              data-active={activeView === view}
              aria-current={activeView === view ? "page" : undefined}
              onClick={() => onViewChange(view)}
            >
              <Icon size={17} className={styles.navIcon} />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <div className={styles.privacy}>
          <IconShield size={16} className={styles.privacyIcon} />
          <div>
            <strong>Local & private</strong>
            <span>No telemetry — models stay on this machine</span>
            <span className={styles.legalLinks}>
              <button
                type="button"
                className={styles.legalLink}
                onClick={() =>
                  void invoke("open_trusted_https", {
                    url: "https://harsh4k.github.io/Bunny-OS/privacy/",
                  })
                }
              >
                Privacy
              </button>
              <span aria-hidden="true"> · </span>
              <button
                type="button"
                className={styles.legalLink}
                onClick={() =>
                  void invoke("open_trusted_https", {
                    url: "https://harsh4k.github.io/Bunny-OS/terms/",
                  })
                }
              >
                Terms
              </button>
            </span>
          </div>
        </div>
      </aside>

      <section className={styles.workspace}>
        <header className={styles.windowBar} data-tauri-drag-region="">
          <div className={styles.windowActions}>
            <button type="button" onClick={onClose} aria-label="Hide Bunny OS" />
            <button
              type="button"
              onClick={onCollapse}
              aria-label="Collapse to voice pill"
            />
            <span aria-hidden="true" />
          </div>
          <button type="button" className={styles.collapse} onClick={onCollapse}>
            <IconCollapse size={16} />
            Collapse
          </button>
        </header>

        <div className={styles.content}>
          <CompactPanel
            embedded
            activeView={activeView}
            onViewChange={onViewChange}
            onClose={onClose}
            micMuted={micMuted}
            onMicMutedChange={onMicMutedChange}
            onOnboardingDone={onOnboardingDone}
          />
        </div>
      </section>
    </main>
  );
}
