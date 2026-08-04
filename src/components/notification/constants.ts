/**
 * Presentation tokens for the Dynamic Island–style notification pill.
 * Window geometry SoT remains islandGeometry.ts — keep size numbers aligned.
 */

export const NOTIFICATION_RADIUS = 12;

export const NOTIFICATION_BLUR_PX = 40;

export const NOTIFICATION_SPACING = {
  padX: 12,
  padY: 4,
  gap: 8,
  artSize: 26,
  artRadius: 6,
  controlSize: 24,
  progressH: 2,
  notchGap: 0,
} as const;

export const NOTIFICATION_SHADOW = {
  rest: "0 6px 20px rgba(0, 0, 0, 0.32), 0 2px 4px rgba(0, 0, 0, 0.18)",
  hover: "0 10px 28px rgba(0, 0, 0, 0.4), 0 3px 6px rgba(0, 0, 0, 0.22)",
  bar: "0 1px 6px rgba(0, 0, 0, 0.4)",
} as const;

export const NOTIFICATION_COLOR = {
  bg: "#0a0a0a",
  bgHover: "#161616",
  border: "rgba(255, 255, 255, 0.1)",
  borderHover: "rgba(255, 255, 255, 0.16)",
  title: "#FFFFFF",
  subtitle: "rgba(255, 255, 255, 0.58)",
} as const;

/**
 * Pill emerges from the top bar — transform-origin top center.
 * Prefer scale / opacity / y; size morph is CSS on the shell.
 */
export const NOTIFICATION_MOTION = {
  faceInitial: { opacity: 0, y: -6 },
  faceAnimate: { opacity: 1, y: 0 },
  faceExit: { opacity: 0, y: -4 },
  hover: { scale: 1 },
  spring: {
    type: "spring" as const,
    stiffness: 440,
    damping: 32,
    mass: 0.8,
  },
  faceSpring: {
    type: "spring" as const,
    stiffness: 400,
    damping: 30,
    mass: 0.65,
  },
  initial: { opacity: 0, y: -8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -6 },
  hoverTransition: {
    type: "spring" as const,
    stiffness: 520,
    damping: 34,
    mass: 0.55,
  },
  contentDelayMs: 50,
  durationHintMs: 420,
  morphMs: 420,
} as const;

/** Keep in sync with islandGeometry.ts */
export const NOTIFICATION_SIZE = {
  minWidth: 188,
  maxWidth: 300,
  height: 38,
  mediaHeight: 44,
  notchWidth: 160,
  notchHeight: 4,
} as const;
