//! System tray setup.
//! Menu items: Open | Push-to-talk | Mute microphone | Settings | ── | Quit

use crate::ipc::{Action, HostMessage};
use crate::AppState;
use std::sync::atomic::Ordering;
use std::sync::Arc;
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::TrayIconBuilder,
    AppHandle, Emitter, Manager,
};

pub fn setup_tray(app: &AppHandle) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Open Bunny OS", true, None::<&str>)?;
    let ptt = MenuItem::with_id(app, "ptt", "Push-to-talk (open panel)", true, None::<&str>)?;
    let mute = MenuItem::with_id(app, "mute", "Toggle Mute Microphone", true, None::<&str>)?;
    let settings = MenuItem::with_id(app, "settings", "Wake / Settings…", true, None::<&str>)?;
    let sep = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;

    let menu = Menu::with_items(app, &[&open, &ptt, &mute, &settings, &sep, &quit])?;

    TrayIconBuilder::new()
        .icon(crate::brand_icon::brand_icon())
        .icon_as_template(false)
        .menu(&menu)
        .tooltip("Bunny OS")
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| handle_tray_event(app, event.id.as_ref()))
        .build(app)?;

    Ok(())
}

/// Show the main window without forcing island size — React owns expand/collapse sizing.
pub(crate) fn show_main(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.set_focus();
        let _ = app.emit("window-shown", ());
    }
}

fn handle_tray_event(app: &AppHandle, id: &str) {
    match id {
        "open" => show_main(app),
        "quit" => {
            let state = app.state::<AppState>();
            crate::abort_supervisor(&state);
            let handle_slot = Arc::clone(&state.sidecar_handle);
            let app = app.clone();
            tauri::async_runtime::spawn(async move {
                crate::sidecar::stop_sidecar(&handle_slot).await;
                app.exit(0);
            });
        }
        "mute" => {
            let state = app.state::<AppState>();
            let next = !state.mic_muted.load(Ordering::SeqCst);
            state.mic_muted.store(next, Ordering::SeqCst);
            let msg = HostMessage::Action {
                id: format!("tray-mute-{}", chrono_ms()),
                payload: Action::SetMute {
                    muted: next,
                    // Tray mute is an intentional cut — stop mid-sentence.
                    interrupt_speech: next,
                },
            };
            let handle_slot = Arc::clone(&state.sidecar_handle);
            let app = app.clone();
            tauri::async_runtime::spawn(async move {
                let _ = crate::sidecar::send_to_sidecar(&handle_slot, &msg).await;
                let _ = app.emit(
                    "tray-command",
                    serde_json::json!({ "cmd": "mute", "muted": next }),
                );
            });
        }
        "ptt" => {
            show_main(app);
            let _ = app.emit("tray-command", serde_json::json!({ "cmd": "ptt" }));
        }
        "settings" => {
            show_main(app);
            let _ = app.emit("tray-command", serde_json::json!({ "cmd": "wake" }));
        }
        _ => {}
    }
}

fn chrono_ms() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0)
}
