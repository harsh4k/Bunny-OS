//! Start Menu .lnk discovery for the action broker.
//!
//! Scans only known user/common Start Menu directories. Does not follow
//! directory symlinks. Depth and entry count are hard-capped.

use std::collections::HashMap;
use std::path::{Path, PathBuf};

const MAX_START_MENU_DEPTH: usize = 8;
const MAX_START_MENU_ENTRIES: usize = 2_000;

/// Discover .lnk files from known Start Menu directories.
/// User Start Menu takes precedence over Common Start Menu.
pub fn discover_start_menu_apps() -> HashMap<String, PathBuf> {
    let mut apps: HashMap<String, PathBuf> = HashMap::new();

    if let Ok(appdata) = std::env::var("APPDATA") {
        let p = PathBuf::from(appdata)
            .join("Microsoft")
            .join("Windows")
            .join("Start Menu")
            .join("Programs");
        collect_lnk_files(&p, &mut apps);
    }

    if let Ok(programdata) = std::env::var("PROGRAMDATA") {
        let p = PathBuf::from(programdata)
            .join("Microsoft")
            .join("Windows")
            .join("Start Menu")
            .join("Programs");
        collect_lnk_files(&p, &mut apps);
    }

    apps
}

fn collect_lnk_files(dir: &Path, apps: &mut HashMap<String, PathBuf>) {
    collect_lnk_files_bounded(dir, apps, 0);
}

fn collect_lnk_files_bounded(dir: &Path, apps: &mut HashMap<String, PathBuf>, depth: usize) {
    if depth > MAX_START_MENU_DEPTH || apps.len() >= MAX_START_MENU_ENTRIES {
        return;
    }
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        if apps.len() >= MAX_START_MENU_ENTRIES {
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn discover_does_not_panic() {
        let apps = discover_start_menu_apps();
        let _ = apps.len();
    }
}
