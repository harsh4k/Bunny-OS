/**
 * IPC message types — Rust mirror of contracts/ipc.ts.
 *
 * TS source of truth: contracts/ipc.ts
 * Python mirror:      sidecar/ipc_types.py
 *
 * Framing: [4-byte u32 LE length][UTF-8 JSON payload]
 */
use serde::{Deserialize, Serialize};

// ── Lifecycle ─────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LifecycleStatus {
    Starting,
    Ready,
    Degraded,
    Error,
    Stopped,
}

impl Default for LifecycleStatus {
    fn default() -> Self {
        Self::Stopped
    }
}

impl std::fmt::Display for LifecycleStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let s = match self {
            Self::Starting => "starting",
            Self::Ready => "ready",
            Self::Degraded => "degraded",
            Self::Error => "error",
            Self::Stopped => "stopped",
        };
        write!(f, "{s}")
    }
}

// ── Allowlisted actions ───────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "action", rename_all = "snake_case")]
pub enum Action {
    OpenApp {
        app_name: String,
    },
    OpenUrl {
        url: String,
    },
    YoutubeSearch {
        query: String,
    },
    YoutubePlay {
        query: String,
    },
    SpotifyOpen,
    SpotifySearch {
        query: String,
    },
    SpotifyPlay {
        query: String,
    },
    MediaPlay,
    MediaNext,
    MediaPrev,
    ShowSystemSummary,
    Respond {
        input: String,
    },
    // Task 3 — hardware inventory + model advisor
    GetInventory,
    GetAdvisor,
    PullModel {
        model_name: String,
    },
    /// Resolves a chat model that is actually installed locally.
    GetDefaultModel,
    // Task 4 — host-internal chat (Rust forwards to sidecar; never executes directly)
    Chat {
        /// Omitted means "use whatever chat model is installed".
        #[serde(default)]
        model: Option<String>,
        message: String,
    },
    // Host-internal cancel; excluded from AssistantAction / broker enum
    CancelChat {
        request_id: String,
    },
    // Voice
    StartListen {
        #[serde(default)]
        model: Option<String>,
    },
    StopListen,
    CancelVoice {
        #[serde(default)]
        request_id: Option<String>,
    },
    SetMute {
        muted: bool,
    },
    // Wake word
    WakeStatus,
    WakeStart,
    WakeStop,
    WakeConfigure {
        #[serde(default)]
        sensitivity: Option<f64>,
        #[serde(default)]
        cooldown_secs: Option<f64>,
        #[serde(default)]
        phrase: Option<String>,
    },
    // Memory
    MemoryStatus,
    MemoryList,
    MemoryAdd {
        text: String,
        #[serde(default)]
        source: Option<String>,
    },
    MemoryDelete {
        id: i64,
    },
    MemoryClear,
    MemoryClearSession,
    MemorySetEnabled {
        enabled: bool,
    },
    MemoryExport,
    // Typed placeholders — not yet implemented
    VoiceTranscribe {
        _placeholder: bool,
    },
    WakeWordDetected {
        _placeholder: bool,
    },
}

// ── Task 4: Assistant action (Rust broker input) ───────────────────────────────
// Intentionally excludes chat, respond, inventory, pull, and placeholders.
// React MUST NOT pass those variants to execute_assistant_action.

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "action", rename_all = "snake_case")]
pub enum AssistantAction {
    OpenApp { app_name: String },
    OpenUrl { url: String },
    YoutubeSearch { query: String },
    YoutubePlay { query: String },
    SpotifyOpen,
    SpotifySearch { query: String },
    SpotifyPlay { query: String },
    MediaPlay,
    MediaNext,
    MediaPrev,
    ShowSystemSummary,
}

// ── Task 4: Audit record ──────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AuditOutcome {
    Ok,
    Error,
}

/// Append-only audit event emitted to UI after every broker action.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditEvent {
    /// Unique ID: "audit-<unix_ms>-<counter>"
    pub id: String,
    /// Action kind: open_app | open_url | youtube_* | spotify_* | show_system_summary
    pub action_kind: String,
    /// Sanitized display label (no secret/full-URL leakage).
    pub target_label: String,
    /// Unix epoch milliseconds as decimal string.
    pub timestamp: String,
    pub outcome: AuditOutcome,
    pub error_msg: Option<String>,
}

// ── Host → Sidecar ────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum HostMessage {
    Action { id: String, payload: Action },
    Shutdown,
}

// ── Sidecar → Host ────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum SidecarMessage {
    Ready {
        version: String,
    },
    Response {
        id: String,
        result: String,
    },
    Error {
        id: String,
        error: String,
    },
    Stream {
        id: String,
        chunk: String,
        finished: bool,
    },
    Crash {
        code: i32,
        message: String,
    },
}

// ── Frontend event payload ────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "event", rename_all = "kebab-case")]
pub enum AppEventPayload {
    LifecycleChanged {
        lifecycle: LifecycleStatus,
        reason: Option<String>,
    },
    SidecarMessage {
        message: SidecarMessage,
    },
    CrashReport {
        pid: u32,
        exit_code: i32,
        crash_count: u32,
    },
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lifecycle_status_roundtrip() {
        let statuses = [
            LifecycleStatus::Starting,
            LifecycleStatus::Ready,
            LifecycleStatus::Degraded,
            LifecycleStatus::Error,
            LifecycleStatus::Stopped,
        ];
        for s in statuses {
            let json = serde_json::to_string(&s).unwrap();
            let back: LifecycleStatus = serde_json::from_str(&json).unwrap();
            assert_eq!(s, back, "round-trip failed for {s:?}");
        }
    }

    #[test]
    fn host_message_shutdown_serializes_correctly() {
        let msg = HostMessage::Shutdown;
        let json = serde_json::to_string(&msg).unwrap();
        assert!(json.contains("\"type\":\"shutdown\""), "got: {json}");
    }

    #[test]
    fn sidecar_ready_message_roundtrip() {
        let msg = SidecarMessage::Ready {
            version: "0.1.0".to_string(),
        };
        let json = serde_json::to_string(&msg).unwrap();
        let back: SidecarMessage = serde_json::from_str(&json).unwrap();
        if let SidecarMessage::Ready { version } = back {
            assert_eq!(version, "0.1.0");
        } else {
            panic!("wrong variant after round-trip");
        }
    }

    #[test]
    fn action_open_app_serializes_tag() {
        let a = Action::OpenApp {
            app_name: "notepad".to_string(),
        };
        let json = serde_json::to_string(&a).unwrap();
        assert!(json.contains("\"action\":\"open_app\""), "got: {json}");
        assert!(json.contains("notepad"), "got: {json}");
    }

    #[test]
    fn action_get_inventory_serializes_tag() {
        let json = serde_json::to_string(&Action::GetInventory).unwrap();
        assert!(json.contains("\"action\":\"get_inventory\""), "got: {json}");
    }

    #[test]
    fn action_get_advisor_serializes_tag() {
        let json = serde_json::to_string(&Action::GetAdvisor).unwrap();
        assert!(json.contains("\"action\":\"get_advisor\""), "got: {json}");
    }

    #[test]
    fn action_pull_model_serializes_tag() {
        let a = Action::PullModel {
            model_name: "llama3.2:1b-instruct-q4_K_M".to_string(),
        };
        let json = serde_json::to_string(&a).unwrap();
        assert!(json.contains("\"action\":\"pull_model\""), "got: {json}");
        assert!(json.contains("llama3.2"), "got: {json}");
    }

    #[test]
    fn action_chat_serializes_tag() {
        let a = Action::Chat {
            model: Some("llama3.2:1b".to_string()),
            message: "hello".to_string(),
        };
        let json = serde_json::to_string(&a).unwrap();
        assert!(json.contains("\"action\":\"chat\""), "got: {json}");
        assert!(json.contains("\"model\""), "got: {json}");
        assert!(json.contains("\"message\""), "got: {json}");
    }

    #[test]
    fn assistant_action_open_url_roundtrip() {
        let a = AssistantAction::OpenUrl {
            url: "https://example.com".to_string(),
        };
        let json = serde_json::to_string(&a).unwrap();
        assert!(json.contains("\"action\":\"open_url\""), "got: {json}");
        let back: AssistantAction = serde_json::from_str(&json).unwrap();
        if let AssistantAction::OpenUrl { url } = back {
            assert_eq!(url, "https://example.com");
        } else {
            panic!("wrong variant after roundtrip");
        }
    }

    #[test]
    fn assistant_action_open_app_roundtrip() {
        let a = AssistantAction::OpenApp {
            app_name: "Notepad".to_string(),
        };
        let json = serde_json::to_string(&a).unwrap();
        assert!(json.contains("\"action\":\"open_app\""), "got: {json}");
        let back: AssistantAction = serde_json::from_str(&json).unwrap();
        if let AssistantAction::OpenApp { app_name } = back {
            assert_eq!(app_name, "Notepad");
        } else {
            panic!("wrong variant after roundtrip");
        }
    }

    #[test]
    fn assistant_action_rejects_chat_variant() {
        // Rust broker enum must not deserialize "chat"
        let json = r#"{"action":"chat","model":"x","message":"y"}"#;
        let result: Result<AssistantAction, _> = serde_json::from_str(json);
        assert!(result.is_err(), "AssistantAction must not accept 'chat'");
    }

    #[test]
    fn assistant_action_rejects_get_inventory() {
        let json = r#"{"action":"get_inventory"}"#;
        let result: Result<AssistantAction, _> = serde_json::from_str(json);
        assert!(
            result.is_err(),
            "AssistantAction must not accept 'get_inventory'"
        );
    }

    #[test]
    fn action_cancel_chat_serializes_tag() {
        let a = Action::CancelChat {
            request_id: "req-123".to_string(),
        };
        let json = serde_json::to_string(&a).unwrap();
        assert!(json.contains("\"action\":\"cancel_chat\""), "got: {json}");
        assert!(json.contains("\"request_id\":\"req-123\""), "got: {json}");
    }

    #[test]
    fn assistant_action_rejects_cancel_chat() {
        let json = r#"{"action":"cancel_chat","request_id":"x"}"#;
        let result: Result<AssistantAction, _> = serde_json::from_str(json);
        assert!(
            result.is_err(),
            "AssistantAction must not accept 'cancel_chat'"
        );
    }

    #[test]
    fn audit_event_serializes_correctly() {
        let ev = AuditEvent {
            id: "audit-1-0".to_string(),
            action_kind: "open_url".to_string(),
            target_label: "example.com".to_string(),
            timestamp: "1700000000000".to_string(),
            outcome: AuditOutcome::Ok,
            error_msg: None,
        };
        let json = serde_json::to_string(&ev).unwrap();
        assert!(json.contains("\"outcome\":\"ok\""), "got: {json}");
        assert!(json.contains("\"action_kind\":\"open_url\""), "got: {json}");
    }
}
