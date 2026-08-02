/**
 * Smoke tests for CompactPanel rendering.
 * Mocks Tauri APIs (not available in jsdom).
 */
import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { CompactPanel } from "../components/CompactPanel";

// Mock @tauri-apps/api/event and @tauri-apps/api/core
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockImplementation(async (cmd: string) => {
    if (cmd === "get_lifecycle") return "stopped";
    if (cmd === "get_mic_muted") return true;
    if (cmd === "ollama_running") return false;
    if (cmd === "list_apps") return [];
    return undefined;
  }),
}));

// Silence CSS.supports missing in jsdom
beforeAll(() => {
  Object.defineProperty(window, "CSS", { value: { supports: () => false } });
});

describe("CompactPanel", () => {
  it("renders without crashing", async () => {
    await act(async () => {
      render(<CompactPanel />);
    });
    expect(screen.getAllByText("Bunny OS").length).toBeGreaterThan(0);
  });

  it("shows Quit button", async () => {
    await act(async () => {
      render(<CompactPanel />);
    });
    expect(screen.getByRole("button", { name: /^quit$/i })).toBeTruthy();
  });

  it("shows microphone mute toggle button", async () => {
    await act(async () => {
      render(<CompactPanel />);
    });
    // Query by aria-label; text also appears in the status info row
    expect(screen.getByLabelText(/mute microphone/i)).toBeTruthy();
  });

  it("calls onClose when hide button clicked", async () => {
    const onClose = vi.fn();
    await act(async () => {
      render(<CompactPanel onClose={onClose} />);
    });
    screen.getByLabelText("Hide window").click();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("clears listen lock after push-to-talk release", async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === "get_lifecycle") return "ready";
      if (cmd === "get_mic_muted") return false;
      if (cmd === "ollama_running") return true;
      if (cmd === "list_apps") return [{ name: "Notepad" }];
      return undefined;
    });

    await act(async () => {
      render(<CompactPanel micMuted={false} onMicMutedChange={() => {}} />);
    });

    const talk = screen.getByLabelText("Push to talk");
    expect(talk).not.toBeDisabled();

    await act(async () => {
      talk.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    });
    await act(async () => {
      talk.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    });

    expect(invoke).toHaveBeenCalledWith(
      "send_action",
      expect.objectContaining({
        payload: { action: "stop_listen" },
      })
    );

    // Second press must still work (listenId cleared in finally).
    await act(async () => {
      talk.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    });
    expect(invoke).toHaveBeenCalledWith(
      "send_action",
      expect.objectContaining({
        payload: expect.objectContaining({ action: "start_listen" }),
      })
    );
  });
});
