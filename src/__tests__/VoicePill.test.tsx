import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { VoicePill } from "../components/VoicePill";

type Handler = (event: { payload: unknown }) => void;

// The pill subscribes to more than one channel, so handlers are keyed by name.
const handlers = new Map<string, Handler>();
const appEventHandler = (payload: unknown) =>
  handlers.get("app-event")?.({ payload });

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn((name: string, handler: Handler) => {
    handlers.set(name, handler);
    return Promise.resolve(() => {});
  }),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
}));

describe("VoicePill", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handlers.clear();
  });

  it("expands when the notification is clicked", async () => {
    const onExpand = vi.fn();
    await act(async () => {
      render(<VoicePill onExpand={onExpand} />);
    });

    fireEvent.click(screen.getByLabelText(/open bunny os/i));
    expect(onExpand).toHaveBeenCalledOnce();
  });

  it("shows listening state and allows cancellation", async () => {
    await act(async () => {
      render(<VoicePill onExpand={() => {}} />);
    });

    act(() => {
      appEventHandler({
        event: "sidecar-message",
        message: {
          type: "stream",
          id: "voice-1",
          chunk: '{"voice_state":"listening"}',
          finished: false,
        },
      });
    });

    expect(screen.getByText("Listening…")).toBeTruthy();
    const stop = screen.getByLabelText("Stop voice session");
    expect(stop).not.toBeDisabled();
    await act(async () => {
      fireEvent.click(stop);
    });
    expect(invoke).toHaveBeenCalledWith(
      "send_action",
      expect.objectContaining({
        payload: { action: "cancel_voice" },
      })
    );
  });

  it("switches to Hearing you when the mic picks up sound", async () => {
    await act(async () => {
      render(<VoicePill onExpand={() => {}} />);
    });

    act(() => {
      appEventHandler({
        event: "sidecar-message",
        message: {
          type: "stream",
          id: "voice-1",
          chunk: '{"voice_state":"listening","level":0.6,"hearing":true}',
          finished: false,
        },
      });
    });

    expect(screen.getByText("Hearing you")).toBeTruthy();
  });

  it("condenses a sidecar failure into a label that fits the capsule", async () => {
    await act(async () => {
      render(<VoicePill onExpand={() => {}} />);
    });

    act(() => {
      appEventHandler({
        event: "sidecar-message",
        message: {
          type: "error",
          id: "voice-1",
          error:
            "Ollama unreachable at 127.0.0.1:11434: [WinError 10061] No connection " +
            "could be made because the target machine actively refused it. " +
            "Start Ollama with: ollama serve",
        },
      });
    });

    expect(screen.getByText("Ollama is offline")).toBeTruthy();
    // Full text stays reachable for anyone who wants it.
    expect(screen.getByTitle(/WinError 10061/)).toBeTruthy();
  });

  it("ignores cancellation, which is a user action rather than a failure", async () => {
    await act(async () => {
      render(<VoicePill onExpand={() => {}} />);
    });

    act(() => {
      appEventHandler({
        event: "sidecar-message",
        message: { type: "error", id: "voice-1", error: "cancelled" },
      });
    });

    expect(screen.queryByText("Voice error")).toBeNull();
  });
});
