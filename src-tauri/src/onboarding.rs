//! First-run onboarding completion — persisted on disk so reinstall / fresh
//! WebView profiles still show the wizard (localStorage alone is unreliable).

use std::fs;
use std::path::PathBuf;

use crate::user_apps;

fn marker_path() -> PathBuf {
    user_apps::app_data_dir().join("onboarding.v2.complete")
}

pub fn is_complete() -> bool {
    marker_path().is_file()
}

pub fn mark_complete() -> Result<(), String> {
    let dir = user_apps::app_data_dir();
    fs::create_dir_all(&dir).map_err(|e| format!("Could not create app data dir: {e}"))?;
    fs::write(marker_path(), b"1").map_err(|e| format!("Could not save onboarding flag: {e}"))
}
