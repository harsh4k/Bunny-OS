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
  LINE_HIT_H,
  PAD_TOP,
  PAD_X,
  PILL_H,
  PILL_W,
  TOP_INSET,
  WINDOW_W,
  applyIslandCssVars,
} from "./lib/islandGeometry";
import { useVoiceStatus } from "./lib/useVoiceStatus";
import { ACTIVE_VOICE_STATES } from "./lib/voiceStatus";

const DASHBOARD = { width: 920, height: 620 } as const;
/** Poll while click-through so hover can re-arm the pill. */
const HIT_POLL_MS = 80;
const ONBOARDING_KEY = "bunnyos.onboarding.v1";
const ONBOARDING_LEGACY = "bunnyos.firstRunAck.v1";

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

function App() {
  const [onboardingPending, setOnboardingPending] = useState(needsOnboarding);
  const [expanded, setExpanded] = useState(
    () => needsOnboarding() || forceDashboardPreview()
  );
  const [activeView, setActiveView] = useState<PanelView>("overview");
  const [micMuted, setMicMuted] = useState(true);
  const [pillHovered, setPillHovered] = useState(false);
  /** False only after explicit hide — island line stays up otherwise. */
  const [islandShown, setIslandShown] = useState(true);
  const { state: voiceState, error: voiceError } = useVoiceStatus();
  const expandedRef = useRef(expanded);
  expandedRef.current = expanded;

  const voiceBusy =
    voiceError !== null || ACTIVE_VOICE_STATES.has(voiceState);
  const pillDormant =
    !expanded && islandShown && !pillHovered && !voiceBusy;

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
        const hitH = (busy || pillHovered ? PILL_H : LINE_HIT_H) * scale;
        const pillRight = pillLeft + PILL_W * scale;
        const pillBottom = pillTop + hitH;
        const overPill =
          cursor.x >= pillLeft &&
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
          dormant={pillDormant}
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
