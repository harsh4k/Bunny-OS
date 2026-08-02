/**
 * UpdatesPanel smoke tests.
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

describe("UpdatesPanel", () => {
  beforeEach(() => {
    vi.mocked(invoke).mockReset();
  });

  it("shows installed version", async () => {
    render(<UpdatesPanel onClose={() => {}} />);
    expect(await screen.findByTestId("installed-version")).toHaveTextContent(
      "Bunny OS 0.1.0"
    );
  });

  it("Compare with latest shows GitHub result", async () => {
    vi.mocked(invoke).mockResolvedValueOnce({
      current: "0.1.0",
      latest: "0.2.0",
      newer: true,
      release_url: "https://github.com/harsh4k/Bunny-OS/releases",
      html_url: "https://github.com/harsh4k/Bunny-OS/releases/tag/v0.2.0",
      message: "A newer release is available: 0.2.0.",
    });
    render(<UpdatesPanel onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /Compare with latest/i }));
    await waitFor(() => {
      expect(screen.getByTestId("update-check-result")).toHaveTextContent(
        /Update available/i
      );
    });
    expect(invoke).toHaveBeenCalledWith("check_github_release");
  });

  it("Open Releases invokes open_releases_page", async () => {
    vi.mocked(invoke).mockResolvedValueOnce(undefined);
    render(<UpdatesPanel onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /Open Releases/i }));
    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("open_releases_page");
    });
  });
});
