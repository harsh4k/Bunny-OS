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

function emitPending(pendingId = "p-1") {
  const payload = {
    event: "sidecar-message",
    message: {
      type: "stream",
      id: "voice-1",
      chunk: JSON.stringify({
        browser_confirm_pending: true,
        pending_id: pendingId,
        summary: 'Type "hello" into the focused window',
        action_kind: "browser_type",
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
