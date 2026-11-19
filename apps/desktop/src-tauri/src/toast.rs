use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::{
    AppHandle, Emitter, Manager, Monitor, PhysicalPosition, PhysicalSize, Runtime, State,
    WebviewUrl, WebviewWindow, WebviewWindowBuilder,
};

const LABEL: &str = "toast";
const WIDTH: f64 = 372.0;

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Toast {
    title: String,
    body: String,
    kind: String,
    id: String,
    name: String,
    avatar: String,
    target: String,
}

#[derive(Default)]
pub struct ToastState {
    queue: Mutex<Vec<Toast>>,
}

#[cfg(windows)]
fn suppressed() -> bool {
    use windows::Win32::UI::Shell::{QUNS_ACCEPTS_NOTIFICATIONS, SHQueryUserNotificationState};
    match unsafe { SHQueryUserNotificationState() } {
        Ok(state) => state != QUNS_ACCEPTS_NOTIFICATIONS,
        Err(_) => false,
    }
}

#[cfg(not(windows))]
fn suppressed() -> bool {
    false
}

#[tauri::command]
pub async fn toast_push<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, ToastState>,
    toast: Toast,
) -> Result<(), String> {
    if suppressed() {
        return Ok(());
    }
    let mut queue = state.queue.lock().map_err(|error| error.to_string())?;
    queue.push(toast);
    match app.get_webview_window(LABEL) {
        Some(window) => window.emit("toast", ()).map_err(|error| error.to_string()),
        None => create(&app).map(|_| ()),
    }
}

#[tauri::command]
pub async fn toast_take(state: State<'_, ToastState>) -> Result<Vec<Toast>, String> {
    let mut queue = state.queue.lock().map_err(|error| error.to_string())?;
    Ok(queue.drain(..).collect())
}

#[tauri::command]
pub async fn toast_layout<R: Runtime>(
    window: WebviewWindow<R>,
    state: State<'_, ToastState>,
    height: f64,
) -> Result<(), String> {
    let queue = state.queue.lock().map_err(|error| error.to_string())?;
    if height <= 0.0 {
        if queue.is_empty() {
            return window.destroy().map_err(|error| error.to_string());
        }
        return window.emit("toast", ()).map_err(|error| error.to_string());
    }
    drop(queue);

    let Some(monitor) = monitor(window.app_handle()) else {
        return Ok(());
    };
    let scale = monitor.scale_factor();
    let area = monitor.work_area();
    let width = (WIDTH * scale).round() as u32;
    let height = ((height * scale).round() as u32).min(area.size.height);
    let x = area.position.x + area.size.width as i32 - width as i32;
    let y = area.position.y + area.size.height as i32 - height as i32;
    window
        .set_size(PhysicalSize::new(width, height))
        .and_then(|_| window.set_position(PhysicalPosition::new(x, y)))
        .and_then(|_| window.show())
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn toast_open<R: Runtime>(app: AppHandle<R>, target: String) -> Result<(), String> {
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.show();
        let _ = main.unminimize();
        let _ = main.set_focus();
    }
    app.emit_to("main", "toast-open", target)
        .map_err(|error| error.to_string())
}

fn monitor<R: Runtime>(app: &AppHandle<R>) -> Option<Monitor> {
    app.get_webview_window("main")
        .and_then(|main| main.current_monitor().ok().flatten())
        .or_else(|| app.primary_monitor().ok().flatten())
}

fn create<R: Runtime>(app: &AppHandle<R>) -> Result<WebviewWindow<R>, String> {
    WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App("toast.html".into()))
        .title("Ludra")
        .inner_size(WIDTH, 96.0)
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .resizable(false)
        .skip_taskbar(true)
        .always_on_top(true)
        .focused(false)
        .focusable(false)
        .visible(false)
        .build()
        .map_err(|error| error.to_string())
}
