mod wic;

use std::fs::{self, File};
use std::hash::{DefaultHasher, Hash, Hasher};
use std::io::{BufWriter, Write};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, SystemTime};

use image::DynamicImage;
use image::codecs::jpeg::JpegEncoder;
use tauri::{AppHandle, Manager};

use crate::storage;

const CACHE_FOLDER: &str = "previews";
const CACHE_LIFETIME: Duration = Duration::from_secs(30 * 24 * 60 * 60);
const EXTENSIONS: [&str; 2] = ["jpg", "png"];
const JPEG_QUALITY: u8 = 86;

static WORKER: Mutex<()> = Mutex::new(());

#[derive(Clone, Copy)]
enum Size {
    Thumbnail,
    View,
}

impl Size {
    fn name(self) -> &'static str {
        match self {
            Self::Thumbnail => "thumb",
            Self::View => "view",
        }
    }

    fn scale(self, width: u32, height: u32) -> Option<f64> {
        let long = f64::from(width.max(height));
        let short = f64::from(width.min(height)).max(1.0);
        let pixels = (f64::from(width) * f64::from(height)).max(1.0);
        let scale = match self {
            Self::Thumbnail => (960.0 / long)
                .max(480.0 / short)
                .min((4_000_000.0 / pixels).sqrt()),
            Self::View => (16_000_000.0 / pixels).sqrt().min(16_000.0 / long),
        };
        (scale < 0.9).then_some(scale)
    }
}

#[tauri::command]
pub async fn image_rendition(app: AppHandle, path: String, view: bool) -> Result<String, String> {
    if !app.asset_protocol_scope().is_allowed(&path) {
        return Err("file not allowed".into());
    }
    let size = if view { Size::View } else { Size::Thumbnail };
    let source = PathBuf::from(&path);
    let cached = tauri::async_runtime::spawn_blocking(move || render(&source, size))
        .await
        .map_err(|error| error.to_string())?;
    let Some(cached) = cached else {
        return Ok(path);
    };
    app.asset_protocol_scope()
        .allow_file(&cached)
        .map_err(|error| error.to_string())?;
    Ok(cached.to_string_lossy().into_owned())
}

pub fn prune() {
    let Some(folder) = storage::directory().map(|directory| directory.join(CACHE_FOLDER)) else {
        return;
    };
    std::thread::spawn(move || {
        let entries = fs::read_dir(folder).into_iter().flatten().flatten();
        for entry in entries {
            let stale = entry
                .metadata()
                .and_then(|metadata| metadata.modified())
                .ok()
                .and_then(|modified| modified.elapsed().ok())
                .is_some_and(|age| age > CACHE_LIFETIME);
            if stale {
                let _ = fs::remove_file(entry.path());
            }
        }
    });
}

fn render(source: &Path, size: Size) -> Option<PathBuf> {
    let animated = source
        .extension()
        .is_some_and(|extension| extension.eq_ignore_ascii_case("gif"));
    if animated {
        return None;
    }
    let folder = storage::directory()?.join(CACHE_FOLDER);
    let key = key(source)?;
    let _turn = WORKER
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    if let Some(cached) = find(&folder, &key, size) {
        return Some(cached);
    }
    let reduced = wic::reduce(source, |width, height| size.scale(width, height))
        .ok()
        .flatten()?;
    fs::create_dir_all(&folder).ok()?;
    save(&folder, &key, size, reduced)
}

fn key(source: &Path) -> Option<String> {
    let metadata = fs::metadata(source).ok()?;
    let mut hasher = DefaultHasher::new();
    source.hash(&mut hasher);
    metadata.len().hash(&mut hasher);
    metadata.modified().ok().hash(&mut hasher);
    Some(format!("{:016x}", hasher.finish()))
}

fn cache_path(folder: &Path, key: &str, size: Size, extension: &str) -> PathBuf {
    folder.join(format!("{key}-{}.{extension}", size.name()))
}

fn find(folder: &Path, key: &str, size: Size) -> Option<PathBuf> {
    let found = EXTENSIONS
        .iter()
        .map(|extension| cache_path(folder, key, size, extension))
        .find(|path| path.is_file())?;
    if let Ok(file) = File::options().write(true).open(&found) {
        let _ = file.set_modified(SystemTime::now());
    }
    Some(found)
}

fn save(folder: &Path, key: &str, size: Size, reduced: DynamicImage) -> Option<PathBuf> {
    let transparent = reduced
        .as_rgba8()
        .is_some_and(|pixels| pixels.pixels().any(|pixel| pixel[3] < u8::MAX));
    let extension = EXTENSIONS[usize::from(transparent)];
    let target = cache_path(folder, key, size, extension);
    let part = target.with_extension("part");
    let written = if transparent {
        reduced.save_with_format(&part, image::ImageFormat::Png)
    } else {
        let mut file = BufWriter::new(File::create(&part).ok()?);
        let encoded =
            JpegEncoder::new_with_quality(&mut file, JPEG_QUALITY).encode_image(&reduced.to_rgb8());
        file.flush().ok()?;
        encoded
    };
    written.ok()?;
    fs::rename(&part, &target).ok()?;
    Some(target)
}
