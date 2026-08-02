//! Tauri IPC command handlers (kept separate so `#[tauri::command]` macros
//! don't collide with `generate_handler!` in `lib.rs`).

use std::sync::atomic::Ordering;

use tauri::{AppHandle, Manager, State};

use crate::{broker, hotkey, ipc, ollama, sidecar, AppState};

#[tauri::command]
pub async fn get_lifecycle(state: State<'_, AppState>) -> Result<String, String> {
    Ok(state.lifecycle.lock().await.status.to_string())
}

#[tauri::command]
pub fn get_mic_muted(state: State<'_, AppState>) -> bool {
    state.mic_muted.load(Ordering::SeqCst)
}

/// Key combo bound to push-to-talk, for display in the UI.
#[tauri::command]
pub fn get_ptt_label() -> &'static str {
    hotkey::PTT_LABEL
}

/// Is the local Ollama server accepting connections?
#[tauri::command]
pub async fn ollama_running() -> bool {
    tauri::async_runtime::spawn_blocking(ollama::is_running)
        .await
        .unwrap_or(false)
}

/// Launch the installed Ollama app and wait for its server to come up.
#[tauri::command]
pub async fn start_ollama() -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(ollama::launch_and_wait)
        .await
        .map_err(|e| format!("start_ollama task failed: {e}"))?
}

/// Download (if needed), install, start Ollama, and pull the default chat model.
#[tauri::command]
pub async fn ensure_ollama() -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(ollama::ensure_ready)
        .await
        .map_err(|e| format!("ensure_ollama task failed: {e}"))?
}

/// True when an Ollama binary/app is present on disk (may still be stopped).
#[tauri::command]
pub async fn ollama_installed() -> bool {
    tauri::async_runtime::spawn_blocking(ollama::is_installed)
        .await
        .unwrap_or(false)
}

/// Open OS privacy settings for the microphone.
///
/// Desktop apps don't get a Chrome-style prompt. Access is controlled in
/// system privacy settings; this just jumps the user there.
#[tauri::command]
pub async fn open_mic_privacy_settings() -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(|| {
        let url = if cfg!(target_os = "macos") {
            "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone"
        } else {
            "ms-settings:privacy-microphone"
        };
        open::that(url).map_err(|e| format!("Could not open microphone settings: {e}"))
    })
    .await
    .map_err(|e| format!("open_mic_privacy_settings task failed: {e}"))?
}

/// Open OS sound / output settings.
#[tauri::command]
pub async fn open_sound_settings() -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(|| {
        let url = if cfg!(target_os = "macos") {
            // Ventura+ Sound pane; falls through to legacy preference id on older macOS.
            "x-apple.systempreferences:com.apple.Sound-Settings.extension"
        } else {
            "ms-settings:sound"
        };
        open::that(url).map_err(|e| format!("Could not open sound settings: {e}"))
    })
    .await
    .map_err(|e| format!("open_sound_settings task failed: {e}"))?
}

/// Open macOS Accessibility privacy (needed for media-key injection). No-op URL on Windows.
#[tauri::command]
pub async fn open_accessibility_settings() -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(|| {
        if cfg!(target_os = "macos") {
            let url =
                "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility";
            open::that(url).map_err(|e| format!("Could not open Accessibility settings: {e}"))
        } else {
            Ok(())
        }
    })
    .await
    .map_err(|e| format!("open_accessibility_settings task failed: {e}"))?
}

#[tauri::command]
pub async fn show_window(app: AppHandle) -> Result<(), String> {
    crate::tray::show_main(&app);
    Ok(())
}

/// First-run onboarding: scan + persist installed apps (read-only, no shell).
#[derive(serde::Serialize)]
pub struct OnboardingScan {
    pub os: String,
    pub arch: String,
    pub app_count: usize,
    pub sample_apps: Vec<String>,
}

#[tauri::command]
pub async fn onboarding_scan() -> Result<OnboardingScan, String> {
    let scan = tauri::async_runtime::spawn_blocking(|| {
        let file = crate::user_apps::rescan_and_store()?;
        let mut names: Vec<String> = file.scanned.iter().map(|a| a.name.clone()).collect();
        names.sort();
        let sample_apps = names.into_iter().take(8).collect();
        let os = match std::env::consts::OS {
            "macos" => "macOS".to_string(),
            "windows" => "Windows".to_string(),
            other => other.to_string(),
        };
        Ok::<OnboardingScan, String>(OnboardingScan {
            os,
            arch: std::env::consts::ARCH.to_string(),
            app_count: file.scanned.len(),
            sample_apps,
        })
    })
    .await
    .map_err(|e| format!("onboarding_scan task failed: {e}"))??;
    Ok(scan)
}

#[tauri::command]
pub async fn list_apps() -> Result<Vec<crate::user_apps::AppListEntry>, String> {
    tauri::async_runtime::spawn_blocking(|| crate::user_apps::list_apps(false))
        .await
        .map_err(|e| format!("list_apps task failed: {e}"))?
}

#[tauri::command]
pub async fn rescan_apps() -> Result<Vec<crate::user_apps::AppListEntry>, String> {
    tauri::async_runtime::spawn_blocking(|| crate::user_apps::list_apps(true))
        .await
        .map_err(|e| format!("rescan_apps task failed: {e}"))?
}

#[tauri::command]
pub async fn add_app_alias(alias: String, target: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        crate::user_apps::add_alias(&alias, &target)?;
        Ok(())
    })
    .await
    .map_err(|e| format!("add_app_alias task failed: {e}"))?
}

/// Native file dialog → persist a custom launchable under Apps.
#[tauri::command]
pub async fn pick_and_add_app(name: String) -> Result<crate::user_apps::CustomApp, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut dialog = rfd::FileDialog::new().set_title("Choose an app for Bunny");
        dialog = if cfg!(target_os = "macos") {
            dialog.add_filter("Applications", &["app"])
        } else {
            dialog
                .add_filter("Shortcuts & programs", &["lnk", "exe"])
                .add_filter("Shortcuts", &["lnk"])
                .add_filter("Programs", &["exe"])
        };
        let path = dialog
            .pick_file()
            .ok_or_else(|| "No file selected.".to_string())?;
        crate::user_apps::add_custom(&name, &path)
    })
    .await
    .map_err(|e| format!("pick_and_add_app task failed: {e}"))?
}

#[tauri::command]
pub async fn remove_user_app(id: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || crate::user_apps::remove_user_entry(&id))
        .await
        .map_err(|e| format!("remove_user_app task failed: {e}"))?
}

/// Forward a typed action to the running sidecar.
#[tauri::command]
pub async fn send_action(
    state: State<'_, AppState>,
    id: String,
    payload: ipc::Action,
) -> Result<(), String> {
    const MAX_CHAT_MESSAGE_LEN: usize = 8192;
    const MAX_CANCEL_ID_LEN: usize = 128;

    match &payload {
        ipc::Action::Chat { message, .. } => {
            if message.is_empty() || message.len() > MAX_CHAT_MESSAGE_LEN {
                return Err(format!(
                    "chat message must be 1-{MAX_CHAT_MESSAGE_LEN} characters"
                ));
            }
        }
        ipc::Action::CancelChat { request_id } => {
            if request_id.is_empty() || request_id.len() > MAX_CANCEL_ID_LEN {
                return Err(format!(
                    "cancel_chat request_id must be 1-{MAX_CANCEL_ID_LEN} characters"
                ));
            }
        }
        ipc::Action::SetMute { muted } => {
            state.mic_muted.store(*muted, Ordering::SeqCst);
        }
        _ => {}
    }

    let msg = ipc::HostMessage::Action { id, payload };
    sidecar::send_to_sidecar(&state.sidecar_handle, &msg)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn execute_assistant_action(
    app: AppHandle,
    state: State<'_, AppState>,
    action: ipc::AssistantAction,
) -> Result<String, String> {
    broker::execute(&app, &state.audit_log, action).await
}

#[tauri::command]
pub async fn hide_window(app: AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("main") {
        win.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn quit_app(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    hotkey::unregister(&app);
    crate::abort_supervisor(&state);
    sidecar::stop_sidecar(&state.sidecar_handle).await;
    app.exit(0);
    Ok(())
}

#[tauri::command]
pub async fn restart_sidecar(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    crate::abort_supervisor(&state);
    sidecar::stop_sidecar(&state.sidecar_handle).await;
    {
        let mut s = state.lifecycle.lock().await;
        s.crash_count = 0;
        s.status = ipc::LifecycleStatus::Stopped;
        s.reason = None;
    }
    crate::spawn_supervisor(&app, &state);
    Ok(())
}

/// User-triggered compare of installed version vs GitHub latest release.
#[tauri::command]
pub async fn check_github_release(app: AppHandle) -> Result<crate::updates::UpdateCheck, String> {
    let current = app.package_info().version.to_string();
    tauri::async_runtime::spawn_blocking(move || crate::updates::check_latest(&current))
        .await
        .map_err(|e| format!("check_github_release task failed: {e}"))?
}

/// Local dependency status for the Updates board (Ollama, models, voice).
#[tauri::command]
pub async fn get_dependency_board(
    app: AppHandle,
) -> Result<crate::updates::DependencyBoard, String> {
    let current = app.package_info().version.to_string();
    tauri::async_runtime::spawn_blocking(move || crate::updates::dependency_board(&current))
        .await
        .map_err(|e| format!("get_dependency_board task failed: {e}"))
}

/// Open an allowlisted HTTPS page in the default browser (Updates panel).
#[tauri::command]
pub async fn open_trusted_https(url: String) -> Result<(), String> {
    const ALLOWED: &[&str] = &[
        crate::updates::RELEASES_PAGE,
        crate::updates::OLLAMA_DOWNLOAD_PAGE,
        crate::updates::PRIVACY_PAGE,
        crate::updates::TERMS_PAGE,
    ];
    if !ALLOWED.contains(&url.as_str()) {
        return Err("URL is not on the Updates allowlist.".to_string());
    }
    tauri::async_runtime::spawn_blocking(move || {
        open::that(&url).map_err(|e| format!("Could not open page: {e}"))
    })
    .await
    .map_err(|e| format!("open_trusted_https task failed: {e}"))?
}
