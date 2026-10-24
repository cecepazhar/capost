// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
#![deny(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    clippy::indexing_slicing,
    clippy::todo,
    clippy::unimplemented
)]
#![cfg_attr(
    test,
    allow(
        clippy::unwrap_used,
        clippy::expect_used,
        clippy::panic,
        clippy::indexing_slicing,
        clippy::todo,
        clippy::unimplemented
    )
)]

#[global_allocator]
static GLOBAL: mimalloc::MiMalloc = mimalloc::MiMalloc;

fn main() {
    // Handle CLI arguments: `--version` and `-V` should print version and exit immediately
    let args: Vec<String> = std::env::args().collect();
    for arg in &args[1..] {
        if arg == "--version" || arg == "-V" {
            println!("capost {}", caf_core::CORE_VERSION);
            return;
        }
    }

    let start = std::time::Instant::now();
    caf_app_lib::run_with_start(start);
}
