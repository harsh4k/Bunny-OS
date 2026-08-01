// Bunny OS — Tauri entry point.
// All logic lives in lib.rs for testability.
#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

fn main() {
    bunny_os_lib::run();
}
