//! Append-only in-memory audit log for Bunny OS action broker.
//!
//! Every `execute_assistant_action` call produces one AuditEvent that is:
//!   1. Appended to an in-memory VecDeque (bounded to MAX_AUDIT_ENTRIES)
//!   2. Emitted to the frontend as a "audit-event" Tauri event
//!
//! No audit data is persisted to disk in this version.

use std::collections::VecDeque;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::sync::Mutex;

use crate::ipc::{AuditEvent, AuditOutcome};

/// Maximum in-memory entries; oldest are dropped when exceeded.
pub const MAX_AUDIT_ENTRIES: usize = 500;

pub type AuditLog = Arc<Mutex<VecDeque<AuditEvent>>>;

/// Create a new, empty audit log.
pub fn new_log() -> AuditLog {
    Arc::new(Mutex::new(VecDeque::new()))
}

/// Append an event to the log, evicting the oldest if the cap is reached.
pub async fn append(log: &AuditLog, event: AuditEvent) {
    let mut guard = log.lock().await;
    if guard.len() >= MAX_AUDIT_ENTRIES {
        guard.pop_front();
    }
    guard.push_back(event);
}

/// Build a new AuditEvent with a unique ID and current timestamp.
/// ID and timestamp share one clock sample so they cannot diverge.
pub fn build_event(
    action_kind: &str,
    target_label: String,
    outcome: AuditOutcome,
    error_msg: Option<String>,
) -> AuditEvent {
    static COUNTER: AtomicU64 = AtomicU64::new(0);
    let n = COUNTER.fetch_add(1, Ordering::Relaxed);
    let ms = unix_millis();
    AuditEvent {
        id: format!("audit-{ms}-{n}"),
        action_kind: action_kind.to_string(),
        target_label,
        timestamp: ms,
        outcome,
        error_msg,
    }
}

fn unix_millis() -> String {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn append_and_cap() {
        let log = new_log();
        for i in 0..MAX_AUDIT_ENTRIES + 5 {
            let ev = build_event(
                "open_url",
                format!("example-{i}.com"),
                AuditOutcome::Ok,
                None,
            );
            append(&log, ev).await;
        }
        let guard = log.lock().await;
        assert_eq!(guard.len(), MAX_AUDIT_ENTRIES);
    }

    #[test]
    fn ids_are_unique() {
        let a = build_event("open_app", "a".into(), AuditOutcome::Ok, None);
        let b = build_event("open_app", "b".into(), AuditOutcome::Ok, None);
        assert_ne!(a.id, b.id);
    }

    #[test]
    fn id_and_timestamp_share_clock_sample() {
        let ev = build_event("open_url", "example.com".into(), AuditOutcome::Ok, None);
        assert!(
            ev.id.contains(&ev.timestamp),
            "id {} should embed timestamp {}",
            ev.id,
            ev.timestamp
        );
    }

    #[test]
    fn build_event_error_sets_fields() {
        let ev = build_event(
            "open_app",
            "Notepad".to_string(),
            AuditOutcome::Error,
            Some("not found".to_string()),
        );
        assert_eq!(ev.action_kind, "open_app");
        assert_eq!(ev.outcome, AuditOutcome::Error);
        assert_eq!(ev.error_msg.as_deref(), Some("not found"));
    }
}
