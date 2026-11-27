use std::collections::{HashMap, HashSet};
use std::fs::File;
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::sync::atomic::{AtomicU32, Ordering};

use serde::Serialize;
use tauri::ipc::{InvokeBody, Request, Response};
use tauri::{AppHandle, Emitter, Manager, State, WebviewWindow};

use crate::registry::{Registry, SAVED_FILES, SHARED_FILES};
use crate::storage;

const MAX_CHUNK: u64 = 1 << 20;
const IMAGE_EXTENSIONS: [&str; 6] = ["png", "jpg", "jpeg", "gif", "webp", "bmp"];
const AUTO_EXTENSIONS: [&str; 14] = [
    "png", "jpg", "jpeg", "gif", "webp", "bmp", "mp4", "webm", "mov", "mp3", "wav", "ogg", "flac",
    "m4a",
];
pub const APP_FOLDER: &str = "Ludra";
const VOICE_FOLDER: &str = "Voice";
const FOLDER_FILE: &str = "download-folder.txt";
const MAX_VOICE: usize = 32 << 20;

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
            shared: Mutex::new(Registry::new(SHARED_FILES)),
            saved: Mutex::new(Registry::new(SAVED_FILES)),
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

fn claimed(state: &FilesState, path: &Path) -> bool {
    state.shared.lock().unwrap().refers(path) || state.saved.lock().unwrap().refers(path)
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
pub fn stage_preview(app: AppHandle, state: State<'_, FilesState>, path: String) -> Option<String> {
    let path = PathBuf::from(path);
    if !state.picked.lock().unwrap().contains(&path) {
        return None;
    }
    app.asset_protocol_scope().allow_file(&path).ok()?;
    Some(path.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn share_file(state: State<'_, FilesState>, id: String, path: String) -> Result<(), String> {
    let path = PathBuf::from(path);
    if !state.picked.lock().unwrap().contains(&path) {
        return Err("file not picked".into());
    }
    state.shared.lock().unwrap().insert(id, path);
    Ok(())
}

#[tauri::command]
pub fn shared_file(state: State<'_, FilesState>, id: String) -> Option<Shared> {
    let mut shared = state.shared.lock().unwrap();
    if !shared.known(&id) {
        return None;
    }
    let Some(path) = shared.get(&id) else {
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
        .map(sanitized)
        .filter(|name| {
            name.rsplit_once('.').is_some_and(|(stem, extension)| {
                !stem.is_empty() && IMAGE_EXTENSIONS.contains(&extension)
            })
        })
        .unwrap_or_else(|| "imagem.png".into());
    let folder = documents_folder(&app)?;
    std::fs::create_dir_all(&folder).map_err(|error| error.to_string())?;
    let path = unused_path_where(&folder, &name, |path| {
        path.exists() || claimed(&state, path)
    });
    std::fs::write(&path, data).map_err(|error| error.to_string())?;
    state.picked.lock().unwrap().insert(path.clone());
    Ok(Picked {
        name: name_of(&path),
        path: path.to_string_lossy().into_owned(),
        size: data.len() as u64,
    })
}

fn sanitized(name: &str) -> String {
    name.chars()
        .filter(|char| char.is_ascii_alphanumeric() || matches!(char, '.' | '-' | '_'))
        .collect()
}

#[tauri::command]
pub fn stash_voice(
    app: AppHandle,
    state: State<'_, FilesState>,
    request: Request<'_>,
) -> Result<Picked, String> {
    let InvokeBody::Raw(data) = request.body() else {
        return Err("expected raw bytes".into());
    };
    if data.is_empty() || data.len() > MAX_VOICE {
        return Err("invalid recording".into());
    }
    let name = request
        .headers()
        .get("x-file-name")
        .and_then(|value| value.to_str().ok())
        .map(sanitized)
        .filter(|name| name.starts_with("voz-") && name.ends_with(".webm"))
        .ok_or("invalid recording name")?;
    let folder = documents_folder(&app)?.join(VOICE_FOLDER);
    std::fs::create_dir_all(&folder).map_err(|error| error.to_string())?;
    let path = unused_path_where(&folder, &name, |path| {
        path.exists() || claimed(&state, path)
    });
    std::fs::write(&path, data).map_err(|error| error.to_string())?;
    state.picked.lock().unwrap().insert(path.clone());
    Ok(Picked {
        name: name_of(&path),
        path: path.to_string_lossy().into_owned(),
        size: data.len() as u64,
    })
}

pub fn unused_path_where(folder: &Path, name: &str, taken: impl Fn(&Path) -> bool) -> PathBuf {
    let path = folder.join(name);
    if !taken(&path) {
        return path;
    }
    let (stem, extension) = name.rsplit_once('.').unwrap_or((name, ""));
    (1..)
        .map(|number| folder.join(format!("{stem} ({number}).{extension}")))
        .find(|candidate| !taken(candidate))
        .unwrap_or(path)
}

#[tauri::command]
pub fn reveal_file(state: State<'_, FilesState>, id: String) -> Result<(), String> {
    let path = state
        .saved
        .lock()
        .unwrap()
        .get(&id)
        .or_else(|| state.shared.lock().unwrap().get(&id))
        .ok_or("file not found")?;
    explore(&path).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn is_downloaded(state: State<'_, FilesState>, id: String) -> bool {
    state.saved.lock().unwrap().get(&id).is_some()
}

#[tauri::command]
pub fn media_path(
    app: AppHandle,
    state: State<'_, FilesState>,
    id: String,
    size: u64,
) -> Option<String> {
    let saved = state.saved.lock().unwrap().get(&id);
    let shared = state.shared.lock().unwrap().get(&id);
    let path = [saved, shared]
        .into_iter()
        .flatten()
        .find(|path| std::fs::metadata(path).is_ok_and(|found| found.len() == size))?;
    app.asset_protocol_scope().allow_file(&path).ok()?;
    Some(path.to_string_lossy().into_owned())
}

#[tauri::command]
pub async fn read_shared(
    state: State<'_, FilesState>,
    id: String,
    offset: u64,
    length: u64,
) -> Result<Response, String> {
    let path = state
        .shared
        .lock()
        .unwrap()
        .get(&id)
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
    let folder = documents_folder(window.app_handle())
        .ok()
        .filter(|folder| std::fs::create_dir_all(folder).is_ok());
    let target = tauri::async_runtime::spawn_blocking(move || dialog_save(handle, folder, &name))
        .await
        .map_err(|error| error.to_string())?;
    Ok(target.map(|path| {
        state.targets.lock().unwrap().insert(path.clone());
        path.to_string_lossy().into_owned()
    }))
}

pub fn documents_folder(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .document_dir()
        .map_err(|error| error.to_string())?
        .join(APP_FOLDER))
}

fn download_folder_of(app: &AppHandle) -> Result<PathBuf, String> {
    let configured = storage::directory()
        .and_then(|dir| std::fs::read_to_string(dir.join(FOLDER_FILE)).ok())
        .map(|text| PathBuf::from(text.trim()))
        .filter(|path| path.is_absolute());
    match configured {
        Some(path) => Ok(path),
        None => documents_folder(app),
    }
}

#[tauri::command]
pub fn download_folder(app: AppHandle) -> Result<String, String> {
    Ok(download_folder_of(&app)?.to_string_lossy().into_owned())
}

#[tauri::command]
pub async fn choose_download_folder(
    window: WebviewWindow,
    app: AppHandle,
) -> Result<Option<String>, String> {
    let handle = owner(&window);
    let start = download_folder_of(&app).ok();
    let chosen = tauri::async_runtime::spawn_blocking(move || dialog_folder(handle, start))
        .await
        .map_err(|error| error.to_string())?;
    let Some(path) = chosen else {
        return Ok(None);
    };
    let file = storage::directory()
        .ok_or("data folder unavailable")?
        .join(FOLDER_FILE);
    if let Some(dir) = file.parent() {
        std::fs::create_dir_all(dir).map_err(|error| error.to_string())?;
    }
    std::fs::write(file, path.to_string_lossy().as_bytes()).map_err(|error| error.to_string())?;
    Ok(Some(path.to_string_lossy().into_owned()))
}

#[tauri::command]
pub fn reset_download_folder(app: AppHandle) -> Result<String, String> {
    if let Some(dir) = storage::directory() {
        let _ = std::fs::remove_file(dir.join(FOLDER_FILE));
    }
    Ok(documents_folder(&app)?.to_string_lossy().into_owned())
}

fn clean_file_name(name: &str) -> String {
    let name: String = Path::new(name)
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_default()
        .chars()
        .filter(|char| {
            !char.is_control()
                && !matches!(char, '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*')
        })
        .collect();
    let name = name.trim().trim_end_matches('.').to_string();
    let stem = name.split('.').next().unwrap_or("").to_ascii_uppercase();
    let reserved = matches!(stem.as_str(), "CON" | "PRN" | "AUX" | "NUL")
        || (stem.len() == 4
            && (stem.starts_with("COM") || stem.starts_with("LPT"))
            && stem.ends_with(|char: char| char.is_ascii_digit()));
    if reserved { format!("_{name}") } else { name }
}

#[derive(Clone, Copy, PartialEq)]
enum Destination {
    Media,
    Any,
    Voice,
}

fn folder_target_for(
    app: &AppHandle,
    state: &FilesState,
    name: &str,
    destination: Destination,
) -> Result<String, String> {
    let name = clean_file_name(name);
    if name.is_empty() {
        return Err("invalid file name".into());
    }
    if destination == Destination::Voice && !name.ends_with(".webm") {
        return Err("file type not allowed".into());
    }
    if destination == Destination::Media {
        let allowed = name.rsplit_once('.').is_some_and(|(stem, extension)| {
            !stem.is_empty() && AUTO_EXTENSIONS.contains(&extension.to_ascii_lowercase().as_str())
        });
        if !allowed {
            return Err("file type not allowed".into());
        }
    }
    let folder = if destination == Destination::Voice {
        documents_folder(app)?.join(VOICE_FOLDER)
    } else {
        download_folder_of(app)?
    };
    std::fs::create_dir_all(&folder).map_err(|error| error.to_string())?;
    let mut targets = state.targets.lock().unwrap();
    let path = unused_path_where(&folder, &name, |path| {
        path.exists() || targets.contains(path) || claimed(state, path)
    });
    targets.insert(path.clone());
    Ok(path.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn auto_target(
    app: AppHandle,
    state: State<'_, FilesState>,
    name: String,
) -> Result<String, String> {
    folder_target_for(&app, &state, &name, Destination::Media)
}

#[tauri::command]
pub fn folder_target(
    app: AppHandle,
    state: State<'_, FilesState>,
    name: String,
) -> Result<String, String> {
    folder_target_for(&app, &state, &name, Destination::Any)
}

#[tauri::command]
pub fn voice_target(
    app: AppHandle,
    state: State<'_, FilesState>,
    name: String,
) -> Result<String, String> {
    folder_target_for(&app, &state, &name, Destination::Voice)
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
    let offset = request
        .headers()
        .get("x-offset")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.parse::<u64>().ok());
    let mut downloads = state.downloads.lock().unwrap();
    let download = downloads.get_mut(&id).ok_or("unknown download")?;
    if let Some(offset) = offset {
        download
            .file
            .seek(SeekFrom::Start(offset))
            .map_err(|error| error.to_string())?;
    }
    download
        .file
        .write_all(data)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn finish_download(state: State<'_, FilesState>, id: u32) -> Result<String, String> {
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
            .insert(key, download.path.clone());
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
fn dialog_folder(owner: Option<isize>, start: Option<PathBuf>) -> Option<PathBuf> {
    crate::dialog::folder(owner, start)
}

#[cfg(not(windows))]
fn dialog_folder(_: Option<isize>, _: Option<PathBuf>) -> Option<PathBuf> {
    None
}

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
