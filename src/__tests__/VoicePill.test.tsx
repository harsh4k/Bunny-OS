import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { VoicePill } from "../components/VoicePill";

type Handler = (event: { payload: unknown }) => void;

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

  it("shows rotating Claude-style status while listening", async () => {
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

    expect(screen.getByText(/\w+/)).toBeTruthy();
    expect(screen.queryByLabelText("Stop voice session")).toBeNull();
    expect(screen.queryByText(/Hold/i)).toBeNull();
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
    expect(screen.getByTitle("Ollama is offline")).toBeTruthy();
    expect(screen.queryByTitle(/WinError 10061/)).toBeNull();
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

  it("morphs to the compact tuck when closed", async () => {
    await act(async () => {
      render(<VoicePill open={false} onExpand={() => {}} />);
    });

    const pill = document.querySelector("[data-open]") as HTMLElement | null;
    expect(pill?.getAttribute("data-open")).toBe("false");
  });
});
