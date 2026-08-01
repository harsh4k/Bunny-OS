/**
 * Voice stream parsing + error wording.
 *
 * The collapsed pill is a fixed-width capsule, so raw sidecar errors (which run
 * to a couple of sentences) can never be shown there. Every failure is mapped
 * to a short phrase that fits; the full text stays available for the dashboard.
 */

export interface VoiceChunk {
  voice_state?: string;
  transcript?: string;
  /** 0–1 mic loudness while listening. */
  level?: number;
  /** True when the mic is picking up speech-level sound. */
  hearing?: boolean;
}

/** Voice states where Bunny is actively doing something. */
export const ACTIVE_VOICE_STATES = new Set([
  "listening",
  "transcribing",
  "thinking",
  "speaking",
]);

/** Parse a sidecar stream chunk. Returns null for plain chat tokens. */
export function parseVoiceChunk(chunk: string): VoiceChunk | null {
  if (!chunk.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(chunk) as unknown;
    if (typeof parsed !== "object" || parsed === null) return null;
    const { voice_state, transcript, level, hearing } = parsed as VoiceChunk;
    if (
      typeof voice_state !== "string" &&
      typeof transcript !== "string" &&
      typeof level !== "number" &&
      typeof hearing !== "boolean"
    ) {
      return null;
    }
    return {
      voice_state,
      transcript,
      level: typeof level === "number" ? clamp01(level) : undefined,
      hearing: typeof hearing === "boolean" ? hearing : undefined,
    };
  } catch {
    return null;
  }
}

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

/** Cancelling is a user action, not a failure worth reporting. */
export function isCancellation(error: string): boolean {
  return error.trim().toLowerCase() === "cancelled";
}

/**
 * Plain-language error for any UI surface. Never forwards file paths,
 * `pip install` hints, curl exit codes, or Rust Debug output to the user.
 */
export function friendlyError(error: string): string {
  const text = error.toLowerCase();

  if (
    text.includes("failed to spawn sidecar") ||
    text.includes("sidecar binary not found") ||
    text.includes("handshake timed out") ||
    text.includes("expected ready message") ||
    text.includes("sidecar exited unexpectedly") ||
    text.includes("sidecar i/o error")
  ) {
    return "Bunny’s helper didn’t start. Tap Recover.";
  }
  if (
    text.includes("unreachable") ||
    text.includes("ollama serve") ||
    text.includes("could not start ollama") ||
    text.includes("download failed") ||
    text.includes("could not run curl") ||
    text.includes("ollamasetup")
  ) {
    return "Ollama isn’t ready. Check your internet and try again.";
  }
  if (text.includes("not found in ollama") || text.includes("no chat model")) {
    return "No chat model is installed yet. Open Models to add one.";
  }
  if (text.includes("no speech detected")) return "I didn’t catch that.";
  if (text.includes("sounddevice") || text.includes("no input device")) {
    return "No microphone found.";
  }
  if (text.includes("access is denied") || text.includes("privacy")) {
    return "Mic permission needed. Open Windows privacy settings.";
  }
  // Package missing — do NOT match HF cache paths like "...faster-whisper-base..."
  if (
    text.includes("faster-whisper not installed") ||
    text.includes("no module named 'faster_whisper'") ||
    text.includes("speech engine missing from this")
  ) {
    return "Speech engine missing from this install. Reinstall Bunny OS.";
  }
  if (
    text.includes("model.bin") ||
    text.includes("could not load the speech model")
  ) {
    return "Speech model isn’t ready yet. Try again in a moment.";
  }
  if (
    text.includes("pywin32") ||
    text.includes("pyobjc") ||
    text.includes("nsspeech")
  ) {
    return "Speech output isn’t available on this PC.";
  }
  if (text.includes("muted")) return "Your microphone is muted.";
  if (text.includes("still finishing") || text.includes("already running")) {
    return "Still finishing the last request.";
  }
  if (text.includes("not valid json") || text.includes("unexpected shape")) {
    return "The model reply couldn’t be read.";
  }
  if (text.includes("empty answer")) return "The model said nothing.";
  if (text.includes("interrupted before")) return "That turn was interrupted.";
  if (text.includes("reply too long") || text.includes("exceeds")) {
    return "That reply got too long. Try a shorter question.";
  }
  if (text.includes("timed out")) return "That took too long. Try again.";
  if (text.includes("cancelled")) return "Cancelled.";
  return "Something went wrong. Try again.";
}

/** Condense a sidecar error into something that fits the capsule. */
export function shortErrorLabel(error: string): string {
  const text = error.toLowerCase();
  if (
    text.includes("failed to spawn sidecar") ||
    text.includes("sidecar binary not found") ||
    text.includes("handshake timed out") ||
    text.includes("sidecar exited")
  ) {
    return "Helper not running";
  }
  if (
    text.includes("unreachable") ||
    text.includes("ollama serve") ||
    text.includes("download failed") ||
    text.includes("ollamasetup")
  ) {
    return "Ollama is offline";
  }
  if (text.includes("not found in ollama") || text.includes("no chat model")) {
    return "Model not installed";
  }
  if (text.includes("no speech detected")) return "Didn't catch that";
  if (text.includes("sounddevice") || text.includes("no input device")) {
    return "No microphone";
  }
  if (text.includes("access is denied") || text.includes("privacy")) {
    return "Mic permission needed";
  }
  if (
    text.includes("faster-whisper not installed") ||
    text.includes("no module named 'faster_whisper'") ||
    text.includes("speech engine missing from this")
  ) {
    return "Speech engine missing";
  }
  if (
    text.includes("model.bin") ||
    text.includes("could not load the speech model")
  ) {
    return "Speech model missing";
  }
  if (
    text.includes("pywin32") ||
    text.includes("pyobjc") ||
    text.includes("nsspeech")
  ) {
    return "Speech output missing";
  }
  if (text.includes("muted")) return "Mic is muted";
  if (text.includes("still finishing") || text.includes("already running")) {
    return "Still finishing up";
  }
  if (text.includes("not valid json") || text.includes("unexpected shape")) {
    return "Model reply unreadable";
  }
  if (text.includes("empty answer")) return "Model said nothing";
  if (text.includes("interrupted before")) return "Turn interrupted";
  if (text.includes("reply too long") || text.includes("exceeds")) {
    return "Reply too long";
  }
  if (text.includes("timed out")) return "Timed out";
  return "Voice error";
}

/** Bar heights (0–1) for a 7-bar meter driven by mic loudness. */
export function levelBars(level: number, count = 7): number[] {
  const safe = clamp01(level);
  return Array.from({ length: count }, (_, index) => {
    const peak = (index + 1) / count;
    if (safe >= peak) return 0.35 + safe * 0.65;
    if (safe >= peak - 1 / count) {
      const local = (safe - (peak - 1 / count)) * count;
      return 0.2 + local * 0.8;
    }
    return 0.18;
  });
}
