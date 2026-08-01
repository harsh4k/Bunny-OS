//! Child-process spawning helpers.
//!
//! Windows hands every console-subsystem child its own console window. The
//! frozen Python sidecar and the argv-only tools (curl, Ollama's installer) are
//! all console programs, so without this flag a black terminal pops up over the
//! user's desktop. Piped stdio is unaffected by it.

use std::ffi::OsStr;
use std::process::Command;

/// `CREATE_NO_WINDOW` — no console is allocated for the child.
#[cfg(windows)]
pub const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// A `std::process::Command` that never flashes a console window.
pub fn command(program: impl AsRef<OsStr>) -> Command {
    let mut cmd = Command::new(program);
    hide_console(&mut cmd);
    cmd
}

#[cfg(windows)]
pub fn hide_console(cmd: &mut Command) {
    use std::os::windows::process::CommandExt;
    cmd.creation_flags(CREATE_NO_WINDOW);
}

#[cfg(not(windows))]
pub fn hide_console(_cmd: &mut Command) {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn command_runs_like_a_plain_command() {
        // The flag must not stop us from capturing output.
        let prog = if cfg!(windows) { "cmd" } else { "echo" };
        let args: &[&str] = if cfg!(windows) {
            &["/C", "echo", "bunny"]
        } else {
            &["bunny"]
        };
        let out = command(prog).args(args).output().expect("spawn");
        assert!(String::from_utf8_lossy(&out.stdout).contains("bunny"));
    }
}
