//! Global push-to-talk hotkey.
//!
//! Hold F9 anywhere in Windows to talk; release to stop. The whole flow lives
//! in Rust so the hotkey keeps working while the window is hidden and while
//! React has the collapsed pill mounted (which owns no push-to-talk state).
//!
//! Fn cannot be used: laptop firmware handles it and it never reaches
//! `RegisterHotKey`, which is what the global-shortcut plugin binds.
//!
//! Holding F9 is treated as explicit consent: if the mic was muted for privacy,
//! this hold temporarily unmutes it and restores mute on release.

use std::sync::atomic::Ordering;

use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Shortcut, ShortcutState};

use crate::ipc::{Action, HostMessage};
use crate::AppState;

/// Display name shown in the UI. Keep in sync with `ptt_shortcut()`.
pub const PTT_LABEL: &str = "F9";

fn ptt_shortcut() -> Shortcut {
    Shortcut::new(None, Code::F9)
}

/// Install the global-shortcut plugin and bind push-to-talk.
///
/// A failure here is non-fatal: Talk button and tray still work, so we log and
/// let the app boot.
pub fn register(app: &AppHandle) {
    if let Err(e) = app.plugin(tauri_plugin_global_shortcut::Builder::new().build()) {
        crate::applog::info("hotkey", &format!("global-shortcut plugin failed: {e}"));
        return;
    }

    let result = app
        .global_shortcut()
        .on_shortcut(ptt_shortcut(), |app, _shortcut, event| {
            match event.state() {
                ShortcutState::Pressed => on_press(app),
                ShortcutState::Released => on_release(app),
            }
        });

    match result {
        Ok(()) => crate::applog::info("hotkey", &format!("push-to-talk bound to {PTT_LABEL}")),
        Err(e) => crate::applog::info("hotkey", &format!("could not bind {PTT_LABEL}: {e}")),
    }
}

/// Release the hotkey binding (used on quit so the key returns to the OS).
pub fn unregister(app: &AppHandle) {
    let _ = app.global_shortcut().unregister(ptt_shortcut());
}

fn on_press(app: &AppHandle) {
    let state = app.state::<AppState>();

    // Windows repeats a held hotkey; only the first press starts a session.
    if state.ptt_active.swap(true, Ordering::SeqCst) {
        return;
    }

    // Holding F9 is consent to speak. Temporarily unmute if privacy mute is on.
    let was_muted = state.mic_muted.load(Ordering::SeqCst);
    state.ptt_restore_mute.store(was_muted, Ordering::SeqCst);
    if was_muted {
        state.mic_muted.store(false, Ordering::SeqCst);
        emit_mic(app, false);
    }

    let id = format!("hotkey-{}", now_ms());
    *state.ptt_id.lock().expect("ptt_id mutex poisoned") = Some(id.clone());

    reveal_pill(app);
    emit_ptt(app, "down", None);
    crate::applog::info("hotkey", &format!("ptt down id={id} unmuted={was_muted}"));

    // Unmute must land before start_listen — same task, in order.
    let unmute = was_muted;
    let unmute_id = format!("hotkey-unmute-{}", now_ms());
    send_ordered(
        app,
        [
            unmute.then(|| HostMessage::Action {
                id: unmute_id,
                payload: Action::SetMute { muted: false },
            }),
            Some(HostMessage::Action {
                id,
                payload: Action::StartListen { model: None },
            }),
        ]
        .into_iter()
        .flatten(),
    );
}

fn on_release(app: &AppHandle) {
    let state = app.state::<AppState>();
    if !state.ptt_active.swap(false, Ordering::SeqCst) {
        return;
    }
    let id = state.ptt_id.lock().expect("ptt_id mutex poisoned").take();
    let Some(id) = id else { return };

    emit_ptt(app, "up", None);
    crate::applog::info("hotkey", &format!("ptt up id={id}"));

    let remute = state.ptt_restore_mute.swap(false, Ordering::SeqCst);
    if remute {
        state.mic_muted.store(true, Ordering::SeqCst);
        emit_mic(app, true);
    }

    let remute_id = format!("hotkey-remute-{}", now_ms());
    send_ordered(
        app,
        [
            Some(HostMessage::Action {
                id,
                payload: Action::StopListen,
            }),
            remute.then(|| HostMessage::Action {
                id: remute_id,
                payload: Action::SetMute { muted: true },
            }),
        ]
        .into_iter()
        .flatten(),
    );
}

/// Show the pill so the user gets feedback, without stealing keyboard focus
/// from whatever they were typing in.
fn reveal_pill(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = app.emit("window-shown", ());
    }
}

fn emit_ptt(app: &AppHandle, phase: &str, reason: Option<&str>) {
    let _ = app.emit(
        "hotkey-ptt",
        serde_json::json!({ "phase": phase, "reason": reason }),
    );
}

fn emit_mic(app: &AppHandle, muted: bool) {
    let _ = app.emit(
        "tray-command",
        serde_json::json!({ "cmd": "mute", "muted": muted }),
    );
}

fn send_ordered(app: &AppHandle, messages: impl IntoIterator<Item = HostMessage>) {
    let handle_slot = std::sync::Arc::clone(&app.state::<AppState>().sidecar_handle);
    let messages: Vec<HostMessage> = messages.into_iter().collect();
    tauri::async_runtime::spawn(async move {
        for msg in messages {
            let _ = crate::sidecar::send_to_sidecar(&handle_slot, &msg).await;
        }
    });
}

fn now_ms() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0)
}
