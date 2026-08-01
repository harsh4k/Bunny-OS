//! Download / install official Ollama (Windows + macOS).
//!
//! Uses argv-only tools (curl, hdiutil, cp, xattr) — never cmd.exe / powershell / shell=True.

use std::path::{Path, PathBuf};
use std::time::Duration;

use crate::proc::command;

#[cfg(target_os = "macos")]
pub const DOWNLOAD_URL: &str = "https://ollama.com/download/Ollama.dmg";
#[cfg(not(target_os = "macos"))]
pub const DOWNLOAD_URL: &str = "https://ollama.com/download/OllamaSetup.exe";

const INSTALL_WAIT_SECS: u64 = 180;
const POLL_MS: u64 = 500;

pub fn install_official(installed_path: impl Fn() -> Option<PathBuf>) -> Result<String, String> {
    let dir = download_dir()?;
    #[cfg(target_os = "macos")]
    {
        let dmg = dir.join("Ollama.dmg");
        download_file(DOWNLOAD_URL, &dmg)?;
        install_macos_dmg(&dmg)?;
    }
    #[cfg(not(target_os = "macos"))]
    {
        let setup = dir.join("OllamaSetup.exe");
        download_file(DOWNLOAD_URL, &setup)?;
        install_windows_setup(&setup)?;
    }
    let path = wait_until(INSTALL_WAIT_SECS, &installed_path)?;
    Ok(format!("Installed Ollama at {}", path.display()))
}

pub fn curl_bin() -> &'static str {
    if cfg!(target_os = "windows") {
        "curl.exe"
    } else {
        "curl"
    }
}

fn download_dir() -> Result<PathBuf, String> {
    let base = std::env::temp_dir().join("bunny-os-ollama");
    std::fs::create_dir_all(&base).map_err(|e| format!("temp dir: {e}"))?;
    Ok(base)
}

fn download_file(url: &str, dest: &Path) -> Result<(), String> {
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("mkdir: {e}"))?;
    }
    let dest_s = dest
        .to_str()
        .ok_or_else(|| "download path is not valid UTF-8".to_string())?;
    let status = command(curl_bin())
        .args([
            "-fL",
            "--connect-timeout",
            "30",
            "--retry",
            "3",
            "-o",
            dest_s,
            url,
        ])
        .status()
        .map_err(|e| {
            format!("Could not run curl to download Ollama ({e}). Check your network.")
        })?;
    if !status.success() {
        return Err(format!("Download failed (curl exit {status}). URL: {url}"));
    }
    let meta = std::fs::metadata(dest).map_err(|e| format!("download missing: {e}"))?;
    if meta.len() < 1_000_000 {
        return Err(format!(
            "Downloaded file looks too small ({} bytes) — check network / URL",
            meta.len()
        ));
    }
    Ok(())
}

fn wait_until(secs: u64, installed_path: &impl Fn() -> Option<PathBuf>) -> Result<PathBuf, String> {
    let deadline = std::time::Instant::now() + Duration::from_secs(secs);
    while std::time::Instant::now() < deadline {
        if let Some(path) = installed_path() {
            return Ok(path);
        }
        std::thread::sleep(Duration::from_millis(POLL_MS));
    }
    Err(format!(
        "Ollama did not appear in the usual install locations within {secs}s"
    ))
}

#[cfg(not(target_os = "macos"))]
fn install_windows_setup(setup: &Path) -> Result<(), String> {
    let status = command(setup)
        .arg("/S")
        .status()
        .map_err(|e| format!("Could not launch OllamaSetup.exe: {e}"))?;
    if !status.success() {
        open::that(setup).map_err(|e| {
            format!("Silent install failed ({status}); interactive open also failed: {e}")
        })?;
    }
    Ok(())
}

#[cfg(target_os = "macos")]
fn install_macos_dmg(dmg: &Path) -> Result<(), String> {
    let attach = command("/usr/bin/hdiutil")
        .args([
            "attach",
            "-nobrowse",
            "-readonly",
            dmg.to_str().ok_or("dmg path")?,
        ])
        .output()
        .map_err(|e| format!("hdiutil attach failed: {e}"))?;
    if !attach.status.success() {
        return Err(format!(
            "hdiutil attach failed: {}",
            String::from_utf8_lossy(&attach.stderr)
        ));
    }
    let stdout = String::from_utf8_lossy(&attach.stdout);
    let mount = stdout
        .lines()
        .rev()
        .find_map(|line| {
            line.split_whitespace()
                .find(|p| p.starts_with("/Volumes/"))
                .map(|s| s.to_string())
        })
        .ok_or_else(|| "Could not find DMG mount point".to_string())?;

    let result = (|| -> Result<(), String> {
        let entries = std::fs::read_dir(&mount).map_err(|e| format!("read mount: {e}"))?;
        let app = entries
            .flatten()
            .map(|e| e.path())
            .find(|p| p.extension().and_then(|e| e.to_str()) == Some("app"))
            .ok_or_else(|| "No .app inside Ollama.dmg".to_string())?;
        let dest = PathBuf::from("/Applications").join(
            app.file_name()
                .ok_or_else(|| "bad app name".to_string())?,
        );
        if dest.exists() {
            let _ = std::fs::remove_dir_all(&dest);
        }
        let status = command("/bin/cp")
            .args([
                "-R",
                app.to_str().ok_or("app path")?,
                dest.to_str().ok_or("dest path")?,
            ])
            .status()
            .map_err(|e| format!("cp failed: {e}"))?;
        if !status.success() {
            return Err(format!("cp -R into /Applications failed ({status})"));
        }
        let _ = command("/usr/bin/xattr")
            .args(["-dr", "com.apple.quarantine", dest.to_str().unwrap_or("")])
            .status();
        Ok(())
    })();

    let _ = command("/usr/bin/hdiutil")
        .args(["detach", &mount, "-quiet"])
        .status();
    result
}
