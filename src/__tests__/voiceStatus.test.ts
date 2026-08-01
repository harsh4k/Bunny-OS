import { describe, expect, it } from "vitest";
import {
  isCancellation,
  levelBars,
  parseVoiceChunk,
  shortErrorLabel,
} from "../lib/voiceStatus";

describe("parseVoiceChunk", () => {
  it("reads voice state updates", () => {
    expect(parseVoiceChunk('{"voice_state":"thinking"}')).toEqual({
      voice_state: "thinking",
      transcript: undefined,
      level: undefined,
      hearing: undefined,
    });
  });

  it("reads transcripts", () => {
    expect(parseVoiceChunk('{"transcript":"open notepad"}')?.transcript).toBe(
      "open notepad"
    );
  });

  it("reads live mic loudness while listening", () => {
    expect(parseVoiceChunk('{"voice_state":"listening","level":0.4,"hearing":true}')).toEqual({
      voice_state: "listening",
      transcript: undefined,
      level: 0.4,
      hearing: true,
    });
  });

  it("ignores plain chat tokens streamed during a voice turn", () => {
    expect(parseVoiceChunk("Sure, opening")).toBeNull();
    expect(parseVoiceChunk("")).toBeNull();
  });

  it("ignores malformed and unrelated JSON", () => {
    expect(parseVoiceChunk("{not json")).toBeNull();
    expect(parseVoiceChunk('{"other":1}')).toBeNull();
  });
});

describe("shortErrorLabel", () => {
  const cases: Array<[string, string]> = [
    [
      "Ollama unreachable at 127.0.0.1:11434: [WinError 10061] refused. Start Ollama with: ollama serve",
      "Ollama is offline",
    ],
    [
      "Model 'llama3.2:1b' not found in Ollama. Available: none.",
      "Model not installed",
    ],
    ["No speech detected", "Didn't catch that"],
    ["sounddevice not installed. pip install sounddevice", "No microphone"],
    ["STT error: faster-whisper not installed", "Speech engine missing"],
    ["Microphone is muted", "Mic is muted"],
    ["Access is denied (microphone privacy)", "Mic permission needed"],
    ["pywin32 is required for speech output", "Speech output missing"],
    ["PyObjC is required for speech on macOS", "Speech output missing"],
    ["Chat error: Reply too long", "Reply too long"],
    ["Response exceeds 200 NDJSON lines", "Reply too long"],
    ["something nobody predicted", "Voice error"],
  ];

  it.each(cases)("maps %s", (raw, expected) => {
    expect(shortErrorLabel(raw)).toBe(expected);
  });

  it("keeps every label short enough for the capsule", () => {
    for (const [raw] of cases) {
      expect(shortErrorLabel(raw).length).toBeLessThanOrEqual(24);
    }
  });
});

describe("levelBars", () => {
  it("scales seven bars from mic loudness", () => {
    expect(levelBars(0, 7)).toHaveLength(7);
    expect(levelBars(1, 7).every((v) => v > 0.3)).toBe(true);
    expect(levelBars(0.1, 7)[0]).toBeGreaterThan(levelBars(0, 7)[0]);
  });
});

describe("isCancellation", () => {
  it("recognises the sidecar's cancel sentinel", () => {
    expect(isCancellation("cancelled")).toBe(true);
    expect(isCancellation(" Cancelled ")).toBe(true);
    expect(isCancellation("Chat error: cancelled by peer")).toBe(false);
  });
});
