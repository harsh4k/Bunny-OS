//! User-triggered update checks (Updates panel).
//!
//! GitHub compare + local Ollama/model status. No silent polling.

use serde::{Deserialize, Serialize};

use crate::ollama::{self, DEFAULT_MODEL};
use crate::ollama_bootstrap::curl_bin;
use crate::proc::command;

pub const RELEASES_PAGE: &str = "https://github.com/harsh4k/Bunny-OS/releases";
pub const OLLAMA_DOWNLOAD_PAGE: &str = "https://ollama.com/download";
pub const PRIVACY_PAGE: &str = "https://harsh4k.github.io/Bunny-OS/privacy/";
pub const TERMS_PAGE: &str = "https://harsh4k.github.io/Bunny-OS/terms/";
pub const RELEASE_DOWNLOAD_PREFIX: &str = "https://github.com/harsh4k/Bunny-OS/releases/download/";
pub const LATEST_API: &str = "https://api.github.com/repos/harsh4k/Bunny-OS/releases/latest";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub struct UpdateCheck {
    pub current: String,
    pub latest: Option<String>,
    pub newer: bool,
    pub release_url: String,
    pub html_url: Option<String>,
    pub message: String,
    #[serde(default)]
    pub win_msi_url: Option<String>,
    #[serde(default)]
    pub mac_dmg_url: Option<String>,
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
struct GhAsset {
    name: String,
    browser_download_url: String,
}

#[derive(Deserialize)]
struct GhLatest {
    tag_name: String,
    #[serde(default)]
    html_url: Option<String>,
    #[serde(default)]
    assets: Vec<GhAsset>,
}

/// True when `url` is a Bunny OS release asset we may open in the browser.
pub fn is_allowed_download_url(url: &str) -> bool {
    if !url.starts_with(RELEASE_DOWNLOAD_PREFIX) {
        return false;
    }
    let rest = &url[RELEASE_DOWNLOAD_PREFIX.len()..];
    if rest.contains("..") || rest.contains('?') || rest.contains('#') {
        return false;
    }
    let Some((tag, file)) = rest.split_once('/') else {
        return false;
    };
    if tag.is_empty() || file.is_empty() || file.contains('/') {
        return false;
    }
    file.ends_with(".msi") || file.ends_with(".dmg")
}

fn pick_win_msi_url(assets: &[GhAsset]) -> Option<String> {
    const SUFFIXES: &[&str] = &["_x64_en-US.msi", ".msi"];
    for suffix in SUFFIXES {
        if let Some(a) = assets
            .iter()
            .find(|a| a.name.ends_with(suffix) && is_allowed_download_url(&a.browser_download_url))
        {
            return Some(a.browser_download_url.clone());
        }
    }
    None
}

fn pick_mac_dmg_url(assets: &[GhAsset]) -> Option<String> {
    const SUFFIXES: &[&str] = &["_aarch64.dmg", ".dmg"];
    for suffix in SUFFIXES {
        if let Some(a) = assets
            .iter()
            .find(|a| a.name.ends_with(suffix) && is_allowed_download_url(&a.browser_download_url))
        {
            return Some(a.browser_download_url.clone());
        }
    }
    None
}

fn update_check_message(latest_raw: &str, current: &str, newer: bool) -> String {
    if newer {
        format!("A newer release is available: {latest_raw}. Download the installer below.")
    } else if is_newer(current, latest_raw) {
        format!("You're running {current}, ahead of the latest published release ({latest_raw}).")
    } else {
        format!("You're on the latest published release ({latest_raw}).")
    }
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

    let (models, models_state, models_detail, models_attn, recommended_present) = if !running {
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
                    format!("No chat models installed. Pull recommended ({DEFAULT_MODEL}).")
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
    let win_msi_url = pick_win_msi_url(&parsed.assets);
    let mac_dmg_url = pick_mac_dmg_url(&parsed.assets);
    let message = update_check_message(&latest_raw, current, newer);
    Ok(UpdateCheck {
        current: current.to_string(),
        latest: Some(latest_raw),
        newer,
        release_url: RELEASES_PAGE.to_string(),
        html_url: html,
        message,
        win_msi_url,
        mac_dmg_url,
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
        _ => false,
    }
}

fn normalize_tag(s: &str) -> String {
    s.trim()
        .trim_start_matches('v')
        .trim_start_matches('V')
        .to_ascii_lowercase()
}

fn parse_semver(s: &str) -> Option<(u64, u64, u64, bool)> {
    let t = normalize_tag(s);
    let without_build = t.split_once('+').map_or(t.as_str(), |(core, _)| core);
    let (core, stable) = without_build
        .split_once('-')
        .map_or((without_build, true), |(core, _)| (core, false));
    let mut parts = core.split('.');
    let major = parts.next()?.parse().ok()?;
    let minor = parts.next().unwrap_or("0").parse().ok()?;
    let patch = parts.next().unwrap_or("0").parse().ok()?;
    if parts.next().is_some() {
        return None;
    }
    Some((major, minor, patch, stable))
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
        assert!(!is_newer("0.3.3", "0.3.4"));
        assert!(is_newer("0.3.4", "0.3.4-beta.1"));
        assert!(!is_newer("not-a-version", "0.3.4"));
    }

    #[test]
    fn board_has_recommended_model() {
        let board = dependency_board("0.1.0");
        assert_eq!(board.bunny_version, "0.1.0");
        assert_eq!(board.models.recommended, DEFAULT_MODEL);
    }

    #[test]
    fn download_url_allowlist() {
        assert!(is_allowed_download_url(
            "https://github.com/harsh4k/Bunny-OS/releases/download/v0.3.0/Bunny.OS_0.3.0_x64_en-US.msi"
        ));
        assert!(is_allowed_download_url(
            "https://github.com/harsh4k/Bunny-OS/releases/download/v0.3.0/Bunny.OS_0.3.0_aarch64.dmg"
        ));
        assert!(!is_allowed_download_url(
            "https://evil.example/releases/download/v0.3.0/x.msi"
        ));
        assert!(!is_allowed_download_url(
            "https://github.com/harsh4k/Bunny-OS/releases/download/../etc/passwd"
        ));
        assert!(!is_allowed_download_url(
            "https://github.com/harsh4k/Bunny-OS/releases/download/v0.3.0/notes.txt"
        ));
    }

    #[test]
    fn pick_preferred_release_assets() {
        let prefix = super::RELEASE_DOWNLOAD_PREFIX;
        let assets = vec![
            GhAsset {
                name: "other.msi".to_string(),
                browser_download_url: format!("{prefix}v0.3.4/other.msi"),
            },
            GhAsset {
                name: "Bunny.OS_0.3.4_x64_en-US.msi".to_string(),
                browser_download_url: format!("{prefix}v0.3.4/Bunny.OS_0.3.4_x64_en-US.msi"),
            },
            GhAsset {
                name: "Bunny.OS_0.3.4_aarch64.dmg".to_string(),
                browser_download_url: format!("{prefix}v0.3.4/Bunny.OS_0.3.4_aarch64.dmg"),
            },
            GhAsset {
                name: "Bunny.OS_0.3.4_universal.dmg".to_string(),
                browser_download_url: format!("{prefix}v0.3.4/Bunny.OS_0.3.4_universal.dmg"),
            },
        ];
        let win = pick_win_msi_url(&assets).expect("msi");
        assert!(win.ends_with("_x64_en-US.msi"));
        let mac = pick_mac_dmg_url(&assets).expect("dmg");
        assert!(mac.ends_with("_aarch64.dmg"));
    }

    #[test]
    fn update_message_ahead_of_latest() {
        let msg = update_check_message("v0.3.4", "0.3.5", false);
        assert!(msg.contains("ahead of the latest published release"));
        let latest = update_check_message("v0.3.4", "0.3.4", false);
        assert!(latest.contains("latest published release"));
        let newer = update_check_message("v0.3.5", "0.3.4", true);
        assert!(newer.contains("newer release is available"));
    }
}
