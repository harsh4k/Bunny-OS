import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { LogicalPosition, LogicalSize } from "@tauri-apps/api/dpi";
import { listen } from "@tauri-apps/api/event";
import {
  cursorPosition,
  currentMonitor,
  getCurrentWindow,
} from "@tauri-apps/api/window";
import { ExpandedDashboard } from "./components/ExpandedDashboard";
import type { PanelView } from "./components/CompactPanel";
import { BrowserConfirmBanner } from "./components/BrowserConfirmBanner";
import { VoicePill } from "./components/VoicePill";
import {
  TOP_INSET,
  applyIslandCssVars,
  islandBarWindow,
} from "./lib/islandGeometry";
import { cursorInHitRect, hitRectInWindow } from "./lib/islandHitTest";
import { ensureIslandTransparency } from "./lib/islandTransparency";
import { useVoiceStatus } from "./lib/useVoiceStatus";
import type { ShellMotion } from "./lib/shellMotion";
import { ACTIVE_VOICE_STATES } from "./lib/voiceStatus";

const DASHBOARD = { width: 980, height: 640 } as const;
/** Idle pill lingers this long before tucking itself away. */
const AUTO_HIDE_MS = 6_000;
/** Poll while click-through so hover can re-arm the pill. */
const HIT_POLL_MS = 80;
const ONBOARDING_KEY = "bunnyos.onboarding.v1";
const ONBOARDING_LEGACY = "bunnyos.firstRunAck.v1";
/** Keep in sync with ExpandedDashboard.module.css shell-exit duration. */
const SHELL_EXIT_MS = 280;

/** Browser/Vite preview: `?ui=dashboard` skips island and opens the shell. */
function forceDashboardPreview(): boolean {
  try {
    return new URLSearchParams(window.location.search).get("ui") === "dashboard";
  } catch {
    return false;
  }
}

function needsOnboarding(): boolean {
  if (forceDashboardPreview()) return false;
  try {
    return (
      localStorage.getItem(ONBOARDING_KEY) !== "1" &&
      localStorage.getItem(ONBOARDING_LEGACY) !== "1"
    );
  } catch {
    return true;
  }
}

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function App() {
  const [onboardingPending, setOnboardingPending] = useState(needsOnboarding);
  const startOpen = () => needsOnboarding() || forceDashboardPreview();
  const [expanded, setExpanded] = useState(startOpen);
  const [shellMotion, setShellMotion] = useState<ShellMotion>(() =>
    startOpen() && !prefersReducedMotion() ? "enter" : "idle"
  );
  const [activeView, setActiveView] = useState<PanelView>("overview");
  const [micMuted, setMicMuted] = useState(true);
  const [pillHovered, setPillHovered] = useState(false);
  /** False after idle tuck — collapses to the thin top notch (window stays). */
  const [islandOpen, setIslandOpen] = useState(true);
  /** False after explicit close — tray / PTT shows island again. */
  const [islandShown, setIslandShown] = useState(true);
  const { state: voiceState, error: voiceError } = useVoiceStatus();
  const expandedRef = useRef(expanded);
  expandedRef.current = expanded;
  const shellMotionRef = useRef(shellMotion);
  shellMotionRef.current = shellMotion;
  const exitTimerRef = useRef<number | null>(null);
  const afterExitRef = useRef<"collapse" | "hide" | null>(null);
  const exitDoneRef = useRef(false);
  const sizeAnimRef = useRef(0);
  const islandBarOpenRef = useRef(true);

  const voiceBusy = voiceError !== null || ACTIVE_VOICE_STATES.has(voiceState);
  const pillOpen = islandOpen || pillHovered || voiceBusy;
  islandBarOpenRef.current = pillOpen;

  const placeWindow = useCallback(async (nextExpanded: boolean, animate = false) => {
    try {
      const window = getCurrentWindow();
      document.documentElement.dataset.tauri = "1";
      applyIslandCssVars();
      void ensureIslandTransparency();

      const barOpen = islandBarOpenRef.current;
      const islandFrame = nextExpanded ? null : islandBarWindow(barOpen);
      const endW = nextExpanded ? DASHBOARD.width : islandFrame!.width;
      const endH = nextExpanded ? DASHBOARD.height : islandFrame!.height;
      const monitor = await currentMonitor();
      const scale = monitor ? monitor.scaleFactor : 1;
      const monitorWidth = monitor ? monitor.size.width / scale : endW;
      const monitorX = monitor ? monitor.position.x / scale : 0;
      const monitorY = monitor ? monitor.position.y / scale : 0;
      const endX = Math.round(monitorX + (monitorWidth - endW) / 2);
      const endY = Math.round(monitorY + TOP_INSET);

      const doAnimate = animate && !prefersReducedMotion();
      if (!doAnimate) {
        await window.setSize(new LogicalSize(endW, endH));
        await window.setShadow(nextExpanded);
        if (monitor) {
          await window.setPosition(new LogicalPosition(endX, endY));
        }
        return;
      }

      const outer = await window.outerSize();
      const startW = outer.width / scale;
      const startH = outer.height / scale;
      const pos = await window.outerPosition();
      const startX = pos.x / scale;
      const startY = pos.y / scale;
      const duration = nextExpanded ? 360 : 260;
      const token = ++sizeAnimRef.current;
      const t0 = performance.now();

      await new Promise<void>((resolve) => {
        const frame = (now: number) => {
          if (token !== sizeAnimRef.current) {
            resolve();
            return;
          }
          const t = Math.min(1, (now - t0) / duration);
          const e = easeOutCubic(t);
          const w = Math.round(startW + (endW - startW) * e);
          const h = Math.round(startH + (endH - startH) * e);
          const x = Math.round(startX + (endX - startX) * e);
          const y = Math.round(startY + (endY - startY) * e);
          void Promise.all([
            window.setSize(new LogicalSize(w, h)),
            window.setPosition(new LogicalPosition(x, y)),
          ]).finally(() => {
            if (t < 1) {
              requestAnimationFrame(frame);
            } else {
              resolve();
            }
          });
        };
        requestAnimationFrame(frame);
      });

      if (token !== sizeAnimRef.current) return;
      await window.setSize(new LogicalSize(endW, endH));
      await window.setShadow(nextExpanded);
      if (monitor) {
        await window.setPosition(new LogicalPosition(endX, endY));
      }
    } catch {
      applyIslandCssVars();
    }
  }, []);

  const openShell = useCallback(
    (view: PanelView = "overview", opts?: { focus?: boolean }) => {
      if (exitTimerRef.current != null) {
        window.clearTimeout(exitTimerRef.current);
        exitTimerRef.current = null;
      }
      afterExitRef.current = null;
      setPillHovered(false);
      setIslandShown(true);
      setIslandOpen(true);
      setActiveView(view);
      setShellMotion(prefersReducedMotion() ? "idle" : "enter");
      setExpanded(true);
      const focus = opts?.focus !== false;
      void invoke("show_window", { focus }).catch(() => {});
      void placeWindow(true, true);
    },
    [placeWindow]
  );

  const finishExit = useCallback(() => {
    if (exitDoneRef.current) return;
    exitDoneRef.current = true;
    if (exitTimerRef.current != null) {
      window.clearTimeout(exitTimerRef.current);
      exitTimerRef.current = null;
    }
    const after = afterExitRef.current;
    afterExitRef.current = null;
    setExpanded(false);
    setShellMotion("idle");
    setActiveView("overview");
    void placeWindow(false, true).finally(() => {
      if (after === "hide") {
        invoke("hide_window").catch(console.error);
      }
    });
  }, [placeWindow]);

  const beginExit = useCallback(
    (after: "collapse" | "hide") => {
      if (onboardingPending) return;
      if (!expanded || shellMotionRef.current === "exit") return;
      exitDoneRef.current = false;
      afterExitRef.current = after;
      if (prefersReducedMotion()) {
        finishExit();
        return;
      }
      setShellMotion("exit");
      if (exitTimerRef.current != null) {
        window.clearTimeout(exitTimerRef.current);
      }
      // Fallback if animationend is missed (e.g. display:none mid-flight).
      exitTimerRef.current = window.setTimeout(finishExit, SHELL_EXIT_MS + 40);
    },
    [expanded, finishExit, onboardingPending]
  );

  const handleClose = () => beginExit("hide");
  const handleCollapse = () => beginExit("collapse");

  const handleShellMotionEnd = useCallback(
    (phase: ShellMotion) => {
      if (phase === "enter") {
        setShellMotion("idle");
        return;
      }
      if (phase === "exit") {
        finishExit();
      }
    },
    [finishExit]
  );

  const handleOnboardingDone = useCallback(() => {
    setOnboardingPending(false);
  }, []);

  useEffect(() => {
    applyIslandCssVars();
    void ensureIslandTransparency();
    const open = expandedRef.current;
    void placeWindow(open, open && shellMotion === "enter");
    return () => {
      if (exitTimerRef.current != null) {
        window.clearTimeout(exitTimerRef.current);
      }
    };
    // Initial placement only — open/close paths call placeWindow themselves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!onboardingPending) return;
    setIslandShown(true);
    setIslandOpen(true);
    setExpanded(true);
    setShellMotion(prefersReducedMotion() ? "idle" : "enter");
    void invoke("show_window").catch(() => {});
    void placeWindow(true, true);
  }, [onboardingPending, placeWindow]);

  useEffect(() => {
    const surface = expanded ? "dashboard" : "island";
    document.documentElement.dataset.surface = surface;
    document.body.dataset.surface = surface;
    if (!expanded) applyIslandCssVars();
  }, [expanded]);

  // Resize island window when bar tuck/open changes (smaller window when notched).
  useEffect(() => {
    if (expanded || !islandShown) return;
    void placeWindow(false, !prefersReducedMotion());
  }, [expanded, islandShown, pillOpen, placeWindow]);

  // Idle tuck: collapse to the thin notch (window shrinks to NOTCH_WINDOW).
  useEffect(() => {
    if (onboardingPending || expanded || pillHovered || !islandShown) return;
    if (voiceBusy) return;
    const timer = setTimeout(() => {
      setPillHovered(false);
      setIslandOpen(false);
    }, AUTO_HIDE_MS);
    return () => clearTimeout(timer);
  }, [onboardingPending, expanded, pillHovered, voiceBusy, islandShown]);

  // Re-open the bar while voice is active or after tray shows the window.
  useEffect(() => {
    if (voiceBusy && islandShown) setIslandOpen(true);
  }, [voiceBusy, islandShown]);

  // Idle island: click-through everywhere except the visible notch/bar hit target.
  useEffect(() => {
    const apply = (ignore: boolean) => {
      try {
        getCurrentWindow()
          .setIgnoreCursorEvents(ignore)
          .catch(() => {});
      } catch {
        /* web / missing Tauri window metadata */
      }
    };

    if (!islandShown || expanded) {
      apply(false);
      return;
    }

    // Default pass-through until cursor is over the island.
    apply(true);

    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      try {
        const window = getCurrentWindow();
        const [pos, outer, scale] = await Promise.all([
          window.outerPosition(),
          window.outerSize(),
          window.scaleFactor(),
        ]);
        const cursor = await cursorPosition();
        const barOpen = islandBarOpenRef.current;
        const rect = hitRectInWindow({
          windowX: pos.x,
          windowY: pos.y,
          windowW: outer.width,
          scale,
          barOpen,
        });
        const overIsland = cursorInHitRect(cursor.x, cursor.y, rect);
        setPillHovered(overIsland);
        if (overIsland) setIslandOpen(true);
        await window.setIgnoreCursorEvents(!overIsland);
      } catch {
        /* web / missing API */
      }
    };
    void tick();
    const id = window.setInterval(() => {
      void tick();
    }, HIT_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      apply(true);
    };
  }, [expanded, voiceBusy, islandShown]);

  useEffect(() => {
    invoke<boolean>("get_mic_muted")
      .then(setMicMuted)
      .catch(() => {});

    const unlistenTray = listen<{ cmd: string; muted?: boolean }>("tray-command", ({ payload }) => {
      if (payload.cmd === "mute" && typeof payload.muted === "boolean") {
        setMicMuted(payload.muted);
        return;
      }
      if (payload.cmd === "ptt") {
        openShell("overview");
        return;
      }
      if (payload.cmd === "wake") {
        openShell("wake");
      }
    });

    const unlistenShown = listen("window-shown", () => {
      setPillHovered(false);
      setIslandShown(true);
      setIslandOpen(true);
      void placeWindow(expandedRef.current, false);
    });

    return () => {
      void unlistenTray.then((dispose) => dispose());
      void unlistenShown.then((dispose) => dispose());
    };
  }, [placeWindow, openShell]);

  const handleBrowserPending = useCallback(
    (pending: { pendingId: string } | null) => {
      if (!pending) return;
      // Show confirm UI without stealing focus from the browser (type/click target).
      openShell("overview", { focus: false });
    },
    [openShell]
  );

  return (
    <>
      {/* Always mounted so island voice turns still receive confirm streams. */}
      <BrowserConfirmBanner
        visible={expanded}
        onPendingChange={handleBrowserPending}
      />
      {!expanded ? (
        <VoicePill
          open={pillOpen}
          onExpand={() => openShell("overview")}
          onHoverChange={setPillHovered}
        />
      ) : (
        <ExpandedDashboard
          motion={shellMotion}
          onMotionEnd={handleShellMotionEnd}
          activeView={activeView}
          onViewChange={setActiveView}
          onCollapse={handleCollapse}
          onClose={handleClose}
          micMuted={micMuted}
          onMicMutedChange={setMicMuted}
          onOnboardingDone={handleOnboardingDone}
        />
      )}
    </>
  );
}

export default App;
