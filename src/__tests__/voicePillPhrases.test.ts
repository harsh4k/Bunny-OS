import { describe, expect, it } from "vitest";
import {
  SPINNER_PHRASES,
  pickSpinnerPhrase,
  voicePillCopy,
} from "../lib/voicePillPhrases";

describe("voicePillPhrases", () => {
  it("cycles shuffled spinner verbs by tick", () => {
    const first = pickSpinnerPhrase("thinking", 0);
    const second = pickSpinnerPhrase("thinking", 1);
    expect(SPINNER_PHRASES.thinking).toContain(first);
    expect(SPINNER_PHRASES.thinking).toContain(second);
    expect(first).not.toBe(second);
    expect(pickSpinnerPhrase("thinking", SPINNER_PHRASES.thinking.length)).toBe(
      first
    );
  });

  it("does not walk phrases in alphabetical order", () => {
    const alphaHead = SPINNER_PHRASES.thinking.slice(0, 10);
    const picked = Array.from({ length: 10 }, (_, i) =>
      pickSpinnerPhrase("thinking", i)
    );
    expect(picked).not.toEqual(alphaHead);
  });

  it("includes Claude-style thinking words", () => {
    expect(SPINNER_PHRASES.thinking).toContain("Cooking");
    expect(SPINNER_PHRASES.thinking).toContain("Vibing");
    expect(SPINNER_PHRASES.thinking).toContain("Flibbertigibbeting");
    expect(SPINNER_PHRASES.thinking).toContain("Marinating");
    expect(SPINNER_PHRASES.thinking.length).toBeGreaterThanOrEqual(185);
  });

  it("shows plain rotating phrases — no ellipsis, hotkeys, or subtitles", () => {
    const idle = voicePillCopy({
      voiceState: "idle",
      hearing: false,
      error: null,
      spinnerTick: 0,
      shortError: (m) => m,
    });
    expect(idle.title).not.toMatch(/…|\.\.\.$/);
    expect(idle.subtitle).toBeUndefined();
    expect(SPINNER_PHRASES.thinking).toContain(idle.title);

    const listening = voicePillCopy({
      voiceState: "listening",
      hearing: false,
      error: null,
      spinnerTick: 0,
      shortError: (m) => m,
    });
    expect(listening.title).not.toMatch(/…|\.\.\.$/);
    expect(SPINNER_PHRASES.transcribing).toContain(listening.title);

    const thinking = voicePillCopy({
      voiceState: "thinking",
      hearing: false,
      error: null,
      spinnerTick: 3,
      shortError: (m) => m,
    });
    expect(thinking.title).not.toMatch(/…|\.\.\.$/);
    expect(thinking.subtitle).toBeUndefined();
  });
});
