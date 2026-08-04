import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";
import { NOTIFICATION_MOTION } from "./constants";
import styles from "./NotificationPill.module.css";

interface NotificationAnimationProps {
  children: ReactNode;
  interactive?: boolean;
  className?: string;
  style?: React.CSSProperties;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

/**
 * Spring enter/exit for a pill shell. Animates transform + opacity only.
 * Prefer NotificationQueue for the island open/close lifecycle.
 */
export function NotificationAnimation({
  children,
  interactive = true,
  className,
  style,
  onMouseEnter,
  onMouseLeave,
}: NotificationAnimationProps) {
  const reduce = useReducedMotion();

  if (reduce) {
    return (
      <div
        className={className ?? styles.shell}
        style={style}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      >
        {children}
      </div>
    );
  }

  return (
    <motion.div
      className={className ?? styles.shell}
      style={style}
      initial={NOTIFICATION_MOTION.initial}
      animate={NOTIFICATION_MOTION.animate}
      exit={NOTIFICATION_MOTION.exit}
      transition={NOTIFICATION_MOTION.spring}
      whileHover={interactive ? NOTIFICATION_MOTION.hover : undefined}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {children}
    </motion.div>
  );
}
