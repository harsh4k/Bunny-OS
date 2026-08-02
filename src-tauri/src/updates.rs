//! User-triggered GitHub release check (Updates panel).
//!
//! One HTTPS GET via curl argv — never silent, never shell. Same class as
//! youtube_play / Ollama bootstrap network use.

use serde::{Deserialize, Serialize};

use crate::ollama_bootstrap::curl_bin;
use crate::proc::command;

pub const RELEASES_PAGE: &str = "https://github.com/harsh4k/Bunny-OS/releases";
pub const LATEST_API: &str =
    "https://api.github.com/repos/harsh4k/Bunny-OS/releases/latest";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub struct UpdateCheck {
    pub current: String,
    pub latest: Option<String>,
    pub newer: bool,
    pub release_url: String,
    pub html_url: Option<String>,
    pub message: String,
}

#[derive(Deserialize)]
struct GhLatest {
    tag_name: String,
    #[serde(default)]
    html_url: Option<String>,
}

/// Fetch latest GitHub release tag and compare to `current` (e.g. "0.1.0").
pub fn check_latest(current: &str) -> Result<UpdateCheck, String> {
    let body = fetch_latest_json()?;
    let parsed: GhLatest = serde_json::from_str(&body)
        .map_err(|e| format!("Could not parse GitHub release JSON: {e}"))?;
    let latest_raw = parsed.tag_name.trim().to_string();
    if latest_raw.is_empty() {
        return Err("GitHub returned an empty release tag.".to_string());
    }
    let newer = is_newer(&latest_raw, current);
    let html = parsed
        .html_url
        .filter(|u| u.starts_with("https://github.com/"));
    let message = if newer {
        format!("A newer release is available: {latest_raw}. Install over your current build from Releases.")
    } else {
        format!("You're on the latest published release ({latest_raw}).")
    };
    Ok(UpdateCheck {
        current: current.to_string(),
        latest: Some(latest_raw),
        newer,
        release_url: RELEASES_PAGE.to_string(),
        html_url: html,
        message,
    })
}

fn fetch_latest_json() -> Result<String, String> {
    let output = command(curl_bin())
        .args([
            "-fsSL",
            "--connect-timeout",
            "15",
            "--max-time",
            "30",
            "-H",
            "Accept: application/vnd.github+json",
            "-H",
            "User-Agent: BunnyOS-UpdateCheck",
            LATEST_API,
        ])
        .output()
        .map_err(|e| {
            format!("Could not reach GitHub ({e}). Check your network, then try again.")
        })?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!(
            "GitHub release check failed (curl {}). {}",
            output.status,
            stderr.trim()
        ));
    }
    let body = String::from_utf8(output.stdout)
        .map_err(|_| "GitHub response was not valid UTF-8.".to_string())?;
    if body.len() > 512_000 {
        return Err("GitHub response was unexpectedly large.".to_string());
    }
    Ok(body)
}

/// Compare release tags like `v0.2.0` / `0.2.0` against installed `0.1.0`.
pub fn is_newer(latest: &str, current: &str) -> bool {
    match (parse_semver(latest), parse_semver(current)) {
        (Some(l), Some(c)) => l > c,
        _ => normalize_tag(latest) != normalize_tag(current),
    }
}

fn normalize_tag(s: &str) -> String {
    s.trim()
        .trim_start_matches('v')
        .trim_start_matches('V')
        .to_ascii_lowercase()
}

fn parse_semver(s: &str) -> Option<(u64, u64, u64)> {
    let t = normalize_tag(s);
    let mut parts = t.split('.');
    let major = parts.next()?.parse().ok()?;
    let minor = parts.next().unwrap_or("0").parse().ok()?;
    let patch = parts
        .next()
        .unwrap_or("0")
        .split(|c: char| !c.is_ascii_digit())
        .next()?
        .parse()
        .ok()?;
    Some((major, minor, patch))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn semver_newer() {
        assert!(is_newer("v0.2.0", "0.1.0"));
        assert!(is_newer("0.1.1", "0.1.0"));
        assert!(!is_newer("0.1.0", "0.1.0"));
        assert!(!is_newer("v0.1.0", "0.1.0"));
        assert!(!is_newer("0.0.9", "0.1.0"));
    }
}
