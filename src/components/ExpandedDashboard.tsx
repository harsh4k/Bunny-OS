import type { PanelView } from "./CompactPanel";
import { CompactPanel } from "./CompactPanel";
import { FirstRunNotice } from "./FirstRunNotice";
import {
  IconApps,
  IconCollapse,
  IconHome,
  IconMemory,
  IconModels,
  IconUpdates,
  IconWave,
} from "./icons";
import bunnyMark from "../assets/bunny-mark.png";
import { invoke } from "@tauri-apps/api/core";
import type { ShellMotion } from "../lib/shellMotion";
import styles from "./ExpandedDashboard.module.css";

interface Props {
  motion?: ShellMotion;
  onMotionEnd?: (phase: ShellMotion) => void;
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
  { view: "overview", label: "Home", Icon: IconHome },
  { view: "apps", label: "Apps", Icon: IconApps },
  { view: "advisor", label: "Models", Icon: IconModels },
  { view: "wake", label: "Voice", Icon: IconWave },
  { view: "learning", label: "Learning", Icon: IconMemory },
  { view: "updates", label: "Updates", Icon: IconUpdates },
];

export function ExpandedDashboard({
  motion = "idle",
  onMotionEnd,
  activeView,
  onViewChange,
  onCollapse,
  onClose,
  micMuted,
  onMicMutedChange,
  onOnboardingDone,
}: Props) {
  const title =
    NAV_ITEMS.find((n) => n.view === activeView)?.label ?? "Bunny OS";

  return (
    <main
      className={styles.shell}
      data-motion={motion}
      aria-label="Bunny OS dashboard"
      onAnimationEnd={(e) => {
        if (e.target !== e.currentTarget) return;
        if (motion === "enter" || motion === "exit") {
          onMotionEnd?.(motion);
        }
      }}
    >
      <FirstRunNotice onDismiss={onOnboardingDone} />
      <aside className={styles.sidebar}>
        <div className={styles.brand} data-tauri-drag-region="">
          <img
            className={styles.mark}
            src={bunnyMark}
            alt=""
            width={28}
            height={28}
          />
          <div className={styles.brandText}>
            <span className={styles.brandName}>Bunny OS</span>
            <span className={styles.brandTag}>Talk to your PC</span>
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
              <Icon size={16} className={styles.navIcon} />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <div className={styles.sideFoot}>
          <p className={styles.sideNote}>Stays on this PC. No Bunny cloud.</p>
          <p className={styles.legalLinks}>
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
          </p>
        </div>
      </aside>

      <section className={styles.workspace}>
        <header className={styles.windowBar} data-tauri-drag-region="">
          <div className={styles.windowLeading}>
            <div className={styles.traffic} aria-hidden="true">
              <button
                type="button"
                className={styles.trafficClose}
                onClick={onClose}
                tabIndex={-1}
                title="Hide"
              />
              <button
                type="button"
                className={styles.trafficCollapse}
                onClick={onCollapse}
                tabIndex={-1}
                title="Collapse"
              />
              <span className={styles.trafficIdle} />
            </div>
            <span className={styles.windowTitle}>{title}</span>
          </div>
          <div className={styles.windowActions}>
            <button
              type="button"
              className={styles.collapse}
              onClick={onCollapse}
              aria-label="Collapse to voice pill"
            >
              <IconCollapse size={14} />
              Collapse
            </button>
            {onClose ? (
              <button
                type="button"
                className={styles.hideBtn}
                onClick={onClose}
                aria-label="Hide Bunny OS"
              >
                Hide
              </button>
            ) : null}
          </div>
        </header>

        <div className={styles.content}>
          <CompactPanel
            embedded
            activeView={activeView}
            onViewChange={onViewChange}
            onClose={onClose}
            micMuted={micMuted}
            onMicMutedChange={onMicMutedChange}
          />
        </div>
      </section>
    </main>
  );
}
