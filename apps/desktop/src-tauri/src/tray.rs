use std::sync::Mutex;

use tauri::{
    AppHandle, Manager, PhysicalPosition, PhysicalSize, Runtime, State, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder,
};

const LABEL: &str = "tray";

#[derive(Default)]
pub struct TrayState {
    anchor: Mutex<(f64, f64)>,
}

#[tauri::command]
pub async fn tray_menu<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, TrayState>,
    x: f64,
    y: f64,
) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(LABEL) {
        return window.destroy().map_err(|error| error.to_string());
    }
    *state.anchor.lock().map_err(|error| error.to_string())? = (x, y);
    WebviewWindowBuilder::new(&app, LABEL, WebviewUrl::App("tray.html".into()))
        .title("Ludra")
        .inner_size(200.0, 96.0)
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .resizable(false)
        .skip_taskbar(true)
        .always_on_top(true)
        .visible(false)
        .build()
        .map(|_| ())
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn tray_layout<R: Runtime>(
    window: WebviewWindow<R>,
    state: State<'_, TrayState>,
    width: f64,
    height: f64,
) -> Result<(), String> {
    let (x, y) = *state.anchor.lock().map_err(|error| error.to_string())?;
    let app = window.app_handle();
    let monitor = app
        .monitor_from_point(x, y)
        .ok()
        .flatten()
        .or_else(|| app.primary_monitor().ok().flatten())
        .ok_or("no monitor")?;
    let scale = monitor.scale_factor();
    let area = monitor.work_area();
    let width = (width * scale).round() as i32;
    let height = (height * scale).round() as i32;
    let (left, top) = (area.position.x, area.position.y);
    let right = left + area.size.width as i32;
    let bottom = top + area.size.height as i32;
    let (x, y) = (x.round() as i32, y.round() as i32);
    let column = if x + width <= right { x } else { x - width };
    let row = if y - height >= top { y - height } else { y };
    let column = column.clamp(left, (right - width).max(left));
    let row = row.clamp(top, (bottom - height).max(top));
    window
        .set_size(PhysicalSize::new(width as u32, height as u32))
        .and_then(|_| window.set_position(PhysicalPosition::new(column, row)))
        .and_then(|_| window.show())
        .and_then(|_| window.set_focus())
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn tray_close<R: Runtime>(window: WebviewWindow<R>) -> Result<(), String> {
    window.destroy().map_err(|error| error.to_string())
}

#[tauri::command]
pub fn tray_open<R: Runtime>(window: WebviewWindow<R>) -> Result<(), String> {
    if let Some(main) = window.app_handle().get_webview_window("main") {
        let _ = main.show();
        let _ = main.unminimize();
        let _ = main.set_focus();
    }
    window.destroy().map_err(|error| error.to_string())
}

#[tauri::command]
pub fn tray_quit<R: Runtime>(window: WebviewWindow<R>) -> Result<(), String> {
    match window.app_handle().get_webview_window("main") {
        Some(main) => main.destroy().map_err(|error| error.to_string()),
        None => {
            window.app_handle().exit(0);
            Ok(())
        }
    }
}
