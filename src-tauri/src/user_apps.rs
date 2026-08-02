//! Persistent user app catalog + last Start Menu / Applications scan.
//!
//! Stored at `%LOCALAPPDATA%\BunnyOS\user_apps.json` (Windows) or
//! `~/Library/Application Support/BunnyOS/user_apps.json` (macOS).
//! Same path as the Python sidecar (`paths.user_apps_path`).

use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

use crate::start_menu::discover_installed_apps;

const MAX_ALIASES: usize = 100;
const MAX_CUSTOM: usize = 100;
const MAX_NAME_LEN: usize = 200;
const MAX_SCANNED: usize = 2_000;

const FORBIDDEN_STEMS: &[&str] = &[
    "cmd",
    "cmd.exe",
    "powershell",
    "powershell.exe",
    "pwsh",
    "pwsh.exe",
    "osascript",
    "bash",
    "zsh",
    "sh",
    "wscript",
    "cscript",
    "mshta",
];

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct UserAppsFile {
    #[serde(default)]
    pub aliases: HashMap<String, String>,
    #[serde(default)]
    pub custom: Vec<CustomApp>,
    #[serde(default)]
    pub scanned: Vec<ScannedApp>,
    #[serde(default)]
    pub scanned_at: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CustomApp {
    pub id: String,
    pub name: String,
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScannedApp {
    pub name: String,
    pub source: String,
    #[serde(default)]
    pub path: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct AppListEntry {
    pub id: Option<String>,
    pub name: String,
    pub source: String,
    pub path: String,
    pub removable: bool,
}

fn app_data_dir() -> PathBuf {
    if let Ok(override_dir) = std::env::var("BUNNY_APP_DATA") {
        return PathBuf::from(override_dir);
    }
    if cfg!(target_os = "macos") {
        let home = std::env::var_os("HOME")
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from("."));
        return home
            .join("Library")
            .join("Application Support")
            .join("BunnyOS");
    }
    let base = std::env::var_os("LOCALAPPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("."));
    base.join("BunnyOS")
}

pub fn user_apps_path() -> PathBuf {
    app_data_dir().join("user_apps.json")
}

pub fn load() -> UserAppsFile {
    let path = user_apps_path();
    let Ok(raw) = fs::read_to_string(&path) else {
        return UserAppsFile::default();
    };
    serde_json::from_str(&raw).unwrap_or_default()
}

pub fn save(file: &UserAppsFile) -> Result<(), String> {
    let dir = app_data_dir();
    fs::create_dir_all(&dir).map_err(|e| format!("Could not create app data dir: {e}"))?;
    let path = user_apps_path();
    let tmp = path.with_extension("json.tmp");
    let body = serde_json::to_string_pretty(file).map_err(|e| format!("serialize: {e}"))?;
    fs::write(&tmp, body).map_err(|e| format!("Could not write user apps: {e}"))?;
    fs::rename(&tmp, &path).map_err(|e| format!("Could not save user apps: {e}"))?;
    Ok(())
}

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn new_id() -> String {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| format!("{:x}", d.as_nanos()))
        .unwrap_or_else(|_| "app".into())
}

fn sanitize_name(name: &str) -> Result<String, String> {
    let trimmed = name.trim();
    if trimmed.is_empty() || trimmed.len() > MAX_NAME_LEN {
        return Err(format!("name must be 1-{MAX_NAME_LEN} characters"));
    }
    let bad: &[char] = &[
        '/', '\\', ':', '*', '?', '"', '<', '>', '|', '\0', '\n', '\r',
    ];
    if trimmed.chars().any(|c| bad.contains(&c)) {
        return Err("name contains invalid characters".to_string());
    }
    Ok(trimmed.to_string())
}

pub fn validate_launch_path(path: &Path) -> Result<(), String> {
    if !path.is_absolute() {
        return Err("path must be absolute".to_string());
    }
    let file_name = path
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_lowercase();
    if file_name.is_empty() {
        return Err("path has no file name".to_string());
    }
    if FORBIDDEN_STEMS.iter().any(|f| file_name == *f) {
        return Err("that program is not allowed".to_string());
    }

    #[cfg(target_os = "macos")]
    {
        // .app is a directory bundle
        if path.extension().and_then(|e| e.to_str()) == Some("app") {
            if path.is_dir() || path.exists() {
                return Ok(());
            }
            return Err("app bundle not found".to_string());
        }
    }

    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    let allowed = if cfg!(target_os = "macos") {
        matches!(ext.as_str(), "app")
    } else {
        matches!(ext.as_str(), "lnk" | "exe")
    };
    if !allowed {
        return Err(if cfg!(target_os = "macos") {
            "only .app bundles are allowed".to_string()
        } else {
            "only .lnk or .exe files are allowed".to_string()
        });
    }
    if !path.exists() {
        return Err("file not found".to_string());
    }
    Ok(())
}

/// Rescan Start Menu / Applications and persist into `user_apps.json`.
pub fn rescan_and_store() -> Result<UserAppsFile, String> {
    let discovered = discover_installed_apps();
    let source = if cfg!(target_os = "macos") {
        "applications"
    } else {
        "start_menu"
    };
    let mut scanned: Vec<ScannedApp> = discovered
        .into_iter()
        .map(|(_key, path)| {
            let display = path
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("app")
                .to_string();
            ScannedApp {
                name: display,
                source: source.to_string(),
                path: path.to_string_lossy().into_owned(),
            }
        })
        .collect();
    scanned.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    scanned.dedup_by(|a, b| a.name.eq_ignore_ascii_case(&b.name));
    if scanned.len() > MAX_SCANNED {
        scanned.truncate(MAX_SCANNED);
    }

    let mut file = load();
    file.scanned = scanned;
    file.scanned_at = Some(now_secs());
    save(&file)?;
    Ok(file)
}

/// List for the Apps panel: custom first, then last scan (rescans if empty).
pub fn list_apps(force_rescan: bool) -> Result<Vec<AppListEntry>, String> {
    let mut file = load();
    if force_rescan || file.scanned.is_empty() {
        file = rescan_and_store()?;
    }

    let mut out: Vec<AppListEntry> = Vec::new();

    for c in &file.custom {
        out.push(AppListEntry {
            id: Some(c.id.clone()),
            name: c.name.clone(),
            source: "user".to_string(),
            path: c.path.clone(),
            removable: true,
        });
    }

    let custom_keys: std::collections::HashSet<String> = file
        .custom
        .iter()
        .map(|c| c.name.to_lowercase())
        .collect();

    for s in &file.scanned {
        if custom_keys.contains(&s.name.to_lowercase()) {
            continue;
        }
        out.push(AppListEntry {
            id: None,
            name: s.name.clone(),
            source: s.source.clone(),
            path: s.path.clone(),
            removable: false,
        });
    }

    // Alias rows (nicknames) as removable meta entries
    for (alias, target) in &file.aliases {
        out.push(AppListEntry {
            id: Some(format!("alias:{alias}")),
            name: format!("{alias} → {target}"),
            source: "alias".to_string(),
            path: String::new(),
            removable: true,
        });
    }

    Ok(out)
}

pub fn add_alias(alias: &str, target: &str) -> Result<UserAppsFile, String> {
    let alias = sanitize_name(alias)?.to_lowercase();
    let target = sanitize_name(target)?.to_lowercase();
    let mut file = load();
    if file.aliases.len() >= MAX_ALIASES && !file.aliases.contains_key(&alias) {
        return Err(format!("alias limit is {MAX_ALIASES}"));
    }
    file.aliases.insert(alias, target);
    save(&file)?;
    Ok(file)
}

pub fn add_custom(name: &str, path: &Path) -> Result<CustomApp, String> {
    let name = sanitize_name(name)?;
    validate_launch_path(path)?;
    let mut file = load();
    if file.custom.len() >= MAX_CUSTOM {
        return Err(format!("custom app limit is {MAX_CUSTOM}"));
    }
    let key = name.to_lowercase();
    if file.custom.iter().any(|c| c.name.eq_ignore_ascii_case(&name)) {
        return Err("an app with that name already exists".to_string());
    }
    // Prefer custom over colliding scanned display later; also clear alias with same key.
    file.aliases.remove(&key);
    let entry = CustomApp {
        id: new_id(),
        name,
        path: path.to_string_lossy().into_owned(),
    };
    file.custom.push(entry.clone());
    save(&file)?;
    Ok(entry)
}

pub fn remove_user_entry(id: &str) -> Result<(), String> {
    let mut file = load();
    if let Some(alias) = id.strip_prefix("alias:") {
        if file.aliases.remove(alias).is_none() {
            return Err("alias not found".to_string());
        }
        save(&file)?;
        return Ok(());
    }
    let before = file.custom.len();
    file.custom.retain(|c| c.id != id);
    if file.custom.len() == before {
        return Err("app not found".to_string());
    }
    save(&file)?;
    Ok(())
}

/// Resolve a launch path using custom apps + aliases + live Start Menu / Applications.
pub fn resolve_path(app_name: &str) -> Result<PathBuf, String> {
    let file = load();
    let key = app_name.to_lowercase();

    if let Some(c) = file
        .custom
        .iter()
        .find(|c| c.name.eq_ignore_ascii_case(app_name))
    {
        let p = PathBuf::from(&c.path);
        validate_launch_path(&p)?;
        return Ok(p);
    }

    let alias_target = file
        .aliases
        .get(&key)
        .map(|s| s.as_str())
        .unwrap_or(app_name);

    resolve_from_discovery(alias_target)
}

fn resolve_from_discovery(app_name: &str) -> Result<PathBuf, String> {
    let apps = discover_installed_apps();
    let key = app_name.to_lowercase();

    if let Some(path) = apps.get(&key) {
        return Ok(path.clone());
    }

    let prefix: Vec<&PathBuf> = apps
        .iter()
        .filter(|(name, _)| name.starts_with(&key))
        .map(|(_, p)| p)
        .collect();
    if prefix.len() == 1 {
        return Ok(prefix[0].clone());
    }

    let hits: Vec<&PathBuf> = apps
        .iter()
        .filter(|(name, _)| name.contains(&key) || key.contains(name.as_str()))
        .map(|(_, p)| p)
        .collect();
    if hits.len() == 1 {
        return Ok(hits[0].clone());
    }

    let needle = key.get(..4.min(key.len())).unwrap_or(&key);
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
            "App '{app_name}' not found in {catalog}. Add it under Apps, or check the spelling."
        ))
    } else {
        Err(format!(
            "App '{app_name}' not found. Did you mean: {}?",
            suggestions.join(", ")
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    static LOCK: Mutex<()> = Mutex::new(());

    fn with_temp_data<R>(f: impl FnOnce() -> R) -> R {
        let _g = LOCK.lock().unwrap();
        let dir = std::env::temp_dir().join(format!("bunny-user-apps-{}", new_id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        std::env::set_var("BUNNY_APP_DATA", &dir);
        let out = f();
        std::env::remove_var("BUNNY_APP_DATA");
        let _ = fs::remove_dir_all(&dir);
        out
    }

    #[test]
    fn rejects_shell_binaries() {
        with_temp_data(|| {
            let p = PathBuf::from(if cfg!(windows) {
                r"C:\Windows\System32\cmd.exe"
            } else {
                "/bin/bash"
            });
            assert!(validate_launch_path(&p).is_err());
        });
    }

    #[test]
    fn alias_roundtrip() {
        with_temp_data(|| {
            add_alias("chrome", "Google Chrome").unwrap();
            let file = load();
            assert_eq!(
                file.aliases.get("chrome").map(String::as_str),
                Some("google chrome")
            );
            remove_user_entry("alias:chrome").unwrap();
            assert!(!load().aliases.contains_key("chrome"));
        });
    }

    #[test]
    fn custom_persists() {
        with_temp_data(|| {
            let dir = PathBuf::from(std::env::var("BUNNY_APP_DATA").unwrap());
            let fake = if cfg!(windows) {
                let p = dir.join("Demo.lnk");
                fs::write(&p, b"").unwrap();
                p
            } else {
                let p = dir.join("Demo.app");
                fs::create_dir_all(&p).unwrap();
                p
            };
            let entry = add_custom("Demo App", &fake).unwrap();
            assert_eq!(load().custom.len(), 1);
            remove_user_entry(&entry.id).unwrap();
            assert!(load().custom.is_empty());
        });
    }
}
