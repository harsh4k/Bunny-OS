// Bunny OS — Tauri entry point.
// All logic lives in lib.rs for testability.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    bunny_os_lib::run();
}
