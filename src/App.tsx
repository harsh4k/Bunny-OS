import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { LogicalPosition, LogicalSize } from "@tauri-apps/api/dpi";
import { listen } from "@tauri-apps/api/event";
import { currentMonitor, getCurrentWindow } from "@tauri-apps/api/window";
import { ExpandedDashboard } from "./components/ExpandedDashboard";
import type { PanelView } from "./components/CompactPanel";
import { VoicePill } from "./components/VoicePill";
import {
  ISLAND_WINDOW,
  TOP_INSET,
  WINDOW_W,
  applyIslandCssVars,
} from "./lib/islandGeometry";
import { useVoiceStatus } from "./lib/useVoiceStatus";
import { ACTIVE_VOICE_STATES } from "./lib/voiceStatus";

const DASHBOARD = { width: 820, height: 560 } as const;
/** Idle pill lingers this long before tucking itself away. */
const AUTO_HIDE_MS = 6_000;

function App() {
  const [expanded, setExpanded] = useState(false);
  const [activeView, setActiveView] = useState<PanelView>("overview");
  const [micMuted, setMicMuted] = useState(true);
  const [pillHovered, setPillHovered] = useState(false);
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
      // Browser/Vitest preview has no Tauri window.
      applyIslandCssVars();
    }
  }, []);

  const handleClose = () => {
    setExpanded(false);
    void placeWindow(false).finally(() => {
      invoke("hide_window").catch(console.error);
    });
  };

  const handleCollapse = () => {
    setExpanded(false);
    setActiveView("overview");
  };

  useEffect(() => {
    applyIslandCssVars();
  }, []);

  useEffect(() => {
    const surface = expanded ? "dashboard" : "island";
    document.documentElement.dataset.surface = surface;
    document.body.dataset.surface = surface;
    if (!expanded) applyIslandCssVars();
    void placeWindow(expanded);
  }, [expanded, placeWindow]);

  // Auto-hide: the pill is an overlay, so it gets out of the way once there is
  // nothing to report. The hotkey, tray, and wake word all bring it back.
  useEffect(() => {
    if (expanded || pillHovered) return;
    if (voiceError !== null || ACTIVE_VOICE_STATES.has(voiceState)) return;
    const timer = setTimeout(() => {
      invoke("hide_window").catch(() => {});
    }, AUTO_HIDE_MS);
    return () => clearTimeout(timer);
  }, [expanded, pillHovered, voiceState, voiceError]);

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
        setActiveView("overview");
        setExpanded(true);
        return;
      }
      if (payload.cmd === "wake") {
        setActiveView("wake");
        setExpanded(true);
      }
    });

    const unlistenShown = listen("window-shown", () => {
      void placeWindow(expandedRef.current);
    });

    return () => {
      void unlistenTray.then((dispose) => dispose());
      void unlistenShown.then((dispose) => dispose());
    };
  }, [placeWindow]);

  if (!expanded) {
    return (
      <VoicePill
        onExpand={() => setExpanded(true)}
        onHoverChange={setPillHovered}
      />
    );
  }

  return (
    <ExpandedDashboard
      activeView={activeView}
      onViewChange={setActiveView}
      onCollapse={handleCollapse}
      onClose={handleClose}
      micMuted={micMuted}
      onMicMutedChange={setMicMuted}
    />
  );
}

export default App;
