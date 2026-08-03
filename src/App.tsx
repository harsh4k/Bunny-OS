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
  ISLAND_H,
  ISLAND_WINDOW,
  LINE_HIT_H,
  PAD_TOP,
  PAD_X,
  WINDOW_W,
  TOP_INSET,
  applyIslandCssVars,
} from "./lib/islandGeometry";
import { useVoiceStatus } from "./lib/useVoiceStatus";
import type { ShellMotion } from "./lib/shellMotion";
import { ACTIVE_VOICE_STATES } from "./lib/voiceStatus";

const DASHBOARD = { width: 980, height: 640 } as const;
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
  /** False only after explicit hide — island line stays up otherwise. */
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

  const voiceBusy =
    voiceError !== null || ACTIVE_VOICE_STATES.has(voiceState);
  // Idle → tuck into the sleek bar; hover / voice pulls the pill back out.
  const pillDormant =
    !expanded && islandShown && !pillHovered && !voiceBusy;

  const placeWindow = useCallback(async (nextExpanded: boolean, animate = false) => {
    try {
      const window = getCurrentWindow();
      document.documentElement.dataset.tauri = "1";
      applyIslandCssVars();

      const endW = nextExpanded ? DASHBOARD.width : ISLAND_WINDOW.width;
      const endH = nextExpanded ? DASHBOARD.height : ISLAND_WINDOW.height;
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
    (view: PanelView = "overview") => {
      if (exitTimerRef.current != null) {
        window.clearTimeout(exitTimerRef.current);
        exitTimerRef.current = null;
      }
      afterExitRef.current = null;
      setPillHovered(false);
      setIslandShown(true);
      setActiveView(view);
      setShellMotion(prefersReducedMotion() ? "idle" : "enter");
      setExpanded(true);
      void invoke("show_window").catch(() => {});
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
    if (expanded) {
      void placeWindow(true, shellMotion === "enter");
    }
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

  // Keep the island window visible — dormant line instead of hide-on-idle.
  useEffect(() => {
    if (onboardingPending || expanded || !islandShown) return;
    void invoke("show_window").catch(() => {});
  }, [onboardingPending, expanded, islandShown]);

  // Idle island: pass clicks through; poll hit-box so hover wakes the line.
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

    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      const busy = voiceError !== null || ACTIVE_VOICE_STATES.has(voiceState);
      try {
        const window = getCurrentWindow();
        const [pos, scale] = await Promise.all([
          window.outerPosition(),
          window.scaleFactor(),
        ]);
        const cursor = await cursorPosition();
        const pillLeft = pos.x + PAD_X * scale;
        const pillTop = pos.y + PAD_TOP * scale;
        const hitH = (busy || pillHovered ? ISLAND_H : LINE_HIT_H) * scale;
        const hitW = (busy || pillHovered ? WINDOW_W : 120) * scale;
        const hitLeft =
          pillLeft + ((WINDOW_W * scale - hitW) / 2);
        const pillRight = hitLeft + hitW;
        const pillBottom = pillTop + hitH;
        const overPill =
          cursor.x >= hitLeft &&
          cursor.x <= pillRight &&
          cursor.y >= pillTop &&
          cursor.y <= pillBottom;
        setPillHovered(overPill);
        await window.setIgnoreCursorEvents(!(overPill || busy));
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
    };
  }, [expanded, voiceState, voiceError, islandShown, pillHovered]);

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
      openShell("overview");
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
          dormant={pillDormant}
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
