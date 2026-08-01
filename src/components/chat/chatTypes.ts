import type { AssistantAction, AssistantResult } from "~contracts/ipc";

export type ChatPhase =
  | { phase: "idle" }
  | { phase: "streaming"; requestId: string; text: string }
  | {
      phase: "awaiting_action";
      result: AssistantResult & { kind: "action" };
      streamed: string;
    }
  | { phase: "executing"; action: AssistantAction }
  | { phase: "done"; outcome: string }
  | { phase: "error"; message: string };

export const DEFAULT_MODEL = "llama3.2:1b-instruct-q4_K_M";
export const CHAT_TIMEOUT_MS = 120_000;
