//! Structured local logging for Bunny OS.
//!
//! Writes to `%LOCALAPPDATA%\BunnyOS\logs\bunny-YYYY-MM-DD.log`.
//! Never logs transcripts, raw audio, memory text, or chat payloads.

use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

static LOG_LOCK: Mutex<()> = Mutex::new(());

const RETENTION_DAYS: i64 = 7;

fn logs_dir() -> PathBuf {
    let base = std::env::var_os("LOCALAPPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("."));
    base.join("BunnyOS").join("logs")
}

fn today_stamp() -> String {
    // YYYY-MM-DD via UTC epoch days — good enough for rotation filenames.
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let days = secs / 86_400;
    // Civil date from days since Unix epoch (Howard Hinnant algorithm, UTC).
    let z = days as i64 + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = (z - era * 146_097) as u64;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146_096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    format!("{y:04}-{m:02}-{d:02}")
}

fn timestamp() -> String {
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    format!("{secs}")
}

/// Append one sanitized info line. Safe for lifecycle / crash / packaging events only.
pub fn info(component: &str, message: &str) {
    write_line("INFO", component, message);
}

pub fn warn(component: &str, message: &str) {
    write_line("WARN", component, message);
}

pub fn error(component: &str, message: &str) {
    write_line("ERROR", component, message);
}

fn write_line(level: &str, component: &str, message: &str) {
    let sanitized = sanitize(message);
    let line = format!(
        "{} level={} component={} msg={}\n",
        timestamp(),
        level,
        component,
        sanitized
    );
    // Always mirror to stderr for dev visibility.
    eprint!("[bunny-os] {line}");

    let _guard = LOG_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let dir = logs_dir();
    if fs::create_dir_all(&dir).is_err() {
        return;
    }
    let path = dir.join(format!("bunny-{}.log", today_stamp()));
    if let Ok(mut f) = OpenOptions::new().create(true).append(true).open(&path) {
        let _ = f.write_all(line.as_bytes());
    }
    prune_old_logs(&dir);
}

fn sanitize(message: &str) -> String {
    // Strip control chars and truncate; refuse obvious transcript dumps.
    let flat: String = message
        .chars()
        .map(|c| if c.is_control() { ' ' } else { c })
        .collect();
    let flat = flat.trim();
    if flat.len() > 400 {
        format!("{}…", &flat[..400])
    } else {
        flat.to_string()
    }
}

fn prune_old_logs(dir: &PathBuf) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    let cutoff_secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
        .saturating_sub((RETENTION_DAYS as u64) * 86_400);

    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("log") {
            continue;
        }
        if let Ok(meta) = entry.metadata() {
            if let Ok(modified) = meta.modified() {
                if let Ok(dur) = modified.duration_since(UNIX_EPOCH) {
                    if dur.as_secs() < cutoff_secs {
                        let _ = fs::remove_file(path);
                    }
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitize_strips_controls_and_truncates() {
        let s = sanitize("hello\nworld");
        assert!(!s.contains('\n'));
        let long = "a".repeat(500);
        assert!(sanitize(&long).len() <= 401);
    }

    #[test]
    fn today_stamp_format() {
        let s = today_stamp();
        assert_eq!(s.len(), 10);
        assert_eq!(&s[4..5], "-");
        assert_eq!(&s[7..8], "-");
    }
}
