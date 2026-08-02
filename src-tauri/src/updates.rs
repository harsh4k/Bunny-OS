//! User-triggered update checks (Updates panel).
//!
//! GitHub compare + local Ollama/model status. No silent polling.

use serde::{Deserialize, Serialize};

use crate::ollama::{self, DEFAULT_MODEL};
use crate::ollama_bootstrap::curl_bin;
use crate::proc::command;

pub const RELEASES_PAGE: &str = "https://github.com/harsh4k/Bunny-OS/releases";
pub const OLLAMA_DOWNLOAD_PAGE: &str = "https://ollama.com/download";
pub const PRIVACY_PAGE: &str = "https://harsh4k.github.io/Bunny-OS/privacy.html";
pub const TERMS_PAGE: &str = "https://harsh4k.github.io/Bunny-OS/terms.html";
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

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub struct DependencyBoard {
    pub bunny_version: String,
    pub ollama: ComponentRow,
    pub models: ModelsRow,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub struct ComponentRow {
    pub title: String,
    pub state: String,
    pub detail: String,
    pub needs_attention: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub struct ModelsRow {
    pub title: String,
    pub state: String,
    pub detail: String,
    pub needs_attention: bool,
    pub recommended: String,
    pub recommended_present: bool,
    pub installed: Vec<String>,
}

#[derive(Deserialize)]
struct GhLatest {
    tag_name: String,
    #[serde(default)]
    html_url: Option<String>,
}

/// Snapshot for the Updates status board (local probes only — no GitHub).
pub fn dependency_board(bunny_version: &str) -> DependencyBoard {
    let installed = ollama::is_installed();
    let running = ollama::is_running();
    let version = ollama::version_string();

    let (ollama_state, ollama_detail, ollama_attn) = if !installed {
        (
            "Missing".to_string(),
            "Ollama is not installed. Use Install & start, or open the Ollama download page."
                .to_string(),
            true,
        )
    } else if !running {
        (
            "Installed · stopped".to_string(),
            match &version {
                Some(v) => format!("{v}. Start Ollama so chat and model checks work."),
                None => "Start Ollama so chat and model checks work.".to_string(),
            },
            true,
        )
    } else {
        (
            "Running".to_string(),
            match &version {
                Some(v) => format!(
                    "{v}. Ollama app updates come from their installer — open Download for a newer build."
                ),
                None => {
                    "Ollama is running. Open Download if you need a newer Ollama app build."
                        .to_string()
                }
            },
            false,
        )
    };

    let (models, models_state, models_detail, models_attn, recommended_present) =
        if !running {
            (
                Vec::new(),
                "Unknown".to_string(),
                "Start Ollama to see installed chat models.".to_string(),
                true,
                false,
            )
        } else {
            match ollama::list_chat_models() {
                Ok(list) => {
                    let present = list
                        .iter()
                        .any(|m| m == DEFAULT_MODEL || m.starts_with("llama3.2:1b"));
                    let detail = if list.is_empty() {
                        format!(
                            "No chat models installed. Pull recommended ({DEFAULT_MODEL})."
                        )
                    } else if present {
                        format!(
                            "{} model(s) installed. Recommended {DEFAULT_MODEL} is present.",
                            list.len()
                        )
                    } else {
                        format!(
                            "{} model(s) installed, but recommended {DEFAULT_MODEL} is missing.",
                            list.len()
                        )
                    };
                    let attn = list.is_empty() || !present;
                    let state = if list.is_empty() {
                        "None installed".to_string()
                    } else if present {
                        "Ready".to_string()
                    } else {
                        "Recommended missing".to_string()
                    };
                    (list, state, detail, attn, present)
                }
                Err(e) => (Vec::new(), "Error".to_string(), e, true, false),
            }
        };

    DependencyBoard {
        bunny_version: bunny_version.to_string(),
        ollama: ComponentRow {
            title: "Ollama".to_string(),
            state: ollama_state,
            detail: ollama_detail,
            needs_attention: ollama_attn,
        },
        models: ModelsRow {
            title: "Chat models".to_string(),
            state: models_state,
            detail: models_detail,
            needs_attention: models_attn,
            recommended: DEFAULT_MODEL.to_string(),
            recommended_present,
            installed: models,
        },
    }
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

    #[test]
    fn board_has_recommended_model() {
        let board = dependency_board("0.1.0");
        assert_eq!(board.bunny_version, "0.1.0");
        assert_eq!(board.models.recommended, DEFAULT_MODEL);
    }
}
