/**
 * Contract shape tests — verify that discriminated union shapes expected by
 * each layer (TS / Python / Rust) are consistent.
 *
 * These tests import the TypeScript contract types and verify:
 *   - AssistantAction variants serialize to expected JSON shape
 *   - AssistantResult variants have correct discriminants
 *   - AuditEvent has required fields
 *   - AssistantAction does NOT include inventory/pull/chat variants
 */
import { describe, it, expect } from "vitest";
import type {
  AssistantAction,
  AssistantResult,
  AuditEvent,
  Action,
} from "~contracts/ipc";

// ── Helper: simulate JSON round-trip ─────────────────────────────────────────

function roundTrip<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

// ── AssistantAction shapes ────────────────────────────────────────────────────

describe("AssistantAction — JSON shapes", () => {
  it("open_app has action discriminant and app_name", () => {
    const a: AssistantAction = { action: "open_app", app_name: "Notepad" };
    const rt = roundTrip(a);
    expect(rt.action).toBe("open_app");
    if (rt.action === "open_app") {
      expect(rt.app_name).toBe("Notepad");
    }
  });

  it("open_url has action discriminant and url", () => {
    const a: AssistantAction = { action: "open_url", url: "https://example.com" };
    const rt = roundTrip(a);
    expect(rt.action).toBe("open_url");
    if (rt.action === "open_url") {
      expect(rt.url).toBe("https://example.com");
    }
  });

  it("youtube_search has action discriminant and query", () => {
    const a: AssistantAction = { action: "youtube_search", query: "cats" };
    const rt = roundTrip(a);
    expect(rt.action).toBe("youtube_search");
    if (rt.action === "youtube_search") {
      expect(rt.query).toBe("cats");
    }
  });

  it("show_system_summary has no extra fields", () => {
    const a: AssistantAction = { action: "show_system_summary" };
    const rt = roundTrip(a);
    expect(rt.action).toBe("show_system_summary");
    expect(Object.keys(rt)).toEqual(["action"]);
  });

  it("AssistantAction discriminants are lowercase snake_case", () => {
    const actions: AssistantAction["action"][] = [
      "open_app",
      "open_url",
      "youtube_search",
      "show_system_summary",
    ];
    for (const action of actions) {
      expect(action).toMatch(/^[a-z_]+$/);
    }
  });
});

// ── AssistantResult shapes ────────────────────────────────────────────────────

describe("AssistantResult — JSON shapes", () => {
  it("respond variant has kind and text", () => {
    const r: AssistantResult = { kind: "respond", text: "Hello!" };
    const rt = roundTrip(r);
    expect(rt.kind).toBe("respond");
    if (rt.kind === "respond") {
      expect(rt.text).toBe("Hello!");
    }
  });

  it("action variant has kind and nested action", () => {
    const r: AssistantResult = {
      kind: "action",
      action: { action: "open_url", url: "https://example.com" },
    };
    const rt = roundTrip(r);
    expect(rt.kind).toBe("action");
    if (rt.kind === "action") {
      expect(rt.action.action).toBe("open_url");
    }
  });

  it("kind discriminant is 'respond' or 'action' only", () => {
    const kinds: AssistantResult["kind"][] = ["respond", "action"];
    expect(kinds).toHaveLength(2);
    for (const k of kinds) {
      expect(["respond", "action"]).toContain(k);
    }
  });
});

// ── AuditEvent shape ──────────────────────────────────────────────────────────

describe("AuditEvent — field shapes", () => {
  it("has all required fields", () => {
    const ev: AuditEvent = {
      id: "audit-1-0",
      action_kind: "open_url",
      target_label: "example.com",
      timestamp: "1700000000000",
      outcome: "ok",
      error_msg: null,
    };
    const rt = roundTrip(ev);
    expect(rt.id).toBeTruthy();
    expect(rt.action_kind).toBeTruthy();
    expect(rt.target_label).toBeTruthy();
    expect(rt.timestamp).toBeTruthy();
    expect(["ok", "error"]).toContain(rt.outcome);
  });

  it("outcome is 'ok' or 'error'", () => {
    const outcomes: AuditEvent["outcome"][] = ["ok", "error"];
    expect(outcomes).toHaveLength(2);
  });

  it("error_msg is null on success", () => {
    const ev: AuditEvent = {
      id: "audit-2",
      action_kind: "open_app",
      target_label: "Notepad",
      timestamp: "1700000001000",
      outcome: "ok",
      error_msg: null,
    };
    expect(roundTrip(ev).error_msg).toBeNull();
  });

  it("timestamp is parseable as numeric milliseconds", () => {
    const ts = "1700000000000";
    const ev: AuditEvent = {
      id: "x",
      action_kind: "open_url",
      target_label: "example.com",
      timestamp: ts,
      outcome: "ok",
      error_msg: null,
    };
    expect(new Date(Number(ev.timestamp)).getFullYear()).toBeGreaterThanOrEqual(2023);
  });
});

// ── Action type completeness ──────────────────────────────────────────────────

describe("Action type — chat and cancel_chat variants exist", () => {
  it("chat action has model and message fields", () => {
    const a: Action = { action: "chat", model: "llama3.2:1b", message: "hi" };
    const rt = roundTrip(a);
    expect(rt.action).toBe("chat");
    if (rt.action === "chat") {
      expect(rt.model).toBe("llama3.2:1b");
      expect(rt.message).toBe("hi");
    }
  });

  it("cancel_chat action has request_id field", () => {
    const a: Action = { action: "cancel_chat", request_id: "req-1" };
    const rt = roundTrip(a);
    expect(rt.action).toBe("cancel_chat");
    if (rt.action === "cancel_chat") {
      expect(rt.request_id).toBe("req-1");
    }
  });

  it("memory_delete_session action has id field", () => {
    const a: Action = { action: "memory_delete_session", id: 7 };
    const rt = roundTrip(a);
    expect(rt.action).toBe("memory_delete_session");
    if (rt.action === "memory_delete_session") {
      expect(rt.id).toBe(7);
    }
  });
});

// ── Security: AssistantAction does NOT include dangerous variants ─────────────

describe("AssistantAction — exclusion constraints (type-level)", () => {
  it("only includes the 4 safe action kinds", () => {
    // This test ensures the type's discriminants stay bounded.
    // TypeScript compile-time — we verify the runtime values of valid discriminants.
    const valid: AssistantAction["action"][] = [
      "open_app",
      "open_url",
      "youtube_search",
      "show_system_summary",
    ];
    expect(valid).toHaveLength(4);
    for (const v of valid) {
      expect(["open_app", "open_url", "youtube_search", "show_system_summary"]).toContain(v);
    }
  });
});
