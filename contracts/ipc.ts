/**
 * Canonical IPC contract — single source of truth for message shapes.
 *
 * Rust mirror  : src-tauri/src/ipc.rs
 * Python mirror: sidecar/ipc_types.py
 *
 * All three representations MUST stay in sync.
 * Protocol: [4-byte u32 LE length][UTF-8 JSON payload]
 */

// ── Lifecycle ─────────────────────────────────────────────────────────────────

/** App / sidecar lifecycle states. */
export type AppLifecycle =
  | "starting"   // Sidecar process spawned, awaiting ready handshake
  | "ready"      // Sidecar sent { type: "ready" }
  | "degraded"   // Sidecar running but a crash was recovered; functionality partial
  | "error"      // Unrecoverable state; user action required
  | "stopped";   // Sidecar not running (initial or after clean shutdown)

// ── Allowlisted actions (MVP) ─────────────────────────────────────────────────

export type Action =
  | { action: "open_app";           app_name: string }
  | { action: "open_url";           url: string }
  | { action: "youtube_search";     query: string }
  | { action: "youtube_play";       query: string }
  | { action: "spotify_open" }
  | { action: "spotify_search";     query: string }
  | { action: "spotify_play";       query: string }
  | { action: "media_play" }
  | { action: "media_next" }
  | { action: "media_prev" }
  | { action: "show_system_summary" }
  | { action: "respond";            input: string }
  // Task 3 — hardware inventory + model advisor
  | { action: "get_inventory" }
  | { action: "get_advisor" }
  | { action: "pull_model";         model_name: string }
  /** Resolves a chat model that is actually installed locally. */
  | { action: "get_default_model" }
  // Task 4 — typed assistant chat (host-internal; Rust only forwards, never executes)
  | { action: "chat"; model?: string; message: string }
  // Host-internal cancel; excluded from AssistantAction / broker enum
  | { action: "cancel_chat"; request_id: string }
  // Voice
  | { action: "start_listen"; model?: string }
  | { action: "stop_listen" }
  | { action: "cancel_voice"; request_id?: string }
  | { action: "set_mute"; muted: boolean }
  // Wake word
  | { action: "wake_status" }
  | { action: "wake_start" }
  | { action: "wake_stop" }
  | { action: "wake_configure"; sensitivity?: number; cooldown_secs?: number; phrase?: string; profile?: string }
  // Memory
  | { action: "memory_status" }
  | { action: "memory_list" }
  | { action: "memory_add"; text: string; source?: string }
  | { action: "memory_delete"; id: number }
  | { action: "memory_clear" }
  | { action: "memory_clear_session" }
  | { action: "memory_delete_session"; id: number }
  | { action: "memory_set_enabled"; enabled: boolean }
  | { action: "memory_export" }
  // Screen context (opt-in focused-window text)
  | { action: "screen_status" }
  | { action: "screen_set_enabled"; enabled: boolean }
  | { action: "get_focused_window_text" }
  // Browser tools
  | { action: "browser_scroll"; direction: string; steps?: number }
  | { action: "browser_type"; text: string }
  | { action: "browser_click_role"; role?: string; name: string }
  | { action: "browser_focus_search" }
  | { action: "browser_confirm"; pending_id: string }
  | { action: "browser_cancel"; pending_id: string }
  // Typed placeholders — not yet implemented
  | { action: "voice_transcribe";   _placeholder: true }
  | { action: "wake_word_detected"; _placeholder: true };

// ── Task 4: Assistant action types ───────────────────────────────────────────
// Subset of Action that the Rust broker can execute.
// Intentionally excludes: chat, respond, get_inventory, get_advisor, pull_model, placeholders.

export type AssistantAction =
  | { action: "open_app";           app_name: string }
  | { action: "open_url";           url: string }
  | { action: "youtube_search";     query: string }
  | { action: "youtube_play";       query: string }
  | { action: "spotify_open" }
  | { action: "spotify_search";     query: string }
  | { action: "spotify_play";       query: string }
  | { action: "media_play" }
  | { action: "media_next" }
  | { action: "media_prev" }
  | { action: "show_system_summary" };

/** Typed result returned by Python sidecar after a chat turn. */
export type AssistantResult =
  | { kind: "respond"; text: string }
  | { kind: "action";  action: AssistantAction };

/** Append-only audit record emitted by the Rust broker after executing an action. */
export interface AuditEvent {
  /** Monotonic unique ID (e.g. "audit-<ms>-<n>"). */
  id: string;
  /** Allowlisted broker action kind (open_app, youtube_*, spotify_*, …). */
  action_kind: string;
  /** Sanitized display label (no secret/full-URL leakage). */
  target_label: string;
  /** Unix epoch milliseconds as decimal string. */
  timestamp: string;
  outcome: "ok" | "error";
  /** Human-readable error message; null on success. */
  error_msg: string | null;
}

// ── Task 3: Inventory result types ───────────────────────────────────────────
// Returned as JSON-encoded string in SidecarMessage.Response.result

export interface GpuInfo { name: string; vram_gb: number }

export interface HardwareInfo {
  os: string;
  cpu: string;
  ram_gb: number;
  gpu: GpuInfo | null;
  /** Empty string when GPU was detected; NVIDIA-only disclosure otherwise.
   *  Never treat null gpu as "no GPU present" — AMD/Intel/other GPUs are
   *  simply not detected by nvidia-smi. */
  gpu_note: string;
  mic_available: boolean;
}

export interface OllamaModel {
  name: string;
  size_gb: number;
  quantization: string | null;
}

export interface OllamaStatus {
  reachable: boolean;
  version: string | null;
  models: OllamaModel[];
  running: string[];
}

export interface InstalledApp {
  name: string;
  source: "start_menu" | "registry";
}

export interface InventoryResult {
  hardware: HardwareInfo;
  ollama: OllamaStatus;
  apps: InstalledApp[];
}

// ── Task 3: Advisor result types ─────────────────────────────────────────────

export type AdvisorTier       = "fast" | "balanced" | "quality";
export type AdvisorConstraint = "cpu_only" | "vram_limited" | "vram_ok";

export interface AdvisorRecommendation {
  tier:           AdvisorTier;
  candidate_name: string;
  display_name:   string;
  size_gb:        number;
  context_k:      number;
  quantization:   string;
  reason:         string;
  available:      boolean;
}

export interface AdvisorResult {
  catalog_version:  string;
  recommendations:  AdvisorRecommendation[];
  constraint:       AdvisorConstraint;
  warning:          string | null;
}

/** Combined response for the get_advisor action. */
export interface GetAdvisorResponse {
  hardware: HardwareInfo;
  ollama:   OllamaStatus;
  advisor:  AdvisorResult;
}

// ── Host → Sidecar (stdin) ────────────────────────────────────────────────────

export type HostMessage =
  | { type: "action";   id: string; payload: Action }
  | { type: "shutdown" };

// ── Sidecar → Host (stdout) ───────────────────────────────────────────────────

export type SidecarMessage =
  | { type: "ready";    version: string }
  | { type: "response"; id: string; result: string }
  | { type: "error";    id: string; error: string }
  | { type: "stream";   id: string; chunk: string; finished: boolean }
  | { type: "crash";    code: number; message: string };

// ── Tauri → Frontend events ───────────────────────────────────────────────────

export type AppEvent =
  | { event: "lifecycle-changed"; lifecycle: AppLifecycle; reason: string | null }
  | { event: "sidecar-message";   message: SidecarMessage }
  | { event: "crash-report";      pid: number; exit_code: number; crash_count: number };

/** Emitted on the "audit-event" channel (separate from "app-event"). */
export type AuditAppEvent = AuditEvent;
