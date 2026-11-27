use std::fs;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use std::thread;
use std::time::Duration;

use tauri::{AppHandle, Manager, Runtime, WebviewWindowBuilder};

use crate::files::{APP_FOLDER, documents_folder, unused_path_where};
use crate::registry::{self, SAVED_FILES, SHARED_FILES};

const DATA_FOLDER: &str = "data";
const PASTED_FOLDER: &str = "pasted";
const MOVE_ATTEMPTS: u32 = 50;
const MOVE_RETRY: Duration = Duration::from_millis(100);

static DIRECTORY: OnceLock<PathBuf> = OnceLock::new();

pub fn prepare(app: &AppHandle) -> tauri::Result<&'static Path> {
    let previous = app.path().app_local_data_dir()?;
    let directory = if cfg!(debug_assertions) {
        previous
    } else {
        let current = app
            .path()
            .local_data_dir()?
            .join(APP_FOLDER)
            .join(DATA_FOLDER);
        let directory = adopt(previous.clone(), current);
        if let Ok(documents) = documents_folder(app) {
            move_pasted(&directory, &previous, &documents);
        }
        directory
    };
    Ok(DIRECTORY.get_or_init(|| directory))
}

pub fn directory() -> Option<&'static Path> {
    DIRECTORY.get().map(PathBuf::as_path)
}

pub fn webview<'a, R: Runtime, M: Manager<R>>(
    builder: WebviewWindowBuilder<'a, R, M>,
) -> WebviewWindowBuilder<'a, R, M> {
    match directory() {
        Some(directory) => builder.data_directory(directory.to_path_buf()),
        None => builder,
    }
}

fn adopt(previous: PathBuf, current: PathBuf) -> PathBuf {
    if current.exists() || !previous.exists() {
        return current;
    }
    if let Some(parent) = current.parent() {
        let _ = fs::create_dir_all(parent);
    }
    for _ in 0..MOVE_ATTEMPTS {
        if fs::rename(&previous, &current).is_ok() {
            return current;
        }
        thread::sleep(MOVE_RETRY);
    }
    previous
}

fn move_pasted(directory: &Path, previous: &Path, destination: &Path) {
    let source = directory.join(PASTED_FOLDER);
    let Ok(entries) = fs::read_dir(&source) else {
        return;
    };
    if fs::create_dir_all(destination).is_err() {
        return;
    }
    let mut registries = [SHARED_FILES, SAVED_FILES].map(|file| {
        let location = directory.join(file);
        let map = registry::read(&location);
        (location, map)
    });
    for entry in entries.flatten().filter(|entry| entry.path().is_file()) {
        let name = entry.file_name();
        let target = unused_path_where(destination, &name.to_string_lossy(), |path| {
            path.exists()
                || registries
                    .iter()
                    .any(|(_, map)| map.values().any(|known| known == path))
        });
        if fs::copy(entry.path(), &target).is_err() {
            continue;
        }
        let old = [previous.join(PASTED_FOLDER).join(&name), entry.path()];
        let mut saved = true;
        for (location, map) in &mut registries {
            let mut changed = false;
            for path in map.values_mut().filter(|path| old.contains(path)) {
                *path = target.clone();
                changed = true;
            }
            saved &= !changed || registry::write(location, map).is_ok();
        }
        if saved {
            let _ = fs::remove_file(entry.path());
        }
    }
    let _ = fs::remove_dir(source);
}
