import { describe, expect, it } from "vitest";
import { parseAssistantResult } from "../lib/assistantResult";

describe("parseAssistantResult", () => {
  it("parses respond results", () => {
    const r = parseAssistantResult(JSON.stringify({ kind: "respond", text: "hello" }));
    expect(r).toEqual({ kind: "respond", text: "hello" });
  });

  it("parses action results", () => {
    const r = parseAssistantResult(
      JSON.stringify({
        kind: "action",
        action: { action: "open_app", app_name: "Notepad" },
      })
    );
    expect(r).toEqual({
      kind: "action",
      action: { action: "open_app", app_name: "Notepad" },
    });
  });

  it("rejects unknown kind", () => {
    expect(parseAssistantResult(JSON.stringify({ kind: "unknown" }))).toBeNull();
  });

  it("rejects invalid JSON", () => {
    expect(parseAssistantResult("{not-json")).toBeNull();
  });

  it("rejects http URLs", () => {
    expect(
      parseAssistantResult(
        JSON.stringify({
          kind: "action",
          action: { action: "open_url", url: "http://example.com" },
        })
      )
    ).toBeNull();
  });

  it("parses youtube_play and media actions", () => {
    expect(
      parseAssistantResult(
        JSON.stringify({
          kind: "action",
          action: { action: "youtube_play", query: "lofi" },
        })
      )
    ).toEqual({ kind: "action", action: { action: "youtube_play", query: "lofi" } });

    expect(
      parseAssistantResult(
        JSON.stringify({ kind: "action", action: { action: "spotify_open" } })
      )
    ).toEqual({ kind: "action", action: { action: "spotify_open" } });

    expect(
      parseAssistantResult(
        JSON.stringify({ kind: "action", action: { action: "media_next" } })
      )
    ).toEqual({ kind: "action", action: { action: "media_next" } });
  });

  it("rejects empty query for spotify_play", () => {
    expect(
      parseAssistantResult(
        JSON.stringify({
          kind: "action",
          action: { action: "spotify_play", query: "" },
        })
      )
    ).toBeNull();
  });
});
