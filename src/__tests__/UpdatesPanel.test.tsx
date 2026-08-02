/**
 * UpdatesPanel — status board smoke tests.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { UpdatesPanel } from "../components/UpdatesPanel";

vi.mock("@tauri-apps/api/app", () => ({
  getVersion: vi.fn(async () => "0.1.0"),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

import { invoke } from "@tauri-apps/api/core";

const board = {
  bunny_version: "0.1.0",
  ollama: {
    title: "Ollama",
    state: "Missing",
    detail: "Ollama is not installed.",
    needs_attention: true,
  },
  models: {
    title: "Chat models",
    state: "Unknown",
    detail: "Start Ollama to see installed chat models.",
    needs_attention: true,
    recommended: "llama3.2:1b",
    recommended_present: false,
    installed: [] as string[],
  },
  voice: {
    title: "Voice (sidecar + Whisper)",
    state: "Bundled",
    detail: "Speech engines ship inside Bunny OS.",
    needs_attention: false,
  },
};

describe("UpdatesPanel", () => {
  beforeEach(() => {
    vi.mocked(invoke).mockReset();
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === "get_dependency_board") return board;
      return undefined;
    });
  });

  it("shows status board rows", async () => {
    render(<UpdatesPanel onClose={() => {}} />);
    expect(await screen.findByTestId("row-bunny")).toBeInTheDocument();
    expect(screen.getByTestId("row-ollama")).toHaveAttribute(
      "data-needs-attention",
      "true"
    );
    expect(screen.getByTestId("row-voice")).toHaveAttribute(
      "data-needs-attention",
      "false"
    );
    expect(await screen.findByTestId("installed-version")).toHaveTextContent(
      "0.1.0"
    );
  });

  it("Compare with latest shows GitHub result", async () => {
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === "get_dependency_board") return board;
      if (cmd === "check_github_release") {
        return {
          current: "0.1.0",
          latest: "0.2.0",
          newer: true,
          release_url: "https://github.com/harsh4k/Bunny-OS/releases",
          html_url: "https://github.com/harsh4k/Bunny-OS/releases/tag/v0.2.0",
          message: "A newer release is available: 0.2.0.",
        };
      }
      return undefined;
    });
    render(<UpdatesPanel onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /Compare with latest/i }));
    await waitFor(() => {
      expect(screen.getByTestId("update-check-result")).toHaveTextContent(
        /Update available/i
      );
    });
  });

  it("Install / start Ollama invokes ensure_ollama", async () => {
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === "get_dependency_board") return board;
      if (cmd === "ensure_ollama") return "Ollama started";
      return undefined;
    });
    render(<UpdatesPanel onClose={() => {}} />);
    fireEvent.click(
      await screen.findByRole("button", { name: /Install \/ start Ollama/i })
    );
    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("ensure_ollama");
    });
  });
});
