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
  ISLAND_WINDOW,
  PAD_X,
  PAD_Y,
  PILL_H,
  PILL_W,
  TOP_INSET,
  WINDOW_W,
  applyIslandCssVars,
} from "./lib/islandGeometry";
import { useVoiceStatus } from "./lib/useVoiceStatus";
import { ACTIVE_VOICE_STATES } from "./lib/voiceStatus";

const DASHBOARD = { width: 820, height: 560 } as const;
/** Idle pill lingers this long before tucking itself away. */
const AUTO_HIDE_MS = 6_000;
/** Poll while click-through so hover can re-arm the pill. */
const HIT_POLL_MS = 80;
const ONBOARDING_KEY = "bunnyos.onboarding.v1";
const ONBOARDING_LEGACY = "bunnyos.firstRunAck.v1";

function needsOnboarding(): boolean {
  try {
    return (
      localStorage.getItem(ONBOARDING_KEY) !== "1" &&
      localStorage.getItem(ONBOARDING_LEGACY) !== "1"
    );
  } catch {
    return true;
  }
}

function App() {
  const [onboardingPending, setOnboardingPending] = useState(needsOnboarding);
  const [expanded, setExpanded] = useState(needsOnboarding);
  const [activeView, setActiveView] = useState<PanelView>("overview");
  const [micMuted, setMicMuted] = useState(true);
  const [pillHovered, setPillHovered] = useState(false);
  /** False after auto-hide / close — skip hit-testing a tucked window. */
  const [islandShown, setIslandShown] = useState(true);
  const { state: voiceState, error: voiceError } = useVoiceStatus();
  const expandedRef = useRef(expanded);
  expandedRef.current = expanded;

  const placeWindow = useCallback(async (nextExpanded: boolean) => {
    try {
      const window = getCurrentWindow();
      document.documentElement.dataset.tauri = "1";
      applyIslandCssVars();
      const size = nextExpanded
        ? new LogicalSize(DASHBOARD.width, DASHBOARD.height)
        : new LogicalSize(ISLAND_WINDOW.width, ISLAND_WINDOW.height);
      await window.setSize(size);
      await window.setShadow(nextExpanded);

      const monitor = await currentMonitor();
      if (!monitor) return;

      const scale = monitor.scaleFactor;
      const monitorWidth = monitor.size.width / scale;
      const monitorX = monitor.position.x / scale;
      const monitorY = monitor.position.y / scale;
      const width = nextExpanded ? DASHBOARD.width : WINDOW_W;

      await window.setPosition(
        new LogicalPosition(
          Math.round(monitorX + (monitorWidth - width) / 2),
          Math.round(monitorY + TOP_INSET)
        )
      );
    } catch {
      applyIslandCssVars();
    }
  }, []);

  const handleClose = () => {
    if (onboardingPending) return;
    setExpanded(false);
    setPillHovered(false);
    setIslandShown(false);
    void placeWindow(false).finally(() => {
      invoke("hide_window").catch(console.error);
    });
  };

  const handleCollapse = () => {
    if (onboardingPending) return;
    setExpanded(false);
    setActiveView("overview");
  };

  const handleOnboardingDone = useCallback(() => {
    setOnboardingPending(false);
  }, []);

  useEffect(() => {
    applyIslandCssVars();
  }, []);

  useEffect(() => {
    if (!onboardingPending) return;
    setIslandShown(true);
    setExpanded(true);
    void invoke("show_window").catch(() => {});
  }, [onboardingPending]);

  useEffect(() => {
    const surface = expanded ? "dashboard" : "island";
    document.documentElement.dataset.surface = surface;
    document.body.dataset.surface = surface;
    if (!expanded) applyIslandCssVars();
    void placeWindow(expanded);
  }, [expanded, placeWindow]);

  useEffect(() => {
    if (onboardingPending || expanded || pillHovered) return;
    if (voiceError !== null || ACTIVE_VOICE_STATES.has(voiceState)) return;
    const timer = setTimeout(() => {
      setPillHovered(false);
      setIslandShown(false);
      invoke("hide_window").catch(() => {});
    }, AUTO_HIDE_MS);
    return () => clearTimeout(timer);
  }, [onboardingPending, expanded, pillHovered, voiceState, voiceError]);

  // Idle island: pass clicks through; poll pill hit-box so hover can't stick.
  useEffect(() => {
    const apply = (ignore: boolean) => {
      getCurrentWindow()
        .setIgnoreCursorEvents(ignore)
        .catch(() => {});
    };

    // Hidden / expanded dashboard: always accept cursor (tray will show again).
    if (!islandShown || expanded) {
      apply(false);
      return;
    }

    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      const voiceBusy =
        voiceError !== null || ACTIVE_VOICE_STATES.has(voiceState);
      try {
        const window = getCurrentWindow();
        const [pos, scale] = await Promise.all([
          window.outerPosition(),
          window.scaleFactor(),
        ]);
        const cursor = await cursorPosition();
        const pillLeft = pos.x + PAD_X * scale;
        const pillTop = pos.y + PAD_Y * scale;
        const pillRight = pillLeft + PILL_W * scale;
        const pillBottom = pillTop + PILL_H * scale;
        const overPill =
          cursor.x >= pillLeft &&
          cursor.x <= pillRight &&
          cursor.y >= pillTop &&
          cursor.y <= pillBottom;
        setPillHovered(overPill);
        await window.setIgnoreCursorEvents(!(overPill || voiceBusy));
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
  }, [expanded, voiceState, voiceError, islandShown]);

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
        setPillHovered(false);
        setIslandShown(true);
        setActiveView("overview");
        setExpanded(true);
        return;
      }
      if (payload.cmd === "wake") {
        setPillHovered(false);
        setIslandShown(true);
        setActiveView("wake");
        setExpanded(true);
      }
    });

    const unlistenShown = listen("window-shown", () => {
      setPillHovered(false);
      setIslandShown(true);
      void placeWindow(expandedRef.current);
    });

    return () => {
      void unlistenTray.then((dispose) => dispose());
      void unlistenShown.then((dispose) => dispose());
    };
  }, [placeWindow]);

  const handleBrowserPending = useCallback(
    (pending: { pendingId: string } | null) => {
      if (!pending) return;
      setPillHovered(false);
      setIslandShown(true);
      setExpanded(true);
      void invoke("show_window").catch(() => {});
    },
    []
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
          onExpand={() => {
            setPillHovered(false);
            setIslandShown(true);
            setExpanded(true);
          }}
          onHoverChange={setPillHovered}
        />
      ) : (
        <ExpandedDashboard
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
