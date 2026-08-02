/**
 * First-run onboarding wizard tests.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { FirstRunNotice } from "../components/FirstRunNotice";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (cmd: string) => {
    if (cmd === "onboarding_scan") {
      return {
        os: "Windows",
        arch: "x86_64",
        app_count: 12,
        sample_apps: ["Notepad", "Spotify"],
      };
    }
    if (cmd === "ollama_running") return true;
    if (cmd === "open_mic_privacy_settings") return;
    if (cmd === "open_sound_settings") return;
    if (cmd === "open_trusted_https") return;
    return null;
  }),
}));

describe("FirstRunNotice onboarding", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("walks welcome → scan → permissions → finish", async () => {
    await act(async () => {
      render(<FirstRunNotice />);
    });
    expect(screen.getByLabelText(/bunny os onboarding/i)).toBeTruthy();

    await act(async () => {
      screen.getByRole("checkbox").click();
    });
    await act(async () => {
      screen.getByLabelText(/continue to system scan/i).click();
    });
    await act(async () => {
      screen.getByLabelText(/run system scan/i).click();
    });
    expect(await screen.findByText(/Saved 12 apps/i)).toBeTruthy();

    await act(async () => {
      screen.getByLabelText(/continue to ollama check/i).click();
    });
    expect(await screen.findByLabelText(/finish onboarding/i)).toBeTruthy();
    expect(await screen.findByText(/Ollama is ready/i)).toBeTruthy();

    await act(async () => {
      screen.getByLabelText(/finish onboarding/i).click();
    });
    expect(localStorage.getItem("bunnyos.onboarding.v1")).toBe("1");
    expect(screen.queryByLabelText(/bunny os onboarding/i)).toBeNull();
  });

  it("stays hidden after acknowledge", async () => {
    localStorage.setItem("bunnyos.onboarding.v1", "1");
    await act(async () => {
      render(<FirstRunNotice />);
    });
    expect(screen.queryByLabelText(/bunny os onboarding/i)).toBeNull();
  });
});
