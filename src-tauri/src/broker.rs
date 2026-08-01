//! Action broker — executes AssistantActions safely.
//!
//! Security properties:
//!   - open_app: installed-app allowlist only; `open::that` (no shell)
//!   - open_url / youtube_*: HTTPS URL helpers in `url_tools`
//!   - spotify_*: `spotify:` URI or open.spotify.com HTTPS only
//!   - media_*: platform multimedia keys (play/pause, next, prev) — no shell
//!   - show_system_summary: read-only, deterministic
//!   - Audit event emitted on every call

use std::path::PathBuf;

use crate::{
    audit::{self, AuditLog},
    ipc::{AssistantAction, AuditOutcome},
    media_keys::{self, MediaKind},
    start_menu::discover_installed_apps,
    url_tools::{
        build_spotify_search_uri, build_youtube_play_url, build_youtube_url, extract_domain,
        is_open_spotify_url, validate_spotify_uri, validate_url,
    },
};
use tauri::Emitter;

const MAX_APP_NAME_LEN: usize = 200;
const MAX_QUERY_LEN: usize = 500;

/// Casual spoken names → catalog keys (lowercase).
fn app_alias(key: &str) -> &str {
    match key {
        "chrome" | "google chrome" => "google chrome",
        "edge" | "microsoft edge" => "microsoft edge",
        "vscode" | "vs code" | "visual studio code" => "visual studio code",
        "calc" | "calculator" => "calculator",
        "explorer" | "file explorer" => "file explorer",
        // macOS
        "safari" => "safari",
        "finder" => "finder",
        "textedit" | "text edit" => "textedit",
        other => other,
    }
}

/// Execute an AssistantAction, record an audit event, and return the outcome.
pub async fn execute(
    app: &tauri::AppHandle,
    log: &AuditLog,
    action: AssistantAction,
) -> Result<String, String> {
    let (action_kind, target_label, result) = dispatch(action);
    let (outcome, error_msg) = match &result {
        Ok(_) => (AuditOutcome::Ok, None),
        Err(e) => (AuditOutcome::Error, Some(e.clone())),
    };
    let event = audit::build_event(action_kind, target_label, outcome, error_msg);
    audit::append(log, event.clone()).await;
    let _ = app.emit("audit-event", &event);
    result
}

fn dispatch(action: AssistantAction) -> (&'static str, String, Result<String, String>) {
    match action {
        AssistantAction::OpenApp { app_name } => {
            let label = truncate_label(&app_name, 60);
            ("open_app", label, execute_open_app(&app_name))
        }
        AssistantAction::OpenUrl { url } => {
            let label = extract_domain(&url);
            ("open_url", label, execute_open_url(&url))
        }
        AssistantAction::YoutubeSearch { query } => {
            let label = truncate_label(&query, 50);
            ("youtube_search", label, execute_youtube_search(&query))
        }
        AssistantAction::YoutubePlay { query } => {
            let label = truncate_label(&query, 50);
            ("youtube_play", label, execute_youtube_play(&query))
        }
        AssistantAction::SpotifyOpen => {
            ("spotify_open", "spotify".to_string(), execute_spotify_open())
        }
        AssistantAction::SpotifySearch { query } => {
            let label = truncate_label(&query, 50);
            ("spotify_search", label, execute_spotify_search(&query))
        }
        AssistantAction::SpotifyPlay { query } => {
            let label = truncate_label(&query, 50);
            ("spotify_play", label, execute_spotify_play(&query))
        }
        AssistantAction::MediaPlay => (
            "media_play",
            "play_pause".to_string(),
            media_keys::execute_media_key(MediaKind::PlayPause, "Toggling play."),
        ),
        AssistantAction::MediaNext => (
            "media_next",
            "next".to_string(),
            media_keys::execute_media_key(MediaKind::Next, "Skipping to the next track."),
        ),
        AssistantAction::MediaPrev => (
            "media_prev",
            "previous".to_string(),
            media_keys::execute_media_key(MediaKind::Prev, "Going to the previous track."),
        ),
        AssistantAction::ShowSystemSummary => (
            "show_system_summary",
            "system-summary".to_string(),
            Ok(system_summary()),
        ),
    }
}

fn execute_open_app(app_name: &str) -> Result<String, String> {
    if app_name.is_empty() || app_name.len() > MAX_APP_NAME_LEN {
        return Err(format!("app_name must be 1-{MAX_APP_NAME_LEN} characters"));
    }
    let bad: &[char] = &[
        '/', '\\', ':', '*', '?', '"', '<', '>', '|', '\0', '\n', '\r',
    ];
    if app_name.chars().any(|c| bad.contains(&c)) {
        return Err("app_name contains invalid characters".to_string());
    }
    let path = resolve_installed_app(app_name)?;
    open::that(&path).map_err(|e| format!("Failed to open '{app_name}': {e}"))?;
    Ok(format!("Opened {app_name}"))
}

fn resolve_installed_app(app_name: &str) -> Result<PathBuf, String> {
    let apps = discover_installed_apps();
    let key = app_name.to_lowercase();
    let alias = app_alias(&key);

    if let Some(path) = apps.get(alias).or_else(|| apps.get(&key)) {
        return Ok(path.clone());
    }

    let prefix: Vec<&PathBuf> = apps
        .iter()
        .filter(|(name, _)| name.starts_with(alias))
        .map(|(_, p)| p)
        .collect();
    if prefix.len() == 1 {
        return Ok(prefix[0].clone());
    }

    let hits: Vec<&PathBuf> = apps
        .iter()
        .filter(|(name, _)| name.contains(alias) || alias.contains(name.as_str()))
        .map(|(_, p)| p)
        .collect();
    if hits.len() == 1 {
        return Ok(hits[0].clone());
    }

    let needle = alias.get(..4.min(alias.len())).unwrap_or(alias);
    let suggestions: Vec<String> = apps
        .keys()
        .filter(|k| k.contains(needle))
        .take(5)
        .cloned()
        .collect();
    let catalog = if cfg!(target_os = "macos") {
        "Applications"
    } else {
        "Start Menu"
    };
    if suggestions.is_empty() {
        Err(format!(
            "App '{app_name}' not found in {catalog}. Check the spelling."
        ))
    } else {
        Err(format!(
            "App '{app_name}' not found. Did you mean: {}?",
            suggestions.join(", ")
        ))
    }
}

fn execute_open_url(url: &str) -> Result<String, String> {
    validate_url(url)?;
    open::that(url).map_err(|e| format!("Failed to open URL: {e}"))?;
    Ok(format!("Opened {}", extract_domain(url)))
}

fn require_query(query: &str) -> Result<(), String> {
    if query.is_empty() || query.len() > MAX_QUERY_LEN {
        Err(format!("query must be 1-{MAX_QUERY_LEN} characters"))
    } else {
        Ok(())
    }
}

fn execute_youtube_search(query: &str) -> Result<String, String> {
    require_query(query)?;
    let url = build_youtube_url(query);
    validate_url(&url).map_err(|e| format!("Internal YouTube URL error: {e}"))?;
    open::that(&url).map_err(|e| format!("Failed to open YouTube search: {e}"))?;
    Ok(format!("Searching YouTube: {}", truncate_label(query, 50)))
}

fn execute_youtube_play(query: &str) -> Result<String, String> {
    require_query(query)?;
    let url = build_youtube_play_url(query);
    validate_url(&url).map_err(|e| format!("Internal YouTube URL error: {e}"))?;
    open::that(&url).map_err(|e| format!("Failed to open YouTube: {e}"))?;
    Ok(format!(
        "Opening YouTube results for {}",
        truncate_label(query, 50)
    ))
}

fn execute_spotify_open() -> Result<String, String> {
    match open::that("spotify:") {
        Ok(()) => Ok("Opening Spotify.".to_string()),
        Err(_) => {
            let path = resolve_installed_app("Spotify")?;
            open::that(&path).map_err(|e| format!("Failed to open Spotify: {e}"))?;
            Ok("Opening Spotify.".to_string())
        }
    }
}

fn execute_spotify_search(query: &str) -> Result<String, String> {
    require_query(query)?;
    let uri = build_spotify_search_uri(query);
    validate_spotify_uri(&uri)?;
    open::that(&uri).map_err(|e| format!("Failed to open Spotify search: {e}"))?;
    Ok(format!(
        "Searching Spotify for {}",
        truncate_label(query, 50)
    ))
}

fn execute_spotify_play(query: &str) -> Result<String, String> {
    require_query(query)?;
    let q = query.trim();
    if q.to_ascii_lowercase().starts_with("spotify:") {
        validate_spotify_uri(q)?;
        open::that(q).map_err(|e| format!("Failed to open Spotify: {e}"))?;
        return Ok("Opening that in Spotify.".to_string());
    }
    if q.to_ascii_lowercase().starts_with("https://open.spotify.com/") {
        validate_url(q)?;
        if !is_open_spotify_url(q) {
            return Err("Only https://open.spotify.com links are allowed".to_string());
        }
        open::that(q).map_err(|e| format!("Failed to open Spotify: {e}"))?;
        return Ok("Opening that in Spotify.".to_string());
    }
    let uri = build_spotify_search_uri(q);
    validate_spotify_uri(&uri)?;
    open::that(&uri).map_err(|e| format!("Failed to open Spotify: {e}"))?;
    // A search URI only lands on results; playback needs an authenticated API.
    Ok(format!("Showing {} in Spotify", truncate_label(q, 50)))
}

fn system_summary() -> String {
    let arch = std::env::consts::ARCH;
    let os_name = match std::env::consts::OS {
        "macos" => "macOS",
        "windows" => "Windows",
        other => other,
    };
    let computer = std::env::var("COMPUTERNAME")
        .or_else(|_| std::env::var("HOSTNAME"))
        .unwrap_or_else(|_| "Unknown".to_string());
    let username = std::env::var("USERNAME")
        .or_else(|_| std::env::var("USER"))
        .unwrap_or_else(|_| "Unknown".to_string());
    format!("OS: {os_name} ({arch}) | Computer: {computer} | User: {username}")
}

fn truncate_label(s: &str, max: usize) -> String {
    if s.len() <= max {
        s.to_string()
    } else {
        format!("{}…", &s[..max.saturating_sub(1)])
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn app_name_with_path_separator_rejected() {
        assert!(execute_open_app("../../windows/system32/cmd").is_err());
        assert!(execute_open_app("notepad\\..\\cmd").is_err());
    }

    #[test]
    fn app_name_too_long_rejected() {
        assert!(execute_open_app(&"a".repeat(MAX_APP_NAME_LEN + 1)).is_err());
    }

    #[test]
    fn app_name_empty_rejected() {
        assert!(execute_open_app("").is_err());
    }

    #[test]
    fn app_name_with_null_byte_rejected() {
        assert!(execute_open_app("notepad\x00evil").is_err());
    }

    #[test]
    fn system_summary_non_empty() {
        let s = system_summary();
        assert!(!s.is_empty());
        assert!(s.contains("OS:"));
    }

    #[test]
    fn short_label_unchanged() {
        assert_eq!(truncate_label("hello", 10), "hello");
    }

    #[test]
    fn long_label_truncated() {
        let result = truncate_label("hello world", 5);
        assert!(result.ends_with('…'));
    }
}
