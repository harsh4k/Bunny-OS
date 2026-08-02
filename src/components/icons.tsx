/** Shared stroke icons — one family, 1.75 weight. Swap for Phosphor if approved later. */
import type { ReactNode } from "react";

type IconProps = {
  size?: number;
  className?: string;
};

function Svg({
  size = 18,
  className,
  children,
}: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export function IconHome(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5Z" />
    </Svg>
  );
}

export function IconChat(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M5 6.5A2.5 2.5 0 0 1 7.5 4h9A2.5 2.5 0 0 1 19 6.5v7A2.5 2.5 0 0 1 16.5 16H10l-4 3.5V16H7.5A2.5 2.5 0 0 1 5 13.5v-7Z" />
    </Svg>
  );
}

export function IconModels(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 3 20 7.5v9L12 21 4 16.5v-9L12 3Z" />
      <path d="M12 12 20 7.5M12 12v9M12 12 4 7.5" />
    </Svg>
  );
}

export function IconWave(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4 12h2M9 8v8M14 5v14M19 9v6" />
    </Svg>
  );
}

export function IconMemory(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="4" y="5" width="16" height="14" rx="2" />
      <path d="M8 9h8M8 12h5M8 15h6" />
    </Svg>
  );
}

export function IconMic(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M6 11a6 6 0 0 0 12 0M12 17v3M9 20h6" />
    </Svg>
  );
}

export function IconMicOff(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4 4l16 16" />
      <path d="M9 9v2a3 3 0 0 0 4.7 2.5M15 10.5V7a3 3 0 0 0-5.2-2" />
      <path d="M6 11a6 6 0 0 0 9.5 4.8M18 13.2A6 6 0 0 0 18 11M12 17v3M9 20h6" />
    </Svg>
  );
}

export function IconTalk(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="8" />
      <path d="M9 12h.01M12 12h.01M15 12h.01" />
    </Svg>
  );
}

export function IconCollapse(p: IconProps) {
  return (
    <Svg {...p}>
      {/* Compact island capsule — clearer “collapse to pill” affordance */}
      <rect x="4" y="9" width="16" height="6" rx="3" />
      <path d="M9 6.5 12 4l3 2.5" />
    </Svg>
  );
}

export function IconStop(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function IconShield(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 3 5 6v5c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6l-7-3Z" />
      <path d="m9.5 12 1.8 1.8L15 10" />
    </Svg>
  );
}

export function IconClose(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M7 7l10 10M17 7 7 17" />
    </Svg>
  );
}

export function IconApps(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="4" y="4" width="7" height="7" rx="1.5" />
      <rect x="13" y="4" width="7" height="7" rx="1.5" />
      <rect x="4" y="13" width="7" height="7" rx="1.5" />
      <rect x="13" y="13" width="7" height="7" rx="1.5" />
    </Svg>
  );
}

export function IconUpdates(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4 12a8 8 0 0 1 14.5-4.5" />
      <path d="M20 4v5h-5" />
      <path d="M20 12a8 8 0 0 1-14.5 4.5" />
      <path d="M4 20v-5h5" />
    </Svg>
  );
}

export function IconRecover(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4 12a8 8 0 1 0 2.3-5.6" />
      <path d="M4 5v5h5" />
    </Svg>
  );
}
