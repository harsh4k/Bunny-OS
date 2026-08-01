//! Ollama reachability, launch, and first-run bootstrap (approach A).
//!
//! If Ollama is missing, Bunny downloads the official installer, runs it,
//! waits for :11434, then pulls a small default chat model.

use std::net::{Ipv4Addr, SocketAddr, TcpStream};
use std::path::PathBuf;
use std::process::Command;
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

fn ensure_default_model() -> Result<String, String> {
    if model_installed(DEFAULT_MODEL)? {
        return Ok(format!("Model {DEFAULT_MODEL} ready"));
    }
    pull_model(DEFAULT_MODEL)?;
    if model_installed(DEFAULT_MODEL)? {
        return Ok(format!("Pulled {DEFAULT_MODEL}"));
    }
    Err(format!(
        "Pulled {DEFAULT_MODEL} but it is not listed yet — open Models and retry if chat fails"
    ))
}

fn model_installed(name: &str) -> Result<bool, String> {
    let url = format!("http://127.0.0.1:{OLLAMA_PORT}/api/tags");
    let out = Command::new(curl_bin())
        .args(["-fsS", "--max-time", "10", &url])
        .output()
        .map_err(|e| format!("Could not list Ollama models: {e}"))?;
    if !out.status.success() {
        return Err("Could not list Ollama models".to_string());
    }
    let body = String::from_utf8_lossy(&out.stdout);
    Ok(body.contains(&format!("\"{name}\"")) || body.contains(name))
}

fn pull_model(name: &str) -> Result<(), String> {
    let url = format!("http://127.0.0.1:{OLLAMA_PORT}/api/pull");
    let payload = format!(r#"{{"name":"{name}","stream":false}}"#);
    let status = Command::new(curl_bin())
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
}
