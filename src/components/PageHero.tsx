/**
 * Shared page hero — compact photo stage matching Home.
 */
import type { ReactNode } from "react";
import homeAtmosphere from "../assets/home-atmosphere.png";
import styles from "./PageChrome.module.css";

export type PageTone = "sky" | "sand" | "mint" | "ink";
export type StatusTone = "ok" | "warn" | "off";

interface Props {
  eyebrow: string;
  title: string;
  lede?: string;
  tone?: PageTone;
  /** Unique photo per page — defaults to Home atmosphere only as last resort. */
  atmosphere?: string;
  statusLabel?: string;
  statusTone?: StatusTone;
  statusMeta?: string;
  actions?: ReactNode;
  onClose?: () => void;
  closeLabel?: string;
}

export function PageHero({
  eyebrow,
  title,
  lede,
  tone = "sky",
  atmosphere = homeAtmosphere,
  statusLabel,
  statusTone = "off",
  statusMeta,
  actions,
  onClose,
  closeLabel = "Close",
}: Props) {
  return (
    <header className={styles.hero} data-tone={tone} data-keep-chrome="">
      <div className={styles.heroBezel}>
        <div className={styles.heroInner}>
          <img
            className={styles.heroPhoto}
            src={atmosphere}
            alt=""
            draggable={false}
          />
          <div className={styles.heroShade} aria-hidden="true" />

          <div className={styles.heroTop}>
            <span className={styles.eyebrow}>{eyebrow}</span>
            <div className={styles.heroTopEnd}>
              {statusLabel ? (
                <div
                  className={styles.statusPill}
                  data-tone={statusTone}
                  role="status"
                >
                  <span className={styles.statusDot} aria-hidden="true" />
                  <span className={styles.statusLabel}>{statusLabel}</span>
                  {statusMeta ? (
                    <span className={styles.statusMeta}>· {statusMeta}</span>
                  ) : null}
                </div>
              ) : null}
              {onClose ? (
                <button
                  type="button"
                  className={styles.closeBtn}
                  onClick={onClose}
                  aria-label={closeLabel}
                >
                  ×
                </button>
              ) : null}
            </div>
          </div>

          <div className={styles.heroCopy}>
            <h2 className={styles.title}>{title}</h2>
            {lede ? <p className={styles.lede}>{lede}</p> : null}
          </div>

          {actions ? (
            <div className={styles.heroActions}>{actions}</div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
