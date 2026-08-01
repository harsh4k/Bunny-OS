/**
 * Sidecar process supervisor.
 *
 * Responsibilities:
 *   - Spawn and pipe stdin/stdout (command resolved by `crate::command`)
 *   - Store the live SidecarHandle so quit/restart can reach the process
 *   - Await the ready handshake; emit lifecycle events to the frontend
 *   - Monitor stdout and relay SidecarMessages to the frontend
 *   - On unexpected exit: carry real PID + exit code; attempt crash recovery
 *   - Clean shutdown: framed Shutdown message → wait → SIGKILL fallback
 */
use std::sync::Arc;

use anyhow::Context;
use tokio::{
    io::BufReader,
    process::{Child, ChildStdin, Command},
    sync::Mutex,
    time::{sleep, timeout, Duration},
};

use crate::{
    command::SidecarCommand,
    ipc::{AppEventPayload, HostMessage, LifecycleStatus, SidecarMessage},
    protocol::{decode_message, encode_message, read_frame_async, write_frame_async},
};
use tauri::Emitter;

// ── Constants ─────────────────────────────────────────────────────────────────

const READY_TIMEOUT_SECS: u64 = 60;
const SHUTDOWN_TIMEOUT_SECS: u64 = 3;
const RECOVERY_BACKOFF_MS: u64 = 1_000;
pub const MAX_AUTO_RECOVERY: u32 = 3;

// ── Types ─────────────────────────────────────────────────────────────────────

/// Shared mutable lifecycle state stored in Tauri managed state.
#[derive(Debug)]
pub struct SidecarState {
    pub status: LifecycleStatus,
    pub crash_count: u32,
    pub reason: Option<String>,
    /// PID of the last exited sidecar process (0 if spawn failed).
    pub last_exit_pid: u32,
    /// Exit code of the last exited sidecar process (-1 if unknown).
    pub last_exit_code: i32,
}

impl Default for SidecarState {
    fn default() -> Self {
        Self {
            status: LifecycleStatus::Stopped,
            crash_count: 0,
            reason: None,
            last_exit_pid: 0,
            last_exit_code: -1,
        }
    }
}

pub type SharedState = Arc<Mutex<SidecarState>>;

/// Live handle to the running sidecar process.
/// Stored in `AppState.sidecar_handle` once the ready handshake succeeds.
pub struct SidecarHandle {
    pub pid: u32,
    pub stdin: ChildStdin,
    // Private: only `spawn_and_watch` and `stop_sidecar` (same module) need Child.
    child: Child,
}

// ── Public API ────────────────────────────────────────────────────────────────

/// Supervisor loop: spawn the sidecar, wait for ready, monitor, and recover from crashes.
/// Stores each live handle in `handle_slot` so external callers can reach stdin/child.
pub async fn start_sidecar(
    app: tauri::AppHandle,
    shared: SharedState,
    handle_slot: Arc<Mutex<Option<SidecarHandle>>>,
    cmd: Result<SidecarCommand, String>,
) {
    let cmd = match cmd {
        Ok(c) => c,
        Err(e) => {
            set_status(&app, &shared, LifecycleStatus::Error, Some(e)).await;
            return;
        }
    };

    loop {
        set_status(&app, &shared, LifecycleStatus::Starting, None).await;

        match spawn_and_watch(&app, &shared, &handle_slot, &cmd).await {
            Ok(()) => {
                set_status(&app, &shared, LifecycleStatus::Stopped, None).await;
                break;
            }
            Err(e) => {
                let (crash_count, pid, code) = {
                    let mut s = shared.lock().await;
                    s.crash_count += 1;
                    (s.crash_count, s.last_exit_pid, s.last_exit_code)
                };
                emit_crash_report(&app, pid, code, crash_count);

                let reason = e.to_string();
                if crash_count > MAX_AUTO_RECOVERY {
                    set_status(&app, &shared, LifecycleStatus::Error, Some(reason)).await;
                    break;
                }
                set_status(&app, &shared, LifecycleStatus::Degraded, Some(reason)).await;
                sleep(Duration::from_millis(
                    RECOVERY_BACKOFF_MS * u64::from(crash_count),
                ))
                .await;
            }
        }
    }
}

/// Send a typed message to the running sidecar (best-effort, fire-and-forget).
pub async fn send_to_sidecar(
    handle_slot: &Arc<Mutex<Option<SidecarHandle>>>,
    msg: &HostMessage,
) -> anyhow::Result<()> {
    let mut guard = handle_slot.lock().await;
    let h = guard.as_mut().context("sidecar not running")?;
    let bytes = encode_message(msg)?;
    write_frame_async(&mut h.stdin, &bytes).await
}

/// Graceful shutdown: send Shutdown message, wait up to 3 s, then force-kill.
/// Clears the slot so subsequent callers see no handle.
pub async fn stop_sidecar(handle_slot: &Arc<Mutex<Option<SidecarHandle>>>) {
    let handle = handle_slot.lock().await.take();
    if let Some(mut h) = handle {
        let bytes = encode_message(&HostMessage::Shutdown).unwrap_or_default();
        let _ = write_frame_async(&mut h.stdin, &bytes).await;
        let _ = timeout(Duration::from_secs(SHUTDOWN_TIMEOUT_SECS), h.child.wait()).await;
        let _ = h.child.kill().await;
    }
}

// ── Internal ──────────────────────────────────────────────────────────────────

async fn spawn_and_watch(
    app: &tauri::AppHandle,
    shared: &SharedState,
    handle_slot: &Arc<Mutex<Option<SidecarHandle>>>,
    cmd: &SidecarCommand,
) -> anyhow::Result<()> {
    use std::process::Stdio;

    let mut child = Command::new(&cmd.program)
        .args(&cmd.args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit())
        .kill_on_drop(true)
        .spawn()
        .with_context(|| format!("failed to spawn sidecar: {:?}", cmd.program))?;

    let pid = child.id().unwrap_or(0);
    let stdin = child.stdin.take().context("sidecar: no stdin pipe")?;
    let stdout = child.stdout.take().context("sidecar: no stdout pipe")?;
    let mut reader = BufReader::new(stdout);

    // Await the ready handshake within READY_TIMEOUT_SECS.
    let data = match timeout(
        Duration::from_secs(READY_TIMEOUT_SECS),
        read_frame_async(&mut reader),
    )
    .await
    {
        Err(_) => anyhow::bail!("sidecar handshake timed out after {READY_TIMEOUT_SECS}s"),
        Ok(Err(e)) => anyhow::bail!("sidecar I/O error during handshake: {e}"),
        Ok(Ok(d)) => d,
    };

    match decode_message::<SidecarMessage>(&data).context("invalid ready message from sidecar")? {
        SidecarMessage::Ready { version } => {
            log_info(&format!("sidecar ready pid={pid} ver={version}"));
        }
        other => anyhow::bail!("expected Ready message, got {other:?}"),
    }

    // Store handle BEFORE emitting Ready so stop/restart can reach stdin+child.
    {
        let mut slot = handle_slot.lock().await;
        *slot = Some(SidecarHandle { pid, stdin, child });
    }
    set_status(app, shared, LifecycleStatus::Ready, None).await;

    // Monitor stdout; break on EOF (sidecar exited or was killed).
    loop {
        match read_frame_async(&mut reader).await {
            Err(_) => break,
            Ok(data) => {
                if let Ok(msg) = decode_message::<SidecarMessage>(&data) {
                    emit_sidecar_msg(app, msg);
                }
            }
        }
    }

    // Reclaim child to obtain the real exit code.
    // If stop_sidecar already took the handle, treat as clean shutdown.
    let (final_pid, exit_code) = {
        let mut slot = handle_slot.lock().await;
        match slot.take() {
            Some(mut h) => {
                let code = h
                    .child
                    .wait()
                    .await
                    .map(|s| s.code().unwrap_or(-1))
                    .unwrap_or(-1);
                (h.pid, code)
            }
            None => (pid, 0), // externally stopped → clean
        }
    };

    // Persist exit context for crash report emission in the supervisor loop.
    {
        let mut s = shared.lock().await;
        s.last_exit_pid = final_pid;
        s.last_exit_code = exit_code;
    }

    if exit_code == 0 {
        Ok(()) // clean shutdown
    } else {
        anyhow::bail!("sidecar exited unexpectedly (pid={final_pid}, code={exit_code})")
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async fn set_status(
    app: &tauri::AppHandle,
    shared: &SharedState,
    status: LifecycleStatus,
    reason: Option<String>,
) {
    {
        let mut s = shared.lock().await;
        s.status = status;
        s.reason = reason.clone();
    }
    let _ = app.emit(
        "app-event",
        AppEventPayload::LifecycleChanged {
            lifecycle: status,
            reason,
        },
    );
}

fn emit_sidecar_msg(app: &tauri::AppHandle, msg: SidecarMessage) {
    // Error frames used to vanish after the frontend rendered them — nothing
    // hit the log file, so a "Voice error" on the pill was unrecoverable.
    if let SidecarMessage::Error { id, error } = &msg {
        crate::applog::warn(
            "sidecar",
            &format!("error id={id} msg={error}"),
        );
    }
    let _ = app.emit(
        "app-event",
        AppEventPayload::SidecarMessage { message: msg },
    );
}

fn emit_crash_report(app: &tauri::AppHandle, pid: u32, exit_code: i32, crash_count: u32) {
    let _ = app.emit(
        "app-event",
        AppEventPayload::CrashReport {
            pid,
            exit_code,
            crash_count,
        },
    );
}

fn log_info(msg: &str) {
    crate::applog::info("sidecar", msg);
}
