/**
 * FirstRunNotice smoke tests.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { FirstRunNotice } from "../components/FirstRunNotice";

describe("FirstRunNotice", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("shows on first visit and dismisses", async () => {
    await act(async () => {
      render(<FirstRunNotice />);
    });
    expect(screen.getByLabelText(/first-run privacy notice/i)).toBeTruthy();
    await act(async () => {
      screen.getByLabelText(/acknowledge first-run notice/i).click();
    });
    expect(localStorage.getItem("bunnyos.firstRunAck.v1")).toBe("1");
    expect(screen.queryByLabelText(/first-run privacy notice/i)).toBeNull();
  });

  it("stays hidden after acknowledge", async () => {
    localStorage.setItem("bunnyos.firstRunAck.v1", "1");
    await act(async () => {
      render(<FirstRunNotice />);
    });
    expect(screen.queryByLabelText(/first-run privacy notice/i)).toBeNull();
  });
});
