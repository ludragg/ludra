mod journal;

use std::path::PathBuf;
use std::sync::{Mutex, MutexGuard};

pub use journal::{Level, Report};

use journal::Journal;

const VERSION: &str = env!("CARGO_PKG_VERSION");

static JOURNAL: Mutex<Journal> = Mutex::new(Journal::new());

fn journal() -> MutexGuard<'static, Journal> {
    JOURNAL
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

pub fn install_crash_hook() {
    let previous = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let message = info
            .payload()
            .downcast_ref::<&str>()
            .map(|text| (*text).to_owned())
            .or_else(|| info.payload().downcast_ref::<String>().cloned())
            .unwrap_or_else(|| "panic".to_owned());
        let location = info
            .location()
            .map(|at| format!("{}:{}", at.file(), at.line()))
            .unwrap_or_default();
        let thread = std::thread::current()
            .name()
            .unwrap_or("unnamed")
            .to_owned();
        if let Ok(mut journal) = JOURNAL.try_lock() {
            let detail = format!("at {location} on thread {thread}");
            journal.record(Level::Crash, "native", &message, &detail, VERSION);
        }
        previous(info);
    }));
}

pub fn open(directory: PathBuf) {
    journal().open(directory);
}

pub fn trail(area: &str, message: impl std::fmt::Display) {
    let message = message.to_string();
    echo(area, &message);
    journal().note(area, &message);
}

pub fn report(level: Level, area: &str, message: impl std::fmt::Display) {
    let message = message.to_string();
    echo(area, &message);
    journal().record(level, area, &message, "", VERSION);
}

fn echo(area: &str, message: &str) {
    if cfg!(debug_assertions) {
        eprintln!("{area}: {message}");
    }
}

#[tauri::command]
pub fn diagnostics_enable(enabled: bool) {
    journal().set_enabled(enabled);
}

#[tauri::command]
pub fn diagnostics_trail(area: String, message: String) {
    trail(&area, message);
}

#[tauri::command]
pub fn diagnostics_record(level: Level, area: String, message: String, detail: String) {
    echo(&area, &message);
    journal().record(level, &area, &message, &detail, VERSION);
}

#[tauri::command]
pub fn diagnostics_pending() -> Vec<Report> {
    journal().pending()
}

#[tauri::command]
pub fn diagnostics_discard(ids: Vec<u64>) {
    journal().discard(&ids);
}
