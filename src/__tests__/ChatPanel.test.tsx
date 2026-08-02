/**
 * Tests for ChatPanel component.
 *
 * Covers:
 *  - Renders with disabled Send when input is empty
 *  - Send enabled when input non-empty and sidecarReady
 *  - Prevents duplicate sends during streaming
 *  - Keyboard Enter sends message; Shift+Enter does not
 *  - Streaming text displayed progressively
 *  - Action card shown when AssistantResult.kind === "action"
 *  - Error message shown on sidecar error
 *  - Audit events listed
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";
import { ChatPanel } from "../components/ChatPanel";

// ── Shared state for listener simulation ──────────────────────────────────────

type Listener = (e: { payload: unknown }) => void;
const _listeners: Map<string, Listener[]> = new Map();

function simulateEvent(channel: string, payload: unknown) {
  (_listeners.get(channel) ?? []).forEach((fn) => fn({ payload }));
}

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async (channel: string, handler: Listener) => {
    const list = _listeners.get(channel) ?? [];
    list.push(handler);
    _listeners.set(channel, list);
    return () => {
      const updated = (_listeners.get(channel) ?? []).filter((h) => h !== handler);
      _listeners.set(channel, updated);
    };
  }),
}));

const mockInvoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

beforeAll(() => {
  Object.defineProperty(window, "CSS", { value: { supports: () => false } });
  Object.defineProperty(window, "crypto", {
    value: { randomUUID: () => "test-uuid-1234" },
  });
});

// invoke() must always return a promise — the panel chains .catch on it.
beforeEach(() => {
  mockInvoke.mockResolvedValue("stopped");
});

afterEach(() => {
  vi.clearAllMocks();
  _listeners.clear();
});

// ── Helper ────────────────────────────────────────────────────────────────────

function sidecarMessage(msg: object) {
  simulateEvent("app-event", { event: "sidecar-message", message: msg });
}

function renderChat(ready = true) {
  const onClose = vi.fn();
  const utils = render(<ChatPanel onClose={onClose} sidecarReady={ready} />);
  return { ...utils, onClose };
}

// ── Render ────────────────────────────────────────────────────────────────────

describe("ChatPanel — rendering", () => {
  it("renders without crashing", async () => {
    await act(async () => { renderChat(); });
    expect(screen.getByRole("dialog", { name: /type to bunny/i })).toBeTruthy();
  });

  it("shows model input with default value", async () => {
    await act(async () => { renderChat(); });
    const input = screen.getByLabelText(/ollama model name/i) as HTMLInputElement;
    expect(input.value).toBe("llama3.2:1b-instruct-q4_K_M");
  });

  it("shows Send button", async () => {
    await act(async () => { renderChat(); });
    expect(screen.getByLabelText("Send message")).toBeTruthy();
  });

  it("Send is disabled when textarea is empty", async () => {
    await act(async () => { renderChat(); });
    const btn = screen.getByLabelText("Send message") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it("Send is disabled when sidecarReady=false", async () => {
    await act(async () => { renderChat(false); });
    const textarea = screen.getByLabelText("Message input");
    fireEvent.change(textarea, { target: { value: "hello" } });
    const btn = screen.getByLabelText("Send message") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it("closes when close button clicked", async () => {
    const { onClose } = await act(async () => renderChat());
    screen.getByLabelText("Back to learning").click();
    expect(onClose).toHaveBeenCalledOnce();
  });
});

// ── Input handling ────────────────────────────────────────────────────────────

describe("ChatPanel — input", () => {
  it("Send becomes enabled when text is entered and sidecar ready", async () => {
    await act(async () => { renderChat(); });
    const textarea = screen.getByLabelText("Message input");
    await act(async () => {
      fireEvent.change(textarea, { target: { value: "hello" } });
    });
    const btn = screen.getByLabelText("Send message") as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
  });

  it("Enter key sends message", async () => {
    mockInvoke.mockResolvedValue(undefined);
    await act(async () => { renderChat(); });
    const textarea = screen.getByLabelText("Message input");
    await act(async () => {
      fireEvent.change(textarea, { target: { value: "test message" } });
    });
    await act(async () => {
      fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });
    });
    expect(mockInvoke).toHaveBeenCalledWith(
      "send_action",
      expect.objectContaining({ payload: expect.objectContaining({ action: "chat" }) })
    );
  });

  it("Shift+Enter does NOT send message", async () => {
    await act(async () => { renderChat(); });
    const textarea = screen.getByLabelText("Message input");
    await act(async () => {
      fireEvent.change(textarea, { target: { value: "test" } });
    });
    await act(async () => {
      fireEvent.keyDown(textarea, { key: "Enter", shiftKey: true });
    });
    // The panel also resolves a default model on mount, so assert on the
    // chat action specifically rather than on send_action as a whole.
    expect(mockInvoke).not.toHaveBeenCalledWith(
      "send_action",
      expect.objectContaining({ payload: expect.objectContaining({ action: "chat" }) })
    );
  });
});

// ── Streaming flow ────────────────────────────────────────────────────────────

describe("ChatPanel — streaming", () => {
  it("shows Cancel button during streaming", async () => {
    mockInvoke.mockResolvedValue(undefined);
    await act(async () => { renderChat(); });
    const textarea = screen.getByLabelText("Message input");

    await act(async () => {
      fireEvent.change(textarea, { target: { value: "hello" } });
      fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });
    });

    expect(screen.getByLabelText("Cancel streaming")).toBeTruthy();
  });

  it("disables Send during streaming (prevents duplicates)", async () => {
    mockInvoke.mockResolvedValue(undefined);
    await act(async () => { renderChat(); });
    const textarea = screen.getByLabelText("Message input");

    await act(async () => {
      fireEvent.change(textarea, { target: { value: "hello" } });
      fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });
    });

    // Send button replaced by Cancel during streaming
    expect(screen.queryByLabelText("Send message")).toBeNull();
  });

  it("shows streaming text chunks", async () => {
    mockInvoke.mockResolvedValue(undefined);
    await act(async () => { renderChat(); });
    const textarea = screen.getByLabelText("Message input");

    await act(async () => {
      fireEvent.change(textarea, { target: { value: "hi" } });
      fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });
    });

    await act(async () => {
      sidecarMessage({ type: "stream", id: "test-uuid-1234", chunk: "Hello", finished: false });
    });

    expect(screen.getByText("Hello")).toBeTruthy();
  });

  it("ignores stream events for different request IDs", async () => {
    mockInvoke.mockResolvedValue(undefined);
    await act(async () => { renderChat(); });
    const textarea = screen.getByLabelText("Message input");

    await act(async () => {
      fireEvent.change(textarea, { target: { value: "hi" } });
      fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });
    });

    await act(async () => {
      sidecarMessage({ type: "stream", id: "other-uuid", chunk: "INJECTED", finished: false });
    });

    expect(screen.queryByText("INJECTED")).toBeNull();
  });

  it("Cancel sends cancel_chat with the active request id", async () => {
    mockInvoke.mockResolvedValue(undefined);
    await act(async () => { renderChat(); });
    const textarea = screen.getByLabelText("Message input");

    await act(async () => {
      fireEvent.change(textarea, { target: { value: "hello" } });
      fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });
    });

    await act(async () => {
      screen.getByLabelText("Cancel streaming").click();
    });

    expect(mockInvoke).toHaveBeenCalledWith(
      "send_action",
      expect.objectContaining({
        payload: { action: "cancel_chat", request_id: "test-uuid-1234" },
      })
    );
  });
});

// ── Response handling ─────────────────────────────────────────────────────────

describe("ChatPanel — response handling", () => {
  it("shows action card for kind:action result", async () => {
    mockInvoke.mockResolvedValue(undefined);
    await act(async () => { renderChat(); });
    const textarea = screen.getByLabelText("Message input");

    await act(async () => {
      fireEvent.change(textarea, { target: { value: "open google" } });
      fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });
    });

    await act(async () => {
      sidecarMessage({ type: "stream", id: "test-uuid-1234", chunk: "", finished: true });
      sidecarMessage({
        type: "response",
        id: "test-uuid-1234",
        result: JSON.stringify({
          kind: "action",
          action: { action: "open_url", url: "https://google.com" },
        }),
      });
    });

    expect(screen.getByRole("region", { name: /proposed action/i })).toBeTruthy();
    expect(screen.getByLabelText(/execute:/i)).toBeTruthy();
  });

  it("shows error on sidecar error message", async () => {
    mockInvoke.mockResolvedValue(undefined);
    await act(async () => { renderChat(); });
    const textarea = screen.getByLabelText("Message input");

    await act(async () => {
      fireEvent.change(textarea, { target: { value: "hi" } });
      fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });
    });

    await act(async () => {
      sidecarMessage({
        type: "error",
        id: "test-uuid-1234",
        error: "Model not found in Ollama",
      });
    });

    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByText(/no chat model is installed/i)).toBeTruthy();
  });

  it("shows model error with actionable message", async () => {
    mockInvoke.mockResolvedValue(undefined);
    await act(async () => { renderChat(); });
    const textarea = screen.getByLabelText("Message input");

    await act(async () => {
      fireEvent.change(textarea, { target: { value: "hi" } });
      fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });
    });

    await act(async () => {
      sidecarMessage({
        type: "error",
        id: "test-uuid-1234",
        error: "Model 'bad:model' not found in Ollama. Available: llama3.2. Pull with: ollama pull <model>",
      });
    });

    expect(screen.getByText(/open models to add one/i)).toBeTruthy();
  });
});
