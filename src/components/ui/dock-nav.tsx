/**
 * macOS-style magnifying dock — Vite/Tauri port (no Next, no Tailwind).
 * Visual language matches the DockNav reference; styling via CSS modules.
 */
import {
  motion,
  useReducedMotion,
  type Transition,
} from "framer-motion";
import {
  type ComponentPropsWithoutRef,
  type ReactNode,
  useState,
} from "react";
import { cn } from "../../lib/cn";
import styles from "./dock-nav.module.css";

const DOCK_EASE = [0.16, 1, 0.3, 1] as const;
const DOCK_DURATION = 0.5;

const DOCK_WIDTH = {
  base: "4.5rem",
  far: "5.25rem",
  close: "6rem",
  active: "7rem",
} as const;

export interface DockNavItem {
  /** Accessible label for the icon image. */
  alt?: string;
  /** Custom icon node. Used when `iconSrc` is not provided. */
  icon?: ReactNode;
  /** Remote or local image URL for the dock icon. */
  iconSrc?: string;
  /** Visible tooltip label. */
  label: string;
  /** Optional stable id for selection. */
  id?: string;
  /** Optional secondary remove control (shown on hover). */
  onRemove?: () => void;
}

export interface DockNavProps
  extends Omit<ComponentPropsWithoutRef<"nav">, "children"> {
  /** Animation duration in seconds. */
  duration?: number;
  /** Dock entries rendered left to right. */
  items: DockNavItem[];
  /** Alignment of the icon row. */
  align?: "center" | "start" | "end";
  /** Called when an item is activated (click / Enter). */
  onItemSelect?: (item: DockNavItem, index: number) => void;
}

function getItemWidth(index: number, hoveredIndex: number | null) {
  if (hoveredIndex === null) return DOCK_WIDTH.base;
  const distance = Math.abs(index - hoveredIndex);
  if (distance === 0) return DOCK_WIDTH.active;
  if (distance === 1) return DOCK_WIDTH.close;
  if (distance === 2) return DOCK_WIDTH.far;
  return DOCK_WIDTH.base;
}

function DockNavItemIcon({
  alt,
  icon,
  iconSrc,
  label,
}: Pick<DockNavItem, "alt" | "icon" | "iconSrc" | "label">) {
  if (icon) {
    return <span className={styles.icon}>{icon}</span>;
  }

  if (iconSrc) {
    return (
      <img
        alt={alt ?? label}
        className={styles.iconImg}
        src={iconSrc}
        width={64}
        height={64}
        draggable={false}
      />
    );
  }

  return null;
}

export function DockNav({
  align = "center",
  className,
  duration = DOCK_DURATION,
  items,
  onItemSelect,
  ...props
}: DockNavProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const prefersReducedMotion = useReducedMotion();

  const transition: Transition = prefersReducedMotion
    ? { duration: 0 }
    : {
        duration,
        ease: DOCK_EASE,
      };

  return (
    <nav
      className={cn(styles.nav, className)}
      data-align={align}
      {...props}
    >
      <ul className={styles.list} data-align={align}>
        {items.map((item, index) => {
          const isHovered = hoveredIndex === index;
          const itemKey = `${item.id ?? item.label}-${index}`;

          return (
            <motion.li
              animate={{ width: getItemWidth(index, hoveredIndex) }}
              className={styles.item}
              initial={false}
              key={itemKey}
              onMouseEnter={() => setHoveredIndex(index)}
              onMouseLeave={() => setHoveredIndex(null)}
              transition={transition}
            >
              <button
                type="button"
                className={styles.link}
                aria-label={item.label}
                onClick={() => onItemSelect?.(item, index)}
              >
                <DockNavItemIcon
                  alt={item.alt}
                  icon={item.icon}
                  iconSrc={item.iconSrc}
                  label={item.label}
                />
              </button>
              {item.onRemove ? (
                <button
                  type="button"
                  className={styles.remove}
                  data-visible={isHovered ? "true" : "false"}
                  aria-label={`Remove ${item.label}`}
                  tabIndex={isHovered ? 0 : -1}
                  onClick={(event) => {
                    event.stopPropagation();
                    item.onRemove?.();
                  }}
                >
                  ×
                </button>
              ) : null}
              <motion.div
                animate={{
                  opacity: isHovered ? 1 : 0,
                  y: isHovered ? "-140%" : "-80%",
                }}
                className={styles.tooltip}
                initial={false}
                transition={transition}
                aria-hidden={!isHovered}
              >
                <div>{item.label}</div>
              </motion.div>
            </motion.li>
          );
        })}
      </ul>
    </nav>
  );
}

export default DockNav;
