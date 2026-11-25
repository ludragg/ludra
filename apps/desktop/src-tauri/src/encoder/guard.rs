use std::collections::HashSet;
use std::fs;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};

use crate::diagnostics::{self, Level};

const VERSION: &str = env!("CARGO_PKG_VERSION");

static DIRECTORY: OnceLock<PathBuf> = OnceLock::new();
static ARMED: Mutex<Option<HashSet<&'static str>>> = Mutex::new(None);

pub fn set_directory(directory: PathBuf) {
    let _ = DIRECTORY.set(directory);
}

pub struct Guard {
    marker: Option<PathBuf>,
}

impl Guard {
    pub fn arm(backend: &'static str) -> Option<Self> {
        let Some(directory) = DIRECTORY.get() else {
            return Some(Self { marker: None });
        };
        let marker = directory.join(format!("encoder-{backend}.guard"));
        let mut armed = ARMED
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let armed = armed.get_or_insert_default();
        let crashed_before = !armed.contains(backend)
            && fs::read_to_string(&marker).is_ok_and(|seen| seen == VERSION);
        if crashed_before {
            diagnostics::report(
                Level::Crash,
                "encoder",
                format_args!("Ludra closed while the {backend} encoder was starting"),
            );
            return None;
        }
        let _ = fs::create_dir_all(directory);
        let _ = fs::write(&marker, VERSION);
        armed.insert(backend);
        Some(Self {
            marker: Some(marker),
        })
    }
}

impl Drop for Guard {
    fn drop(&mut self) {
        if let Some(marker) = &self.marker {
            let _ = fs::remove_file(marker);
        }
    }
}
