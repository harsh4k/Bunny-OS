import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { AppsPanel } from "../components/AppsPanel";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
  convertFileSrc: (path: string) => `asset://localhost/${path}`,
}));

beforeAll(() => {
  Object.defineProperty(window, "CSS", { value: { supports: () => false } });
});

describe("AppsPanel", () => {
  it("auto-rescans when list_apps returns empty", async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === "list_apps") return [];
      if (cmd === "rescan_apps") {
        return [
          {
            id: "n1",
            name: "Notepad",
            source: "start_menu",
            path: "C:\\notepad.exe",
            removable: false,
          },
        ];
      }
      if (cmd === "get_app_icon") return "C:\\icons\\n1.png";
      return undefined;
    });

    await act(async () => {
      render(<AppsPanel onClose={() => {}} />);
    });

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("list_apps");
      expect(invoke).toHaveBeenCalledWith("rescan_apps");
    });

    await waitFor(() => {
      expect(screen.getByAltText(/Notepad/i)).toBeTruthy();
    });
  });

  it("shows glyph fallback when icon missing", async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === "list_apps") {
        return [
          {
            id: "n1",
            name: "Notepad",
            source: "start_menu",
            path: "C:\\notepad.exe",
            removable: false,
          },
        ];
      }
      if (cmd === "get_app_icon") return null;
      return undefined;
    });

    await act(async () => {
      render(<AppsPanel onClose={() => {}} />);
    });

    await waitFor(() => {
      expect(screen.getByText("NO")).toBeTruthy();
    });
  });
});
