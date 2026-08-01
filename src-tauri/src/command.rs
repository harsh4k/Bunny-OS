//! Sidecar command resolution.
//!
//! Determines whether to invoke the Python source tree (debug) or a
//! pre-compiled PyInstaller binary (release).  All other sidecar logic
//! lives in `sidecar.rs`; this module has no async dependencies.

use tauri::Manager;

/// Resolved sidecar command: program path + argument list.
pub struct SidecarCommand {
    pub program: String,
    pub args: Vec<String>,
}

/// Resolve the sidecar command for the current build profile.
///
/// - **debug** – runs Python source directly:
///   `python sidecar/main.py`
/// - **release** – expects a pre-compiled binary under `resource_dir`
///   named for the host triple (Tauri `externalBin` convention).
///
/// Returns `Err` in release mode when the binary is absent; the supervisor
/// treats this as an immediate `Error` lifecycle transition.
pub fn resolve_command(app: &tauri::AppHandle) -> Result<SidecarCommand, String> {
    if cfg!(debug_assertions) {
        let script = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join("sidecar")
            .join("main.py");
        let script = script
            .canonicalize()
            .unwrap_or(script)
            .to_string_lossy()
            .into_owned();
        let program = if cfg!(target_os = "macos") {
            "python3".to_string()
        } else {
            "python".to_string()
        };
        return Ok(SidecarCommand {
            program,
            args: vec![script],
        });
    }

    // Prefer Tauri externalBin naming, then a plain bunny-sidecar fallback.
    let candidates: &[&str] = if cfg!(windows) {
        &[
            "bunny-sidecar-x86_64-pc-windows-msvc.exe",
            "bunny-sidecar-x86_64-pc-windows-gnu.exe",
            "bunny-sidecar.exe",
        ]
    } else if cfg!(target_os = "macos") {
        &[
            "bunny-sidecar-aarch64-apple-darwin",
            "bunny-sidecar-x86_64-apple-darwin",
            "bunny-sidecar",
        ]
    } else {
        &["bunny-sidecar"]
    };

    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|e| format!("cannot resolve resource_dir: {e}"))?;

    for name in candidates {
        let path = resource_dir.join(name);
        if path.exists() {
            return Ok(SidecarCommand {
                program: path.to_string_lossy().into_owned(),
                args: vec![],
            });
        }
    }

    Err(format!(
        "sidecar binary not found under {resource_dir:?}. \
         Build with: scripts/package-sidecar.ps1 (Windows) or scripts/package-sidecar.sh (macOS)"
    ))
}
