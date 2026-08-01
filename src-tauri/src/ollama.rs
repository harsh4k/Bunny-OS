//! Ollama reachability probe + launcher.
//!
//! Bunny OS never bundles Ollama; the user installs and runs it. Everything
//! here is a localhost TCP probe plus a LaunchServices / ShellExecute launch of
//! the installed app — no cmd.exe, no PowerShell, no network beyond 127.0.0.1.

use std::net::{Ipv4Addr, SocketAddr, TcpStream};
use std::path::PathBuf;
use std::time::Duration;

pub const OLLAMA_PORT: u16 = 11434;

const PROBE_TIMEOUT_MS: u64 = 400;
/// Ollama loads its model index on boot; give it a generous window.
const LAUNCH_WAIT_SECS: u64 = 20;
const LAUNCH_POLL_MS: u64 = 500;

/// True when something is accepting connections on the Ollama port.
pub fn is_running() -> bool {
    let addr = SocketAddr::from((Ipv4Addr::LOCALHOST, OLLAMA_PORT));
    TcpStream::connect_timeout(&addr, Duration::from_millis(PROBE_TIMEOUT_MS)).is_ok()
}

/// Installed Ollama executables / apps, most preferred first.
fn candidates() -> Vec<PathBuf> {
    #[cfg(target_os = "macos")]
    {
        return macos_candidates();
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

/// Path to an installed Ollama executable, if one exists.
pub fn installed_path() -> Option<PathBuf> {
    candidates().into_iter().find(|p| p.exists())
}

/// Launch Ollama and block until the port answers or we give up.
///
/// Returns `Ok` with a human-readable status. Safe to call when already
/// running — it short-circuits.
pub fn launch_and_wait() -> Result<String, String> {
    if is_running() {
        return Ok("Ollama is already running".to_string());
    }

    let exe = installed_path().ok_or_else(|| {
        "Ollama is not installed. Download it from https://ollama.com/download".to_string()
    })?;

    open::that(&exe).map_err(|e| format!("Could not start Ollama ({}): {e}", exe.display()))?;

    let deadline = std::time::Instant::now() + Duration::from_secs(LAUNCH_WAIT_SECS);
    while std::time::Instant::now() < deadline {
        if is_running() {
            return Ok("Ollama started".to_string());
        }
        std::thread::sleep(Duration::from_millis(LAUNCH_POLL_MS));
    }

    Err(format!(
        "Started {} but nothing answered on port {OLLAMA_PORT} within {LAUNCH_WAIT_SECS}s",
        exe.display()
    ))
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
            assert!(
                name.contains("ollama"),
                "unexpected candidate {path:?}"
            );
        }
    }

    #[test]
    fn probe_does_not_panic() {
        let _ = is_running();
    }
}
