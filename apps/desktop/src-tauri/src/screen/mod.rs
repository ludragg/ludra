mod audio;
mod bridge;
mod capture;
mod handoff;
mod scaler;
mod sources;

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Duration;

use tauri::ipc::{Channel, InvokeResponseBody};
use tauri::{AppHandle, Manager, State, Webview};
use windows_capture::capture::{CaptureControl, GraphicsCaptureApiHandler};
use windows_capture::settings::{
    ColorFormat, CursorCaptureSettings, DirtyRegionSettings, DrawBorderSettings,
    MinimumUpdateIntervalSettings, SecondaryWindowSettings, Settings,
};

use audio::SystemAudio;
use bridge::Bridge;
use capture::{Capture, Flags};
use handoff::Handoff;
use sources::{Source, Target};

use crate::encoder::Mode;
use crate::stream::{self, Quality, Selection, StreamState};

struct Session {
    control: CaptureControl<Capture, String>,
    watched: Arc<AtomicBool>,
    audio: Option<SystemAudio>,
}

#[derive(serde::Deserialize)]
pub struct ShareOptions {
    source: String,
    width: u32,
    height: u32,
    fps: u32,
    encoder: String,
    mode: String,
}

#[derive(Default)]
pub struct ScreenState {
    session: Mutex<Option<Session>>,
    generation: AtomicU64,
    handoff: OnceLock<Option<Arc<Mutex<Handoff>>>>,
}

#[tauri::command]
pub async fn screen_sources() -> Vec<Source> {
    tauri::async_runtime::spawn_blocking(sources::list)
        .await
        .unwrap_or_default()
}

#[tauri::command]
pub async fn screen_start(
    app: AppHandle,
    webview: Webview,
    state: State<'_, ScreenState>,
    options: ShareOptions,
    audio: Channel<InvokeResponseBody>,
) -> Result<u64, String> {
    stop(&state);
    let session_id = state.generation.load(Ordering::SeqCst);
    let source = options.source;
    let width = options.width.clamp(2, 3840);
    let height = options.height.clamp(2, 2160);
    let fps = options.fps.clamp(1, 120);
    let publisher = app.state::<StreamState>().publisher(&app);
    let handoff = state
        .handoff
        .get_or_init(|| {
            Handoff::new()
                .ok()
                .map(|handoff| Arc::new(Mutex::new(handoff)))
        })
        .clone();
    publisher.configure(
        Quality {
            height,
            fps,
            mode: Mode::parse(&options.mode),
        },
        Selection::parse(&options.encoder),
    );

    let session = tauri::async_runtime::spawn_blocking(move || -> Result<Session, String> {
        let target = sources::resolve(&source).ok_or("source not found")?;
        let (buffer_width, buffer_height) = match &target {
            Target::Monitor(monitor) => capture::fit(
                monitor.width().unwrap_or(width),
                monitor.height().unwrap_or(height),
                width,
                height,
            ),
            Target::Window(_) => (width, height),
        };
        let size = (buffer_width * buffer_height * 4) as usize;
        let excluded = bridge::browser_process(&webview).unwrap_or_else(std::process::id);
        let watched = Arc::new(AtomicBool::new(true));
        let flags = Flags {
            bridge: Arc::new(Bridge::new(webview, size, session_id)?),
            watched: watched.clone(),
            publisher,
            handoff,
            app,
            width: buffer_width,
            height: buffer_height,
            fps,
        };
        let control = begin(target, flags)?;
        Ok(Session {
            control,
            watched,
            audio: SystemAudio::start(audio, excluded).ok(),
        })
    })
    .await
    .map_err(|error| error.to_string())??;

    let previous = {
        let mut guard = state.session.lock().map_err(|error| error.to_string())?;
        if state.generation.load(Ordering::SeqCst) != session_id {
            drop(guard);
            halt(session);
            return Err("cancelled".into());
        }
        guard.replace(session)
    };
    if let Some(previous) = previous {
        halt(previous);
    }
    Ok(session_id)
}

#[tauri::command]
pub fn screen_stop(app: AppHandle, state: State<'_, ScreenState>) {
    stop(&state);
    stream::reset(&app);
}

#[tauri::command]
pub fn screen_watched(state: State<'_, ScreenState>, watched: bool) {
    if let Ok(guard) = state.session.lock()
        && let Some(current) = guard.as_ref()
    {
        current.watched.store(watched, Ordering::Release);
    }
}

pub fn reset(app: &AppHandle) {
    if let Some(state) = app.try_state::<ScreenState>() {
        stop(&state);
    }
    stream::reset(app);
}

fn stop(state: &State<'_, ScreenState>) {
    state.generation.fetch_add(1, Ordering::SeqCst);
    let session = state.session.lock().ok().and_then(|mut guard| guard.take());
    if let Some(session) = session {
        halt(session);
    }
}

fn halt(session: Session) {
    drop(session.audio);
    let _ = session.control.stop();
}

fn begin(target: Target, flags: Flags) -> Result<CaptureControl<Capture, String>, String> {
    let interval = MinimumUpdateIntervalSettings::Custom(Duration::from_millis(1));
    match target {
        Target::Monitor(monitor) => {
            Capture::start_free_threaded(settings(monitor, interval, flags))
        }
        Target::Window(window) => Capture::start_free_threaded(settings(window, interval, flags)),
    }
    .map_err(|error| error.to_string())
}

fn settings<T: TryInto<windows_capture::settings::GraphicsCaptureItemType>>(
    item: T,
    interval: MinimumUpdateIntervalSettings,
    flags: Flags,
) -> Settings<Flags, T> {
    Settings::new(
        item,
        CursorCaptureSettings::WithCursor,
        DrawBorderSettings::WithoutBorder,
        SecondaryWindowSettings::Default,
        interval,
        DirtyRegionSettings::Default,
        ColorFormat::Bgra8,
        flags,
    )
}
