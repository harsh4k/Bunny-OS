import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppEvent } from "~contracts/ipc";
import {
  __handleVoiceTurnEventForTests,
  __resetVoiceTurnsForTests,
  getVoiceTurns,
} from "../lib/voiceTurns";

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async () => () => {}),
}));

function stream(id: string, chunk: string, finished = false): AppEvent {
  return {
    event: "sidecar-message",
    message: { type: "stream", id, chunk, finished },
  };
}

function error(id: string, message: string): AppEvent {
  return {
    event: "sidecar-message",
    message: { type: "error", id, error: message },
  };
}

describe("voiceTurns store", () => {
  beforeEach(() => {
    __resetVoiceTurnsForTests();
  });

  it("records transcript plus plain-text reply for a voice turn", () => {
    __handleVoiceTurnEventForTests(stream("v1", '{"voice_state":"listening"}'));
    __handleVoiceTurnEventForTests(stream("v1", '{"transcript":"what can you do?"}'));
    __handleVoiceTurnEventForTests(stream("v1", "I can open apps"));
    __handleVoiceTurnEventForTests(stream("v1", " and answer questions."));
    __handleVoiceTurnEventForTests(stream("v1", '{"voice_state":"idle"}'));

    expect(getVoiceTurns()).toEqual([
      {
        id: "v1",
        transcript: "what can you do?",
        reply: "I can open apps and answer questions.",
        error: null,
        at: expect.any(Number),
      },
    ]);
  });

  it("ignores typed-chat streams that never open a voice turn", () => {
    __handleVoiceTurnEventForTests(stream("typed-1", "Hello from typed chat"));
    __handleVoiceTurnEventForTests(stream("typed-1", "", true));
    expect(getVoiceTurns()).toEqual([]);
  });

  it("closes with the sidecar error text", () => {
    __handleVoiceTurnEventForTests(stream("v2", '{"voice_state":"listening"}'));
    __handleVoiceTurnEventForTests(stream("v2", '{"transcript":"hello"}'));
    __handleVoiceTurnEventForTests(error("v2", "Chat error: Reply too long"));

    expect(getVoiceTurns()[0]?.error).toBe("Chat error: Reply too long");
    expect(getVoiceTurns()[0]?.transcript).toBe("hello");
  });

  it("drops empty cancelled turns", () => {
    __handleVoiceTurnEventForTests(stream("v3", '{"voice_state":"listening"}'));
    __handleVoiceTurnEventForTests(error("v3", "cancelled"));
    expect(getVoiceTurns()).toEqual([]);
  });
});
