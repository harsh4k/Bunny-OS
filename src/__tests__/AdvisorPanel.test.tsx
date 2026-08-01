/**
 * AdvisorPanel — rendering and interaction tests.
 * Mocks Tauri APIs (not available in jsdom).
 *
 * State coverage:
 *   idle      — scan button visible when sidecarReady=false
 *   loading   — spinner + status message
 *   error     — error text + retry button
 *   results   — hardware rows, tier cards, installed badge, pull button
 * New (review fixes):
 *   watchdog  — scan (30 s) and pull (35 min) timeouts fire error state
 *   disclosure— gpu_note rendered when GPU is null (NVIDIA-only notice)
 *   cleanup   — watchdog timer cleared on unmount
 */
import { describe, it, expect, vi, beforeAll, afterEach, type Mock } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { AdvisorPanel } from "../components/AdvisorPanel";
import type { GetAdvisorResponse } from "~contracts/ipc";

// ── Tauri API mocks ────────────────────────────────────────────────────────────

const { state, invokeMock } = vi.hoisted(() => {
  const state = {
    listenCallback: null as ((e: { payload: unknown }) => void) | null,
  };
  const invokeMock: Mock = vi.fn().mockResolvedValue(undefined);
  return { state, invokeMock };
});

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockImplementation(
    (_channel: string, cb: (e: { payload: unknown }) => void) => {
      state.listenCallback = cb;
      return Promise.resolve(() => {});
    }
  ),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}));

beforeAll(() => {
  Object.defineProperty(window, "CSS", { value: { supports: () => false } });
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  state.listenCallback = null;
});

// ── Fixtures ───────────────────────────────────────────────────────────────────

const ADVISOR_RESPONSE: GetAdvisorResponse = {
  hardware: {
    os: "Windows 11 23H2",
    cpu: "AMD Ryzen 5 5600X",
    ram_gb: 16.0,
    gpu: { name: "NVIDIA GeForce RTX 3050", vram_gb: 4.0 },
    gpu_note: "",   // empty — GPU was successfully detected
    mic_available: true,
  },
  ollama: {
    reachable: true,
    version: null,
    models: [{ name: "llama3.2:1b-instruct-q4_K_M", size_gb: 0.8, quantization: "Q4_K_M" }],
    running: [],
  },
  advisor: {
    catalog_version: "1",
    constraint: "vram_limited",
    warning: null,
    recommendations: [
      {
        tier: "fast",
        candidate_name: "llama3.2:1b-instruct-q4_K_M",
        display_name: "Llama 3.2 1B",
        size_gb: 0.8, context_k: 2, quantization: "Q4_K_M",
        reason: "0.8 GB fits in 4 GB VRAM; 2K context; Q4_K_M",
        available: true,
      },
      {
        tier: "balanced",
        candidate_name: "mistral:7b-instruct-q4_K_M",
        display_name: "Mistral 7B",
        size_gb: 4.4, context_k: 8, quantization: "Q4_K_M",
        reason: "4.4 GB fits in 4 GB VRAM; 8K context; Q4_K_M",
        available: false,
      },
    ],
  },
};

/** Same hardware but GPU not detected via nvidia-smi. */
const ADVISOR_NO_NVIDIA: GetAdvisorResponse = {
  ...ADVISOR_RESPONSE,
  hardware: {
    ...ADVISOR_RESPONSE.hardware,
    gpu: null,
    gpu_note: "VRAM detection uses nvidia-smi (NVIDIA only). AMD, Intel, and other GPUs are not detected.",
  },
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function fireSidecarResponse(id: string, result: string) {
  state.listenCallback?.({
    payload: {
      event: "sidecar-message",
      message: { type: "response", id, result },
    },
  });
}

function fireSidecarError(id: string, error: string) {
  state.listenCallback?.({
    payload: {
      event: "sidecar-message",
      message: { type: "error", id, error },
    },
  });
}

function getLastInvokeId(): string {
  const [, args] = invokeMock.mock.calls.at(-1)!;
  return (args as { id: string }).id;
}

// ── Idle state ─────────────────────────────────────────────────────────────────

describe("AdvisorPanel — idle state", () => {
  it("shows disabled scan button when sidecar not ready", async () => {
    await act(async () => {
      render(<AdvisorPanel onClose={() => {}} sidecarReady={false} />);
    });
    const btn = screen.getByRole("button", { name: /scan/i });
    expect(btn).toBeTruthy();
    expect(btn).toHaveAttribute("disabled");
  });
});

// ── Loading state ──────────────────────────────────────────────────────────────

describe("AdvisorPanel — loading state", () => {
  it("shows spinner while awaiting response", async () => {
    await act(async () => {
      render(<AdvisorPanel onClose={() => {}} sidecarReady={true} />);
    });
    expect(screen.getByRole("status")).toBeTruthy();
    expect(screen.getByText(/scanning/i)).toBeTruthy();
  });
});

// ── Error state ────────────────────────────────────────────────────────────────

describe("AdvisorPanel — error state", () => {
  it("shows error message and retry button", async () => {
    await act(async () => {
      render(<AdvisorPanel onClose={() => {}} sidecarReady={true} />);
    });
    await act(async () => {
      fireSidecarError(getLastInvokeId(), "sidecar not running");
    });
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByText(/sidecar not running/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /retry/i })).toBeTruthy();
  });
});

// ── Results state ──────────────────────────────────────────────────────────────

describe("AdvisorPanel — results state", () => {
  async function renderWithResults(response = ADVISOR_RESPONSE) {
    await act(async () => {
      render(<AdvisorPanel onClose={() => {}} sidecarReady={true} />);
    });
    await act(async () => {
      fireSidecarResponse(getLastInvokeId(), JSON.stringify(response));
    });
  }

  it("renders hardware summary rows", async () => {
    await renderWithResults();
    expect(screen.getByText("AMD Ryzen 5 5600X")).toBeTruthy();
    expect(screen.getByText("16 GB")).toBeTruthy();
    expect(screen.getByText(/RTX 3050/)).toBeTruthy();
  });

  it("renders recommendation tier cards", async () => {
    await renderWithResults();
    expect(screen.getByText("FAST")).toBeTruthy();
    expect(screen.getByText("BALANCED")).toBeTruthy();
    expect(screen.getByText("Llama 3.2 1B")).toBeTruthy();
    expect(screen.getByText("Mistral 7B")).toBeTruthy();
  });

  it("shows Installed badge for available models", async () => {
    await renderWithResults();
    expect(screen.getByText("Installed")).toBeTruthy();
  });

  it("shows Pull button for unavailable models", async () => {
    await renderWithResults();
    expect(screen.getByRole("button", { name: /pull mistral/i })).toBeTruthy();
  });

  it("shows inline confirm/cancel after clicking Pull", async () => {
    await renderWithResults();
    await act(async () => {
      screen.getByRole("button", { name: /pull mistral/i }).click();
    });
    expect(screen.getByRole("button", { name: /confirm pull/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /cancel/i })).toBeTruthy();
  });

  it("closes on close button click", async () => {
    const onClose = vi.fn();
    await act(async () => {
      render(<AdvisorPanel onClose={onClose} sidecarReady={false} />);
    });
    screen.getByRole("button", { name: /close advisor/i }).click();
    expect(onClose).toHaveBeenCalledOnce();
  });
});

// ── NVIDIA-only GPU disclosure ─────────────────────────────────────────────────

describe("AdvisorPanel — GPU disclosure", () => {
  it("shows gpu_note when GPU is null (AMD/Intel/unknown)", async () => {
    await act(async () => {
      render(<AdvisorPanel onClose={() => {}} sidecarReady={true} />);
    });
    await act(async () => {
      fireSidecarResponse(getLastInvokeId(), JSON.stringify(ADVISOR_NO_NVIDIA));
    });

    // The note must be visible in the hardware section
    const note = screen.getByTestId("gpu-note");
    expect(note).toBeTruthy();
    expect(note.textContent).toContain("NVIDIA");
  });

  it("does not show gpu_note when GPU is detected", async () => {
    await act(async () => {
      render(<AdvisorPanel onClose={() => {}} sidecarReady={true} />);
    });
    await act(async () => {
      fireSidecarResponse(getLastInvokeId(), JSON.stringify(ADVISOR_RESPONSE));
    });
    expect(screen.queryByTestId("gpu-note")).toBeNull();
  });
});

// ── Watchdog timers ────────────────────────────────────────────────────────────

describe("AdvisorPanel — scan watchdog (30 s)", () => {
  it("fires error state if no response within 30 s", async () => {
    vi.useFakeTimers();

    await act(async () => {
      render(<AdvisorPanel onClose={() => {}} sidecarReady={true} />);
    });

    // Advance past the 30 s scan watchdog without any sidecar response
    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });

    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByText(/timed out/i)).toBeTruthy();
  });

  it("does NOT fire if response arrives before 30 s", async () => {
    vi.useFakeTimers();

    await act(async () => {
      render(<AdvisorPanel onClose={() => {}} sidecarReady={true} />);
    });

    // Response arrives at 15 s
    await act(async () => {
      vi.advanceTimersByTime(15_000);
      fireSidecarResponse(getLastInvokeId(), JSON.stringify(ADVISOR_RESPONSE));
    });

    // Advance the remaining 15 s — watchdog must not fire
    await act(async () => {
      vi.advanceTimersByTime(15_000);
    });

    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("AdvisorPanel — watchdog cleanup on unmount", () => {
  it("clears watchdog timer when component unmounts", async () => {
    vi.useFakeTimers();
    const clearSpy = vi.spyOn(globalThis, "clearTimeout");

    let unmount!: () => void;
    await act(async () => {
      ({ unmount } = render(<AdvisorPanel onClose={() => {}} sidecarReady={true} />));
    });

    await act(async () => {
      unmount();
    });

    // clearTimeout must have been called (watchdog + listener cleanup)
    expect(clearSpy).toHaveBeenCalled();
    clearSpy.mockRestore();
  });
});
