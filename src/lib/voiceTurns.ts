/**
 * Global store of completed voice turns for the Chat panel.
 *
 * Mounted once at module load via `ensureVoiceTurnsListening`. A single
 * listener is required — `useVoiceStatus` is mounted in both App and VoicePill,
 * so accumulating inside that hook would double-count every token.
 *
 * Plain-text stream chunks (the ones `parseVoiceChunk` discards) are the reply.
 * JSON voice chunks carry transcript / state. A turn closes on idle or error.
 */
import { useSyncExternalStore } from "react";
import { listen } from "@tauri-apps/api/event";
import type { AppEvent } from "~contracts/ipc";
import { isCancellation, parseVoiceChunk } from "./voiceStatus";

export interface VoiceTurn {
  id: string;
  transcript: string;
  reply: string;
  error: string | null;
  at: number;
}

const MAX_TURNS = 50;

let turns: VoiceTurn[] = [];
let open: VoiceTurn | null = null;
let listeners = new Set<() => void>();
let started = false;

function notify(): void {
  for (const listener of listeners) listener();
}

function snapshot(): VoiceTurn[] {
  return turns;
}

function pushClosed(turn: VoiceTurn): void {
  // Skip empty cancelled turns that never transcribed anything.
  if (!turn.transcript && !turn.reply && !turn.error) return;
  turns = [...turns, turn].slice(-MAX_TURNS);
  notify();
}

function closeOpen(error: string | null = null): void {
  if (!open) return;
  const closed: VoiceTurn = {
    ...open,
    error: error ?? open.error,
  };
  open = null;
  pushClosed(closed);
}

function ensureOpen(id: string): VoiceTurn {
  if (open && open.id === id) return open;
  if (open) closeOpen(null);
  open = { id, transcript: "", reply: "", error: null, at: Date.now() };
  return open;
}

function handleAppEvent(payload: AppEvent): void {
  if (payload.event !== "sidecar-message") return;
  const message = payload.message;

  if (message.type === "error") {
    if (open && message.id === open.id) {
      if (isCancellation(message.error)) {
        closeOpen(null);
      } else {
        closeOpen(message.error);
      }
    }
    return;
  }

  if (message.type !== "stream") return;

  const chunk = message.chunk;
  const voice = parseVoiceChunk(chunk);
  if (voice) {
    if (voice.voice_state === "listening") {
      ensureOpen(message.id);
      return;
    }
    if (typeof voice.transcript === "string" && voice.transcript) {
      const turn = ensureOpen(message.id);
      turn.transcript = voice.transcript;
      return;
    }
    if (voice.voice_state === "idle" && open?.id === message.id) {
      closeOpen(null);
    }
    return;
  }

  // Plain-text reply token from the chat stream during an open voice turn.
  if (open && message.id === open.id && chunk && !message.finished) {
    open.reply += chunk;
  }
}

/** Start the single global listener. Safe to call many times. */
export function ensureVoiceTurnsListening(): void {
  if (started) return;
  started = true;
  void listen<AppEvent>("app-event", ({ payload }) => {
    handleAppEvent(payload);
  });
}

export function subscribeVoiceTurns(onStoreChange: () => void): () => void {
  ensureVoiceTurnsListening();
  listeners.add(onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
  };
}

export function getVoiceTurns(): VoiceTurn[] {
  return snapshot();
}

/** Test-only: inject an event without going through Tauri. */
export function __handleVoiceTurnEventForTests(payload: AppEvent): void {
  handleAppEvent(payload);
}

/** Test-only: wipe state between cases. */
export function __resetVoiceTurnsForTests(): void {
  turns = [];
  open = null;
  notify();
}

export function useVoiceTurns(): VoiceTurn[] {
  return useSyncExternalStore(subscribeVoiceTurns, getVoiceTurns, getVoiceTurns);
}
