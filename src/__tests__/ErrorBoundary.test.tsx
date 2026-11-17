/**
 * ErrorBoundary — a crashing panel shows a fallback instead of a blank window.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ErrorBoundary } from "../components/ErrorBoundary";

let shouldThrow = true;

function Flaky() {
  if (shouldThrow) throw new Error("panel exploded");
  return <p>panel ok</p>;
}

describe("ErrorBoundary", () => {
  beforeEach(() => {
    shouldThrow = true;
    // React logs caught render errors; keep test output readable.
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the panel fallback with the error message", () => {
    render(
      <ErrorBoundary scope="panel" resetKey="home">
        <Flaky />
      </ErrorBoundary>,
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("This panel stopped working")).toBeInTheDocument();
    expect(screen.getByText("panel exploded")).toBeInTheDocument();
  });

  it("Try again re-renders the children", () => {
    render(
      <ErrorBoundary scope="panel">
        <Flaky />
      </ErrorBoundary>,
    );
    shouldThrow = false;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(screen.getByText("panel ok")).toBeInTheDocument();
  });

  it("clears the error when resetKey changes (user picked another panel)", () => {
    const { rerender } = render(
      <ErrorBoundary scope="panel" resetKey="home">
        <Flaky />
      </ErrorBoundary>,
    );
    shouldThrow = false;
    rerender(
      <ErrorBoundary scope="panel" resetKey="apps">
        <Flaky />
      </ErrorBoundary>,
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText("panel ok")).toBeInTheDocument();
  });

  it("keeps the fallback when the newly selected view is the one that throws", () => {
    shouldThrow = false;
    const { rerender } = render(
      <ErrorBoundary scope="panel" resetKey="home">
        <Flaky />
      </ErrorBoundary>,
    );
    shouldThrow = true;
    const logged = vi.mocked(console.error);
    logged.mockClear();
    rerender(
      <ErrorBoundary scope="panel" resetKey="apps">
        <Flaky />
      </ErrorBoundary>,
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("panel exploded")).toBeInTheDocument();
    // Caught once: the boundary must not reset and re-render the broken view.
    const crashes = logged.mock.calls.filter((c) => String(c[0]).includes("panel crashed"));
    expect(crashes).toHaveLength(1);
  });

  it("app scope offers Reload", () => {
    render(
      <ErrorBoundary scope="app">
        <Flaky />
      </ErrorBoundary>,
    );
    expect(screen.getByText("Bunny OS hit a problem")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reload" })).toBeInTheDocument();
  });
});
