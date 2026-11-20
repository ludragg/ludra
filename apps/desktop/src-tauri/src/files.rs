use std::collections::{HashMap, HashSet};
use std::fs::File;
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::sync::atomic::{AtomicU32, Ordering};

use serde::Serialize;
use tauri::ipc::{InvokeBody, Request, Response};
use tauri::{AppHandle, Emitter, Manager, State, WebviewWindow};

use crate::registry::Registry;

const MAX_CHUNK: u64 = 1 << 20;

pub struct FilesState {
    picked: Mutex<HashSet<PathBuf>>,
    targets: Mutex<HashSet<PathBuf>>,
    shared: Mutex<Registry>,
    saved: Mutex<Registry>,
    downloads: Mutex<HashMap<u32, Download>>,
    next: AtomicU32,
}

impl Default for FilesState {
    fn default() -> Self {
        Self {
            picked: Mutex::default(),
            targets: Mutex::default(),
            shared: Mutex::new(Registry::new("shared-files.json")),
            saved: Mutex::new(Registry::new("downloaded-files.json")),
            downloads: Mutex::default(),
            next: AtomicU32::default(),
        }
    }
}

struct Download {
    file: File,
    part: PathBuf,
    path: PathBuf,
    key: Option<String>,
}

#[derive(Clone, Serialize)]
pub struct Picked {
    path: String,
    name: String,
    size: u64,
}

#[derive(Serialize)]
pub struct Shared {
    name: String,
    size: u64,
    available: bool,
}

fn owner(window: &WebviewWindow) -> Option<isize> {
    window.hwnd().ok().map(|handle| handle.0 as isize)
}

fn name_of(path: &Path) -> String {
    path.file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_default()
}

pub fn dropped(window: &tauri::Window, paths: &[PathBuf]) {
    let state = window.state::<FilesState>();
    let mut picked = state.picked.lock().unwrap();
    let files: Vec<Picked> = paths
        .iter()
        .filter_map(|path| {
            let metadata = std::fs::metadata(path).ok()?;
            if !metadata.is_file() {
                return None;
            }
            picked.insert(path.clone());
            Some(Picked {
                name: name_of(path),
                path: path.to_string_lossy().into_owned(),
                size: metadata.len(),
            })
        })
        .collect();
    drop(picked);
    if !files.is_empty() {
        let _ = window.emit_to(window.label(), "files-dropped", files);
    }
}

#[tauri::command]
pub async fn pick_files(
    window: WebviewWindow,
    state: State<'_, FilesState>,
) -> Result<Vec<Picked>, String> {
    let handle = owner(&window);
    let paths = tauri::async_runtime::spawn_blocking(move || dialog_open(handle))
        .await
        .map_err(|error| error.to_string())?;
    let mut picked = state.picked.lock().unwrap();
    Ok(paths
        .into_iter()
        .filter_map(|path| {
            let size = std::fs::metadata(&path).ok()?.len();
            picked.insert(path.clone());
            Some(Picked {
                name: name_of(&path),
                path: path.to_string_lossy().into_owned(),
                size,
            })
        })
        .collect())
}

#[tauri::command]
pub fn share_file(
    app: AppHandle,
    state: State<'_, FilesState>,
    id: String,
    path: String,
) -> Result<(), String> {
    let path = PathBuf::from(path);
    if !state.picked.lock().unwrap().contains(&path) {
        return Err("file not picked".into());
    }
    state.shared.lock().unwrap().insert(&app, id, path);
    Ok(())
}

#[tauri::command]
pub fn shared_file(app: AppHandle, state: State<'_, FilesState>, id: String) -> Option<Shared> {
    let mut shared = state.shared.lock().unwrap();
    if !shared.known(&app, &id) {
        return None;
    }
    let Some(path) = shared.get(&app, &id) else {
        return Some(Shared {
            name: String::new(),
            size: 0,
            available: false,
        });
    };
    let size = std::fs::metadata(&path).ok()?.len();
    Some(Shared {
        name: name_of(&path),
        size,
        available: true,
    })
}

#[tauri::command]
pub fn stash_file(
    app: AppHandle,
    state: State<'_, FilesState>,
    request: Request<'_>,
) -> Result<Picked, String> {
    let InvokeBody::Raw(data) = request.body() else {
        return Err("expected raw bytes".into());
    };
    let name = request
        .headers()
        .get("x-file-name")
        .and_then(|value| value.to_str().ok())
        .map(|name| {
            name.chars()
                .filter(|char| char.is_ascii_alphanumeric() || matches!(char, '.' | '-' | '_'))
                .collect::<String>()
        })
        .filter(|name| name.contains('.'))
        .unwrap_or_else(|| "imagem.png".into());
    let folder = app
        .path()
        .app_local_data_dir()
        .map_err(|error| error.to_string())?
        .join("pasted");
    std::fs::create_dir_all(&folder).map_err(|error| error.to_string())?;
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|time| time.as_millis())
        .unwrap_or_default();
    let path = folder.join(format!("{stamp}-{name}"));
    std::fs::write(&path, data).map_err(|error| error.to_string())?;
    state.picked.lock().unwrap().insert(path.clone());
    Ok(Picked {
        name,
        path: path.to_string_lossy().into_owned(),
        size: data.len() as u64,
    })
}

#[tauri::command]
pub fn reveal_file(app: AppHandle, state: State<'_, FilesState>, id: String) -> Result<(), String> {
    let path = state
        .saved
        .lock()
        .unwrap()
        .get(&app, &id)
        .or_else(|| state.shared.lock().unwrap().get(&app, &id))
        .ok_or("file not found")?;
    explore(&path).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn media_path(app: AppHandle, state: State<'_, FilesState>, id: String) -> Option<String> {
    let path = state
        .saved
        .lock()
        .unwrap()
        .get(&app, &id)
        .or_else(|| state.shared.lock().unwrap().get(&app, &id))?;
    app.asset_protocol_scope().allow_file(&path).ok()?;
    Some(path.to_string_lossy().into_owned())
}

#[tauri::command]
pub async fn read_shared(
    app: AppHandle,
    state: State<'_, FilesState>,
    id: String,
    offset: u64,
    length: u64,
) -> Result<Response, String> {
    let path = state
        .shared
        .lock()
        .unwrap()
        .get(&app, &id)
        .ok_or("file not shared")?;
    let mut file = File::open(path).map_err(|error| error.to_string())?;
    file.seek(SeekFrom::Start(offset))
        .map_err(|error| error.to_string())?;
    let mut buffer = Vec::with_capacity(length.min(MAX_CHUNK) as usize);
    file.take(length.min(MAX_CHUNK))
        .read_to_end(&mut buffer)
        .map_err(|error| error.to_string())?;
    Ok(Response::new(buffer))
}

#[tauri::command]
pub async fn save_target(
    window: WebviewWindow,
    state: State<'_, FilesState>,
    name: String,
) -> Result<Option<String>, String> {
    let handle = owner(&window);
    let folder = window.app_handle().path().download_dir().ok();
    let target = tauri::async_runtime::spawn_blocking(move || dialog_save(handle, folder, &name))
        .await
        .map_err(|error| error.to_string())?;
    Ok(target.map(|path| {
        state.targets.lock().unwrap().insert(path.clone());
        path.to_string_lossy().into_owned()
    }))
}

#[tauri::command]
pub fn begin_download(
    state: State<'_, FilesState>,
    path: String,
    key: Option<String>,
) -> Result<u32, String> {
    let path = PathBuf::from(path);
    if !state.targets.lock().unwrap().remove(&path) {
        return Err("target not chosen".into());
    }
    let mut part = path.clone().into_os_string();
    part.push(".part");
    let part = PathBuf::from(part);
    let file = File::create(&part).map_err(|error| error.to_string())?;
    let id = state.next.fetch_add(1, Ordering::Relaxed);
    state.downloads.lock().unwrap().insert(
        id,
        Download {
            file,
            part,
            path,
            key,
        },
    );
    Ok(id)
}

#[tauri::command]
pub async fn write_download(
    state: State<'_, FilesState>,
    request: Request<'_>,
) -> Result<(), String> {
    let InvokeBody::Raw(data) = request.body() else {
        return Err("expected raw bytes".into());
    };
    let id = request
        .headers()
        .get("x-download")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.parse::<u32>().ok())
        .ok_or("missing download")?;
    let mut downloads = state.downloads.lock().unwrap();
    let download = downloads.get_mut(&id).ok_or("unknown download")?;
    download
        .file
        .write_all(data)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn finish_download(
    app: AppHandle,
    state: State<'_, FilesState>,
    id: u32,
) -> Result<String, String> {
    let download = state
        .downloads
        .lock()
        .unwrap()
        .remove(&id)
        .ok_or("unknown download")?;
    download
        .file
        .sync_all()
        .map_err(|error| error.to_string())?;
    drop(download.file);
    let _ = std::fs::remove_file(&download.path);
    std::fs::rename(&download.part, &download.path).map_err(|error| error.to_string())?;
    mark_downloaded(&download.path);
    if let Some(key) = download.key {
        state
            .saved
            .lock()
            .unwrap()
            .insert(&app, key, download.path.clone());
    }
    Ok(download.path.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn abort_download(state: State<'_, FilesState>, id: u32) {
    if let Some(download) = state.downloads.lock().unwrap().remove(&id) {
        drop(download.file);
        let _ = std::fs::remove_file(download.part);
    }
}

#[cfg(windows)]
fn explore(path: &Path) -> std::io::Result<()> {
    use std::os::windows::process::CommandExt;
    std::process::Command::new("explorer")
        .raw_arg(format!("/select,\"{}\"", path.display()))
        .spawn()
        .map(|_| ())
}

#[cfg(not(windows))]
fn explore(path: &Path) -> std::io::Result<()> {
    std::process::Command::new("xdg-open")
        .arg(path.parent().unwrap_or(path))
        .spawn()
        .map(|_| ())
}

#[cfg(windows)]
fn mark_downloaded(path: &Path) {
    let mut stream = path.as_os_str().to_owned();
    stream.push(":Zone.Identifier");
    let _ = std::fs::write(PathBuf::from(stream), "[ZoneTransfer]\r\nZoneId=3\r\n");
}

#[cfg(not(windows))]
fn mark_downloaded(_: &Path) {}

#[cfg(windows)]
fn dialog_open(owner: Option<isize>) -> Vec<PathBuf> {
    crate::dialog::open(owner)
}

#[cfg(not(windows))]
fn dialog_open(_: Option<isize>) -> Vec<PathBuf> {
    Vec::new()
}

#[cfg(windows)]
fn dialog_save(owner: Option<isize>, folder: Option<PathBuf>, name: &str) -> Option<PathBuf> {
    crate::dialog::save(owner, folder, name)
}

#[cfg(not(windows))]
fn dialog_save(_: Option<isize>, folder: Option<PathBuf>, name: &str) -> Option<PathBuf> {
    folder.map(|folder| folder.join(name))
}
