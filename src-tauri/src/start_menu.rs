//! Installed-app discovery for the action broker.
//!
//! Windows: Start Menu `.lnk` files (user then common).
//! macOS: `.app` bundles under `/Applications`, `/System/Applications`, `~/Applications`.
//!
//! Does not follow directory symlinks. Depth and entry count are hard-capped.

use std::collections::HashMap;
use std::path::{Path, PathBuf};

const MAX_SCAN_DEPTH: usize = 8;
const MAX_SCAN_ENTRIES: usize = 2_000;

/// Cross-platform installed-app map: lowercase display name → path.
pub fn discover_installed_apps() -> HashMap<String, PathBuf> {
    if cfg!(target_os = "macos") {
        discover_macos_apps()
    } else {
        discover_start_menu_apps()
    }
}

/// Discover `.lnk` files from known Start Menu + Desktop directories.
/// User locations take precedence over common / public ones.
pub fn discover_start_menu_apps() -> HashMap<String, PathBuf> {
    let mut apps: HashMap<String, PathBuf> = HashMap::new();

    if let Ok(appdata) = std::env::var("APPDATA") {
        // Walk Start Menu root (covers Programs/ and pinned items).
        let p = PathBuf::from(appdata)
            .join("Microsoft")
            .join("Windows")
            .join("Start Menu");
        collect_lnk_files(&p, &mut apps);
    }

    if let Ok(programdata) = std::env::var("PROGRAMDATA") {
        let p = PathBuf::from(programdata)
            .join("Microsoft")
            .join("Windows")
            .join("Start Menu");
        collect_lnk_files(&p, &mut apps);
    }

    // Desktop shortcuts people actually launch.
    if let Ok(userprofile) = std::env::var("USERPROFILE") {
        collect_lnk_files(&PathBuf::from(userprofile).join("Desktop"), &mut apps);
    }
    if let Ok(public) = std::env::var("PUBLIC") {
        collect_lnk_files(&PathBuf::from(public).join("Desktop"), &mut apps);
    }

    apps
}

/// Scan standard macOS Applications folders for `*.app` bundles.
#[cfg(target_os = "macos")]
pub fn discover_macos_apps() -> HashMap<String, PathBuf> {
    let mut apps: HashMap<String, PathBuf> = HashMap::new();
    let mut roots = vec![
        PathBuf::from("/Applications"),
        PathBuf::from("/System/Applications"),
    ];
    if let Ok(home) = std::env::var("HOME") {
        roots.push(PathBuf::from(home).join("Applications"));
    }
    for root in roots {
        collect_app_bundles(&root, &mut apps, 0);
    }
    apps
}

#[cfg(not(target_os = "macos"))]
fn discover_macos_apps() -> HashMap<String, PathBuf> {
    HashMap::new()
}

fn collect_lnk_files(dir: &Path, apps: &mut HashMap<String, PathBuf>) {
    collect_lnk_files_bounded(dir, apps, 0);
}

fn collect_lnk_files_bounded(dir: &Path, apps: &mut HashMap<String, PathBuf>, depth: usize) {
    if depth > MAX_SCAN_DEPTH || apps.len() >= MAX_SCAN_ENTRIES {
        return;
    }
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        if apps.len() >= MAX_SCAN_ENTRIES {
            return;
        }
        let path = entry.path();
        let Ok(meta) = std::fs::symlink_metadata(&path) else {
            continue;
        };
        if meta.file_type().is_symlink() {
            continue;
        }
        if meta.is_dir() {
            collect_lnk_files_bounded(&path, apps, depth + 1);
        } else if path
            .extension()
            .map_or(false, |e| e.eq_ignore_ascii_case("lnk"))
        {
            if let Some(stem) = path.file_stem().and_then(|s| s.to_str()) {
                let key = stem.to_lowercase();
                apps.entry(key).or_insert(path);
            }
        }
    }
}

#[cfg(target_os = "macos")]
fn collect_app_bundles(dir: &Path, apps: &mut HashMap<String, PathBuf>, depth: usize) {
    if depth > MAX_SCAN_DEPTH || apps.len() >= MAX_SCAN_ENTRIES {
        return;
    }
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        if apps.len() >= MAX_SCAN_ENTRIES {
            return;
        }
        let path = entry.path();
        let Ok(meta) = std::fs::symlink_metadata(&path) else {
            continue;
        };
        if meta.file_type().is_symlink() {
            continue;
        }
        if !meta.is_dir() {
            continue;
        }
        let is_app = path
            .extension()
            .map_or(false, |e| e.eq_ignore_ascii_case("app"));
        if is_app {
            if let Some(stem) = path.file_stem().and_then(|s| s.to_str()) {
                let key = stem.to_lowercase();
                apps.entry(key).or_insert(path);
            }
        } else if depth < 2 {
            // One level of nesting (e.g. /Applications/Utilities/*.app).
            collect_app_bundles(&path, apps, depth + 1);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn discover_does_not_panic() {
        let apps = discover_installed_apps();
        let _ = apps.len();
    }

    #[test]
    fn start_menu_discover_does_not_panic() {
        let apps = discover_start_menu_apps();
        let _ = apps.len();
    }
}
