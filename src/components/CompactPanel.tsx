/**
 * CompactPanel — main Bunny OS window: lifecycle, voice controls, overlays.
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import type { AppEvent, AppLifecycle } from "~contracts/ipc";
import {
  lifecycleReducer,
  INITIAL_STATE,
  statusLabel,
  isRecoverable,
  type LifecycleEvent,
  type LifecycleState,
} from "../lib/stateReducer";
import { AdvisorPanel } from "./AdvisorPanel";
import { ChatPanel } from "./ChatPanel";
import { FirstRunNotice } from "./FirstRunNotice";
import { IconClose } from "./icons";
import { MemoryPanel } from "./MemoryPanel";
import { OverviewPane } from "./OverviewPane";
import { WakePanel } from "./WakePanel";
import styles from "./CompactPanel.module.css";

export type PanelView = "overview" | "chat" | "advisor" | "memory" | "wake";

interface Props {
  onClose?: () => void;
  embedded?: boolean;
  activeView?: PanelView;
  onViewChange?: (view: PanelView) => void;
  micMuted?: boolean;
  onMicMutedChange?: (muted: boolean) => void;
  onOnboardingDone?: () => void;
}

export function CompactPanel({
  onClose,
  embedded = false,
  activeView,
  onViewChange,
  micMuted: micMutedProp,
  onMicMutedChange,
  onOnboardingDone,
}: Props) {
  const [lifecycle, setLifecycle] = useState<LifecycleState>(INITIAL_STATE);
  const [micMutedLocal, setMicMutedLocal] = useState(true);
  const [voiceState, setVoiceState] = useState("idle");
  const [localView, setLocalView] = useState<PanelView>("overview");
  const [listenId, setListenId] = useState<string | null>(null);
  const [pttKey, setPttKey] = useState("F9");
  const listenIdRef = useRef<string | null>(null);
  const talkRestoreMuteRef = useRef(false);

  const micMuted = micMutedProp ?? micMutedLocal;
  const setMicMuted = onMicMutedChange ?? setMicMutedLocal;

  const ready = lifecycle.status === "ready" || lifecycle.status === "degraded";
  const view = activeView ?? localView;
  const setView = onViewChange ?? setLocalView;

  useEffect(() => {
    listenIdRef.current = listenId;
  }, [listenId]);

  const handleAppEvent = useCallback((ev: AppEvent) => {
    if (ev.event === "lifecycle-changed") {
      setLifecycle((prev) =>
        lifecycleReducer(prev, lifecycleEventFromPayload(ev.lifecycle, ev.reason))
      );
    } else if (ev.event === "crash-report") {
      setLifecycle((prev) => ({
        ...prev,
        crash_count: ev.crash_count,
        last_crash_at: Date.now(),
        version: prev.version + 1,
      }));
    } else if (ev.event === "sidecar-message") {
      const msg = ev.message;
      if (msg.type === "stream" && msg.chunk.startsWith("{")) {
        try {
          const parsed = JSON.parse(msg.chunk) as { voice_state?: string };
          if (parsed.voice_state) {
            setVoiceState(parsed.voice_state);
            if (parsed.voice_state === "idle") setListenId(null);
          }
        } catch {
          /* ignore non-voice stream chunks */
        }
      }
    }
  }, []);

  useEffect(() => {
    const unlistenP = listen<AppEvent>("app-event", (e) =>
      handleAppEvent(e.payload)
    );
    invoke<AppLifecycle>("get_lifecycle")
      .then((status) => {
        setLifecycle((prev) =>
          lifecycleReducer(prev, lifecycleEventFromPayload(status, null))
        );
      })
      .catch(console.error);

    if (micMutedProp === undefined) {
      invoke<boolean>("get_mic_muted")
        .then(setMicMutedLocal)
        .catch(() => {});
    }

    invoke<string>("get_ptt_label")
      .then((key) => {
        if (typeof key === "string" && key) setPttKey(key);
      })
      .catch(() => {});

    return () => {
      unlistenP.then((fn) => fn()).catch(console.error);
      // Collapse/unmount while Talk is held — stop sidecar listen.
      const id = listenIdRef.current;
      if (id) {
        void invoke("send_action", {
          id,
          payload: { action: "stop_listen" },
        }).catch(() => {});
      }
    };
  }, [handleAppEvent, micMutedProp]);

  const toggleMute = async () => {
    const next = !micMuted;
    setMicMuted(next);
    try {
      await invoke("send_action", {
        id: crypto.randomUUID(),
        payload: { action: "set_mute", muted: next },
      });
    } catch (err) {
      console.error(err);
    }
  };

  const pushToTalkDown = async () => {
    if (!ready || listenId) return;
    // Holding Talk is consent — temporarily unmute like F9 does.
    talkRestoreMuteRef.current = micMuted;
    if (micMuted) {
      setMicMuted(false);
      try {
        await invoke("send_action", {
          id: crypto.randomUUID(),
          payload: { action: "set_mute", muted: false },
        });
      } catch (err) {
        talkRestoreMuteRef.current = false;
        setMicMuted(true);
        console.error(err);
        return;
      }
    }
    const id = crypto.randomUUID();
    setListenId(id);
    setVoiceState("listening");
    try {
      // No model: the sidecar owns the default so UI and hotkey can't diverge.
      await invoke("send_action", { id, payload: { action: "start_listen" } });
    } catch (err) {
      setListenId(null);
      setVoiceState("idle");
      console.error(err);
    }
  };

  const pushToTalkUp = async () => {
    if (!listenId) return;
    const id = listenId;
    try {
      await invoke("send_action", {
        id,
        payload: { action: "stop_listen" },
      });
    } catch (err) {
      console.error(err);
    } finally {
      setListenId(null);
      if (talkRestoreMuteRef.current) {
        talkRestoreMuteRef.current = false;
        setMicMuted(true);
        void invoke("send_action", {
          id: crypto.randomUUID(),
          payload: { action: "set_mute", muted: true },
        }).catch(() => {});
      }
    }
  };

  const openMicPrivacy = () => {
    void invoke("open_mic_privacy_settings").catch(console.error);
  };

  const { status, reason, crash_count, last_crash_at } = lifecycle;
  const canRecover =
    (status === "degraded" || status === "error") && isRecoverable(lifecycle);

  return (
    <div className={styles.panel} data-embedded={embedded}>
      <FirstRunNotice onDismiss={onOnboardingDone} />
      {view === "chat" && (
        <ChatPanel onClose={() => setView("overview")} sidecarReady={ready} />
      )}
      {view === "memory" && (
        <MemoryPanel onClose={() => setView("overview")} sidecarReady={ready} />
      )}
      {view === "wake" && (
        <WakePanel onClose={() => setView("overview")} sidecarReady={ready} />
      )}
      {view === "advisor" && (
        <AdvisorPanel onClose={() => setView("overview")} sidecarReady={ready} />
      )}
      {view === "overview" && (
        <>
          <div className={styles.titleBar} data-tauri-drag-region="">
            <div className={styles.titleBarLeft}>
              <div className={styles.logo} aria-hidden="true">B</div>
              <span className={styles.appName}>Bunny OS</span>
            </div>
            <button
              className={styles.closeBtn}
              onClick={onClose}
              aria-label="Hide window"
              title="Hide (still running in tray)"
            >
              <IconClose size={14} />
            </button>
          </div>
          <OverviewPane
            status={status}
            statusLabel={statusLabel(status)}
            reason={reason}
            crashCount={crash_count}
            lastCrashAt={last_crash_at}
            micMuted={micMuted}
            voiceState={voiceState}
            pttKey={pttKey}
            ready={ready}
            canRecover={canRecover}
            onRecover={() => {
              setLifecycle((prev) => lifecycleReducer(prev, { type: "RECOVER" }));
              invoke("restart_sidecar").catch(console.error);
            }}
            onToggleMute={() => void toggleMute()}
            onTalkDown={() => void pushToTalkDown()}
            onTalkUp={() => void pushToTalkUp()}
            onOpenMicPrivacy={openMicPrivacy}
            onOpen={setView}
            onQuit={() => invoke("quit_app").catch(console.error)}
          />
        </>
      )}
    </div>
  );
}

function lifecycleEventFromPayload(
  lifecycle: AppLifecycle,
  reason: string | null
): LifecycleEvent {
  switch (lifecycle) {
    case "starting": return { type: "SIDECAR_STARTING" };
    case "ready":    return { type: "SIDECAR_READY" };
    case "degraded": return { type: "SIDECAR_DEGRADED", reason: reason ?? "sidecar degraded" };
    case "error":    return { type: "SIDECAR_ERROR",    reason: reason ?? "unknown error" };
    case "stopped":  return { type: "APP_QUIT" };
  }
}
