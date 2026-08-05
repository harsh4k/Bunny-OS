import { describe, expect, it, vi, beforeEach } from "vitest";
import { ensureIslandTransparency } from "../lib/islandTransparency";

const windowMock = {
  setBackgroundColor: vi.fn().mockResolvedValue(undefined),
};
const webviewMock = {
  setBackgroundColor: vi.fn().mockResolvedValue(undefined),
};

vi.mock("@tauri-apps/api/webviewWindow", () => ({
  getCurrentWebviewWindow: vi.fn(() => webviewMock),
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: vi.fn(() => windowMock),
}));

describe("ensureIslandTransparency", () => {
  beforeEach(() => {
    windowMock.setBackgroundColor.mockClear();
    webviewMock.setBackgroundColor.mockClear();
  });

  it("clears window and webview background", async () => {
    await ensureIslandTransparency();

    expect(windowMock.setBackgroundColor).toHaveBeenCalledWith({
      red: 0,
      green: 0,
      blue: 0,
      alpha: 0,
    });
    expect(webviewMock.setBackgroundColor).toHaveBeenCalledWith({
      red: 0,
      green: 0,
      blue: 0,
      alpha: 0,
    });
  });
});
