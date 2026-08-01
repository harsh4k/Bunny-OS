/**
 * Runtime parser for AssistantResult — never trust JSON via TypeScript `as`.
 */
import type { AssistantAction, AssistantResult } from "~contracts/ipc";

const MAX_TEXT = 50_000;
const MAX_APP = 200;
const MAX_URL = 2048;
const MAX_QUERY = 500;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function parseAction(raw: unknown): AssistantAction | null {
  if (!isRecord(raw) || typeof raw.action !== "string") return null;
  switch (raw.action) {
    case "open_app": {
      if (typeof raw.app_name !== "string") return null;
      if (!raw.app_name || raw.app_name.length > MAX_APP) return null;
      return { action: "open_app", app_name: raw.app_name };
    }
    case "open_url": {
      if (typeof raw.url !== "string") return null;
      if (!raw.url.startsWith("https://") || raw.url.length > MAX_URL) return null;
      return { action: "open_url", url: raw.url };
    }
    case "youtube_search": {
      if (typeof raw.query !== "string") return null;
      if (!raw.query || raw.query.length > MAX_QUERY) return null;
      return { action: "youtube_search", query: raw.query };
    }
    case "show_system_summary":
      return { action: "show_system_summary" };
    default:
      return null;
  }
}

/** Parse and validate an AssistantResult from a JSON string. Returns null on failure. */
export function parseAssistantResult(json: string): AssistantResult | null {
  let obj: unknown;
  try {
    obj = JSON.parse(json);
  } catch {
    return null;
  }
  if (!isRecord(obj) || typeof obj.kind !== "string") return null;

  if (obj.kind === "respond") {
    if (typeof obj.text !== "string" || obj.text.length > MAX_TEXT) return null;
    return { kind: "respond", text: obj.text };
  }

  if (obj.kind === "action") {
    const action = parseAction(obj.action);
    if (!action) return null;
    return { kind: "action", action };
  }

  return null;
}
