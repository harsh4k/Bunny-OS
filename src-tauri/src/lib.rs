//! Bunny OS library root.
//!
//! Wires together: tray setup, sidecar lifecycle, Tauri commands, single-instance guard.
#![deny(unsafe_code)]

pub mod applog;
pub mod audit;
mod brand_icon;
pub mod broker;
pub mod command;
pub mod commands;
pub mod hotkey;
pub mod ipc;
pub mod media_keys;
pub mod ollama;
pub mod ollama_bootstrap;
pub mod proc;
pub mod protocol;
pub mod sidecar;
pub mod start_menu;
mod tray;
pub mod updates;
pub mod url_tools;
pub mod user_apps;

use std::sync::atomic::AtomicBool;
use std::sync::Arc;
use tauri::{AppHandle, Manager};
use tokio::sync::Mutex;

use sidecar::{SharedState, SidecarHandle, SidecarState};

// ── App-wide managed state ────────────────────────────────────────────────────

pub struct AppState {
    pub lifecycle: SharedState,
    /// Live handle to the running sidecar (stdin + child).
    pub sidecar_handle: Arc<Mutex<Option<SidecarHandle>>>,
    /// JoinHandle for the active supervisor task; aborted on restart.
    pub supervisor_task: Arc<std::sync::Mutex<Option<tauri::async_runtime::JoinHandle<()>>>>,
    /// Append-only in-memory audit log; emitted to frontend on each write.
    pub audit_log: audit::AuditLog,
    /// Shared mute preference for tray ↔ UI (default muted).
    pub mic_muted: Arc<AtomicBool>,
    /// True while the global push-to-talk key is held (filters key auto-repeat).
    pub ptt_active: Arc<AtomicBool>,
    /// Request id of the in-flight hotkey listen session.
    pub ptt_id: Arc<std::sync::Mutex<Option<String>>>,
    /// Mic was muted when this PTT hold began — restore mute on release.
    pub ptt_restore_mute: Arc<AtomicBool>,
    /// Serializes F9 press/release IPC so remute cannot land between unmute and start_listen.
    pub ptt_ipc: Arc<Mutex<()>>,
}

// ── App entry point ───────────────────────────────────────────────────────────

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            tray::show_main(app);
        }))
        .manage(AppState {
            lifecycle: Arc::new(Mutex::new(SidecarState::default())),
            sidecar_handle: Arc::new(Mutex::new(None)),
            supervisor_task: Arc::new(std::sync::Mutex::new(None)),
            audit_log: audit::new_log(),
            mic_muted: Arc::new(AtomicBool::new(true)),
            ptt_active: Arc::new(AtomicBool::new(false)),
            ptt_id: Arc::new(std::sync::Mutex::new(None)),
            ptt_restore_mute: Arc::new(AtomicBool::new(false)),
            ptt_ipc: Arc::new(Mutex::new(())),
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_lifecycle,
            commands::get_mic_muted,
            commands::get_ptt_label,
            commands::hide_window,
            commands::show_window,
            commands::ollama_running,
            commands::ollama_installed,
            commands::open_mic_privacy_settings,
            commands::open_sound_settings,
            commands::open_accessibility_settings,
            commands::onboarding_scan,
            commands::quit_app,
            commands::restart_sidecar,
            commands::send_action,
            commands::start_ollama,
            commands::ensure_ollama,
            commands::execute_assistant_action,
            commands::check_github_release,
            commands::get_dependency_board,
            commands::open_trusted_https,
            commands::list_apps,
            commands::rescan_apps,
            commands::add_app_alias,
            commands::pick_and_add_app,
            commands::remove_user_app,
        ])
        .setup(|app| {
            applog::info("app", "startup");
            // MinGW leaves the PE icon as the purple placeholder; set the real
            // brand artwork on the live window (and tray) at runtime.
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.set_icon(brand_icon::brand_icon());
            }
            tray::setup_tray(app.handle())?;
            hotkey::register(app.handle());
            let state = app.state::<AppState>();
            spawn_supervisor(app.handle(), &state);
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running Bunny OS");
}

// ── Helpers ───────────────────────────────────────────────────────────────────

pub(crate) fn abort_supervisor(state: &AppState) {
    if let Some(task) = state
        .supervisor_task
        .lock()
        .expect("supervisor_task mutex poisoned")
        .take()
    {
        task.abort();
    }
}

pub(crate) fn spawn_supervisor(app: &AppHandle, state: &AppState) {
    let cmd = command::resolve_command(app);
    let app_h = app.clone();
    let lc = Arc::clone(&state.lifecycle);
    let hs = Arc::clone(&state.sidecar_handle);
    let task = tauri::async_runtime::spawn(sidecar::start_sidecar(app_h, lc, hs, cmd));
    *state
        .supervisor_task
        .lock()
        .expect("supervisor_task mutex poisoned") = Some(task);
}
