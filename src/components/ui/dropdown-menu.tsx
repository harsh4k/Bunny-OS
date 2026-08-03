/**
 * Animated dropdown — portals above overflow parents; flips when near edges.
 * Motion kept short (Emil: dropdowns ~150–250ms, ease-out).
 */
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { cn } from "../../lib/cn";
import styles from "./dropdown-menu.module.css";

export type DropdownOption = {
  label: string;
  onClick: () => void;
  Icon?: ReactNode;
  disabled?: boolean;
};

type Side = "top" | "bottom";

type MenuCoords = {
  top: number;
  left: number;
  width: number;
  side: Side;
};

type DropdownMenuProps = {
  options: DropdownOption[];
  children: ReactNode;
  tone?: "dark" | "light";
  align?: "start" | "end";
  /** Prefer opening direction; auto flips if not enough space. */
  side?: "auto" | Side;
  className?: string;
  disabled?: boolean;
  "aria-label"?: string;
};

const EASE_OUT: [number, number, number, number] = [0.23, 1, 0.32, 1];
const MENU_MS = 0.18;

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

export function DropdownMenu({
  options,
  children,
  tone = "dark",
  align = "start",
  side = "auto",
  className,
  disabled = false,
  "aria-label": ariaLabel,
}: DropdownMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [coords, setCoords] = useState<MenuCoords | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const reduceMotion = prefersReducedMotion();

  useLayoutEffect(() => {
    if (!isOpen || !triggerRef.current) {
      setCoords(null);
      return;
    }

    const place = () => {
      const trigger = triggerRef.current;
      const menu = menuRef.current;
      if (!trigger) return;
      const r = trigger.getBoundingClientRect();
      const menuW = Math.max(r.width, 176);
      const menuH = menu?.offsetHeight || Math.min(48 + options.length * 44, 280);
      const gap = 8;
      const spaceBelow = window.innerHeight - r.bottom - gap;
      const spaceAbove = r.top - gap;

      let nextSide: Side =
        side === "auto"
          ? spaceBelow < menuH && spaceAbove > spaceBelow
            ? "top"
            : "bottom"
          : side;

      if (nextSide === "bottom" && spaceBelow < 96 && spaceAbove > spaceBelow) {
        nextSide = "top";
      }
      if (nextSide === "top" && spaceAbove < 96 && spaceBelow >= spaceAbove) {
        nextSide = "bottom";
      }

      let left =
        align === "end" ? r.right - menuW : r.left;
      left = Math.min(Math.max(8, left), window.innerWidth - menuW - 8);

      const top =
        nextSide === "bottom"
          ? r.bottom + gap
          : Math.max(8, r.top - gap - menuH);

      setCoords({ top, left, width: menuW, side: nextSide });
    };

    place();
    // Remeasure after paint so real menu height is known.
    const raf = requestAnimationFrame(place);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [isOpen, align, side, options.length]);

  useEffect(() => {
    if (!isOpen) return;
    const onPointer = (e: MouseEvent) => {
      const t = e.target as Node;
      if (rootRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setIsOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [isOpen]);

  const originY = coords?.side === "top" ? "bottom" : "top";

  const menu = (
    <AnimatePresence>
      {isOpen && coords && (
        <motion.div
          ref={menuRef}
          id={menuId}
          role="menu"
          data-tone={tone}
          data-side={coords.side}
          className={styles.menuPortal}
          style={{
            top: coords.top,
            left: coords.left,
            width: coords.width,
            transformOrigin: `${align === "end" ? "right" : "left"} ${originY}`,
          }}
          initial={
            reduceMotion
              ? { opacity: 0 }
              : {
                  opacity: 0,
                  y: coords.side === "top" ? 6 : -6,
                  scale: 0.98,
                }
          }
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={
            reduceMotion
              ? { opacity: 0 }
              : {
                  opacity: 0,
                  y: coords.side === "top" ? 4 : -4,
                  scale: 0.98,
                }
          }
          transition={{ duration: MENU_MS, ease: EASE_OUT }}
        >
          {options.length > 0 ? (
            options.map((option) => (
              <button
                key={option.label}
                type="button"
                role="menuitem"
                disabled={option.disabled}
                className={styles.item}
                onClick={() => {
                  if (option.disabled) return;
                  option.onClick();
                  setIsOpen(false);
                }}
              >
                {option.Icon ? (
                  <span className={styles.itemIcon}>{option.Icon}</span>
                ) : null}
                {option.label}
              </button>
            ))
          ) : (
            <div className={styles.empty}>No options</div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <div
      ref={rootRef}
      className={cn(styles.root, className)}
      data-tone={tone}
      data-open={isOpen}
    >
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        disabled={disabled}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-controls={menuId}
        aria-label={ariaLabel}
        onClick={() => setIsOpen((v) => !v)}
      >
        <span className={styles.triggerLabel}>{children ?? "Menu"}</span>
        <motion.span
          className={styles.chevron}
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: MENU_MS, ease: EASE_OUT }}
          aria-hidden="true"
        >
          <ChevronDown className={styles.chevronIcon} />
        </motion.span>
      </button>

      {typeof document !== "undefined"
        ? createPortal(menu, document.body)
        : null}
    </div>
  );
}

type SelectMenuProps = {
  value: string;
  options: Array<{ label: string; value: string }>;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  tone?: "dark" | "light";
  className?: string;
  "aria-label"?: string;
};

export function SelectMenu({
  value,
  options,
  onChange,
  placeholder = "Choose…",
  disabled = false,
  tone = "light",
  className,
  "aria-label": ariaLabel,
}: SelectMenuProps) {
  const current =
    options.find((o) => o.value === value)?.label ??
    (value ? value : placeholder);

  return (
    <DropdownMenu
      tone={tone}
      disabled={disabled}
      className={cn(styles.selectWrap, className)}
      aria-label={ariaLabel}
      options={options.map((o) => ({
        label: o.label,
        onClick: () => onChange(o.value),
      }))}
    >
      {current}
    </DropdownMenu>
  );
}
