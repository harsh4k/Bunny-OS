/**
 * Live voice status for the pill and the auto-hide timer.
 *
 * Voice sessions can be started from the hotkey while React shows nothing but
 * the collapsed pill, so this listens to the raw sidecar stream rather than
 * relying on whoever initiated the request.
 *
 * Non-voice sidecar errors (chat, memory, scans) share the same channel — they
 * must not flash the island. Soft repeats (no speech) are deduped.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import type { AppEvent } from "~contracts/ipc";
import {
  errorFingerprint,
  isCancellation,
  isPillWorthyError,
  isSoftVoiceError,
  parseVoiceChunk,
} from "./voiceStatus";

/** How long a hard failure stays on the pill. */
export const ERROR_LINGER_MS = 5_000;
/** Soft misses (didn't catch that) clear faster. */
export const SOFT_ERROR_LINGER_MS = 2_200;
/** Same fingerprint won't re-flash within this window. */
export const ERROR_DEDUP_MS = 28_000;
/** Treat voice as "recent" this long after the last active state / PTT. */
const RECENT_VOICE_MS = 12_000;

interface HotkeyPtt {
  phase: "down" | "up" | "blocked";
  reason: string | null;
}

export interface VoiceStatus {
  state: string;
  /** Full sidecar error text, or null. */
  error: string | null;
  transcript: string | null;
  /** 0–1 mic loudness while listening; 0 when idle. */
  level: number;
  /** True when the mic is picking up speech-level sound. */
  hearing: boolean;
  clearError: () => void;
}

export function useVoiceStatus(): VoiceStatus {
  const [state, setState] = useState("idle");
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [level, setLevel] = useState(0);
  const [hearing, setHearing] = useState(false);
  const errorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastVoiceAt = useRef(0);
  const lastShown = useRef<{ key: string; at: number } | null>(null);

  const markVoiceActivity = useCallback(() => {
    lastVoiceAt.current = Date.now();
  }, []);

  const clearError = useCallback(() => {
    if (errorTimer.current !== null) clearTimeout(errorTimer.current);
    errorTimer.current = null;
    setError(null);
  }, []);

  const raise = useCallback((message: string) => {
    const key = errorFingerprint(message);
    const now = Date.now();
    const prev = lastShown.current;
    if (prev && prev.key === key && now - prev.at < ERROR_DEDUP_MS) {
      // Same old error — keep quiet; optionally refresh soft linger only.
      return;
    }
    lastShown.current = { key, at: now };
    if (errorTimer.current !== null) clearTimeout(errorTimer.current);
    setError(message);
    setState("idle");
    setLevel(0);
    setHearing(false);
    const linger = isSoftVoiceError(message)
      ? SOFT_ERROR_LINGER_MS
      : ERROR_LINGER_MS;
    errorTimer.current = setTimeout(() => setError(null), linger);
  }, []);

  useEffect(() => {
    const unlistenApp = listen<AppEvent>("app-event", ({ payload }) => {
      if (payload.event !== "sidecar-message") return;
      const message = payload.message;

      if (message.type === "error") {
        if (isCancellation(message.error)) {
          setState("idle");
          setLevel(0);
          setHearing(false);
          return;
        }
        const recent =
          Date.now() - lastVoiceAt.current < RECENT_VOICE_MS;
        if (!isPillWorthyError(message.error, message.id, recent)) {
          return;
        }
        raise(message.error);
        return;
      }

      if (message.type !== "stream") return;
      const chunk = parseVoiceChunk(message.chunk);
      if (chunk === null) return;
      if (chunk.transcript) setTranscript(chunk.transcript);
      if (typeof chunk.level === "number") setLevel(chunk.level);
      if (typeof chunk.hearing === "boolean") setHearing(chunk.hearing);
      if (!chunk.voice_state) return;
      setState(chunk.voice_state);
      if (chunk.voice_state !== "idle") markVoiceActivity();
      if (chunk.voice_state === "listening") {
        setTranscript(null);
        clearError();
      } else {
        setLevel(0);
        setHearing(false);
      }
    });

    const unlistenPtt = listen<HotkeyPtt>("hotkey-ptt", ({ payload }) => {
      if (payload.phase === "blocked") {
        raise(payload.reason ?? "Push-to-talk unavailable");
      } else if (payload.phase === "down") {
        markVoiceActivity();
        clearError();
        setState("listening");
        setLevel(0);
        setHearing(false);
      } else if (payload.phase === "up") {
        markVoiceActivity();
        setLevel(0);
        setHearing(false);
      }
    });

    return () => {
      void unlistenApp.then((dispose) => dispose());
      void unlistenPtt.then((dispose) => dispose());
      if (errorTimer.current !== null) clearTimeout(errorTimer.current);
    };
  }, [clearError, raise, markVoiceActivity]);

  return { state, error, transcript, level, hearing, clearError };
}
