//! Ollama reachability, launch, and first-run bootstrap (approach A).
//!
//! If Ollama is missing, Bunny downloads the official installer, runs it,
//! waits for :11434, then pulls a small default chat model.

use std::net::{Ipv4Addr, SocketAddr, TcpStream};
use std::path::PathBuf;
use std::time::Duration;

use crate::ollama_bootstrap::{self, curl_bin};

pub const OLLAMA_PORT: u16 = 11434;
/// Small Fast-tier model so chat works after a fresh install.
pub const DEFAULT_MODEL: &str = "llama3.2:1b";

const PROBE_TIMEOUT_MS: u64 = 400;
const LAUNCH_WAIT_SECS: u64 = 45;
const PULL_WAIT_SECS: u64 = 600;
const POLL_MS: u64 = 500;

/// True when something is accepting connections on the Ollama port.
pub fn is_running() -> bool {
    let addr = SocketAddr::from((Ipv4Addr::LOCALHOST, OLLAMA_PORT));
    TcpStream::connect_timeout(&addr, Duration::from_millis(PROBE_TIMEOUT_MS)).is_ok()
}

fn candidates() -> Vec<PathBuf> {
    #[cfg(target_os = "macos")]
    {
        macos_candidates()
    }
    #[cfg(not(target_os = "macos"))]
    {
        windows_candidates()
    }
}

#[cfg(not(target_os = "macos"))]
fn windows_candidates() -> Vec<PathBuf> {
    let mut out = Vec::new();
    let mut push_dir = |dir: PathBuf| {
        out.push(dir.join("ollama app.exe"));
        out.push(dir.join("ollama.exe"));
    };
    if let Ok(local) = std::env::var("LOCALAPPDATA") {
        push_dir(PathBuf::from(local).join("Programs").join("Ollama"));
    }
    if let Ok(pf) = std::env::var("ProgramFiles") {
        push_dir(PathBuf::from(pf).join("Ollama"));
    }
    out
}

#[cfg(target_os = "macos")]
fn macos_candidates() -> Vec<PathBuf> {
    let mut out = vec![
        PathBuf::from("/Applications/Ollama.app"),
        PathBuf::from("/Applications/Ollama.app/Contents/Resources/ollama"),
        PathBuf::from("/usr/local/bin/ollama"),
        PathBuf::from("/opt/homebrew/bin/ollama"),
    ];
    if let Ok(home) = std::env::var("HOME") {
        let user_apps = PathBuf::from(home).join("Applications");
        out.insert(1, user_apps.join("Ollama.app"));
        out.insert(
            2,
            user_apps
                .join("Ollama.app")
                .join("Contents")
                .join("Resources")
                .join("ollama"),
        );
    }
    out
}

/// Path to an installed Ollama executable / app, if one exists.
pub fn installed_path() -> Option<PathBuf> {
    candidates().into_iter().find(|p| p.exists())
}

pub fn is_installed() -> bool {
    installed_path().is_some()
}

/// Best-effort `ollama -v` / `--version` via the installed binary (argv only).
pub fn version_string() -> Option<String> {
    let exe = installed_path()?;
    // Prefer the CLI binary when we only found the .app bundle.
    let cli = cli_binary_for(&exe);
    for args in [["-v"], ["--version"]] {
        let Ok(out) = crate::proc::command(&cli).args(args).output() else {
            continue;
        };
        if !out.status.success() {
            continue;
        }
        let text = String::from_utf8_lossy(&out.stdout);
        let err = String::from_utf8_lossy(&out.stderr);
        let combined = format!("{text}{err}");
        if let Some(line) = combined.lines().map(str::trim).find(|l| !l.is_empty()) {
            return Some(line.to_string());
        }
    }
    None
}

fn cli_binary_for(path: &std::path::Path) -> PathBuf {
    #[cfg(target_os = "macos")]
    {
        if path
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.eq_ignore_ascii_case("app"))
            .unwrap_or(false)
        {
            let nested = path.join("Contents").join("Resources").join("ollama");
            if nested.exists() {
                return nested;
            }
        }
    }
    path.to_path_buf()
}

/// Chat model names from a running Ollama (`/api/tags`). Empty if unreachable.
pub fn list_chat_models() -> Result<Vec<String>, String> {
    installed_chat_models()
}

/// Launch Ollama and block until the port answers or we give up.
pub fn launch_and_wait() -> Result<String, String> {
    if is_running() {
        return Ok("Ollama is already running".to_string());
    }

    let exe = installed_path().ok_or_else(|| {
        "Ollama is not installed yet. Use Install & start Ollama in Bunny.".to_string()
    })?;

    open::that(&exe).map_err(|e| format!("Could not start Ollama ({}): {e}", exe.display()))?;
    wait_until_running(LAUNCH_WAIT_SECS)?;
    Ok("Ollama started".to_string())
}

/// Ensure Ollama is installed, running, and has a default chat model.
pub fn ensure_ready() -> Result<String, String> {
    let mut notes: Vec<String> = Vec::new();

    if !is_running() {
        if !is_installed() {
            notes.push(ollama_bootstrap::install_official(installed_path)?);
        }
        notes.push(launch_and_wait()?);
    } else {
        notes.push("Ollama is already running".to_string());
    }

    notes.push(ensure_default_model()?);
    Ok(notes.join(" · "))
}

fn wait_until_running(secs: u64) -> Result<(), String> {
    let deadline = std::time::Instant::now() + Duration::from_secs(secs);
    while std::time::Instant::now() < deadline {
        if is_running() {
            return Ok(());
        }
        std::thread::sleep(Duration::from_millis(POLL_MS));
    }
    Err(format!(
        "Ollama did not answer on port {OLLAMA_PORT} within {secs}s"
    ))
}

/// Embedding / rerank models answer `/api/chat` but cannot hold a conversation,
/// so they do not count as "the user already has a model".
const NON_CHAT_HINTS: [&str; 2] = ["embed", "rerank"];

/// Never re-download when the user already has a usable chat model — the chat
/// path resolves against whatever is installed rather than a hardcoded tag.
fn ensure_default_model() -> Result<String, String> {
    let existing = installed_chat_models()?;
    if existing.iter().any(|m| m == DEFAULT_MODEL) {
        return Ok(format!("Model {DEFAULT_MODEL} ready"));
    }
    if !existing.is_empty() {
        return Ok(format!(
            "Found {} chat model(s) already installed — skipped the download",
            existing.len()
        ));
    }

    pull_model(DEFAULT_MODEL)?;
    if installed_chat_models()?.iter().any(|m| m == DEFAULT_MODEL) {
        return Ok(format!("Pulled {DEFAULT_MODEL}"));
    }
    Err(format!(
        "Pulled {DEFAULT_MODEL} but it is not listed yet — open Models and retry if chat fails"
    ))
}

fn installed_chat_models() -> Result<Vec<String>, String> {
    let url = format!("http://127.0.0.1:{OLLAMA_PORT}/api/tags");
    let out = crate::proc::command(curl_bin())
        .args(["-fsS", "--max-time", "10", &url])
        .output()
        .map_err(|e| format!("Could not list Ollama models: {e}"))?;
    if !out.status.success() {
        return Err("Could not list Ollama models".to_string());
    }
    let tags: serde_json::Value = serde_json::from_slice(&out.stdout)
        .map_err(|e| format!("Ollama /api/tags was not valid JSON: {e}"))?;
    Ok(chat_models_from_tags(&tags))
}

fn chat_models_from_tags(tags: &serde_json::Value) -> Vec<String> {
    let Some(models) = tags.get("models").and_then(|m| m.as_array()) else {
        return Vec::new();
    };
    models
        .iter()
        .filter_map(|m| m.get("name").and_then(|n| n.as_str()))
        .filter(|name| {
            let lower = name.to_ascii_lowercase();
            !NON_CHAT_HINTS.iter().any(|hint| lower.contains(hint))
        })
        .map(str::to_string)
        .collect()
}

fn pull_model(name: &str) -> Result<(), String> {
    let url = format!("http://127.0.0.1:{OLLAMA_PORT}/api/pull");
    let payload = format!(r#"{{"name":"{name}","stream":false}}"#);
    let status = crate::proc::command(curl_bin())
        .args([
            "-fsS",
            "--max-time",
            &PULL_WAIT_SECS.to_string(),
            "-H",
            "Content-Type: application/json",
            "-d",
            &payload,
            &url,
        ])
        .status()
        .map_err(|e| format!("Could not pull {name}: {e}"))?;
    if !status.success() {
        return Err(format!(
            "ollama pull {name} failed ({status}). Check disk space and retry."
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn candidates_are_named() {
        for path in candidates() {
            let name = path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or_default()
                .to_ascii_lowercase();
            assert!(name.contains("ollama"), "unexpected candidate {path:?}");
        }
    }

    #[test]
    fn probe_does_not_panic() {
        let _ = is_running();
        let _ = is_installed();
    }

    #[test]
    fn default_model_is_stable_tag() {
        assert!(DEFAULT_MODEL.contains(':'));
    }

    #[test]
    fn chat_models_skip_embedding_only_installs() {
        let tags = serde_json::json!({
            "models": [
                {"name": "nomic-embed-text:latest"},
                {"name": "bge-reranker:latest"},
            ]
        });
        assert!(chat_models_from_tags(&tags).is_empty());
    }

    #[test]
    fn chat_models_keep_a_users_existing_model() {
        let tags = serde_json::json!({
            "models": [
                {"name": "nomic-embed-text:latest"},
                {"name": "llama3.1:8b"},
            ]
        });
        assert_eq!(
            chat_models_from_tags(&tags),
            vec!["llama3.1:8b".to_string()]
        );
    }

    #[test]
    fn chat_models_tolerate_missing_or_odd_payloads() {
        assert!(chat_models_from_tags(&serde_json::json!({})).is_empty());
        assert!(chat_models_from_tags(&serde_json::json!({"models": "nope"})).is_empty());
    }
}
