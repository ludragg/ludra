#![windows_subsystem = "windows"]

#[cfg(windows)]
mod screen;
#[cfg(windows)]
mod webview;

use tauri::Manager;
use tauri_plugin_autostart::MacosLauncher;

const AUTOSTART_FLAG: &str = "--autostart";

#[tauri::command]
fn launched_by_autostart() -> bool {
    std::env::args().any(|arg| arg == AUTOSTART_FLAG)
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec![AUTOSTART_FLAG]),
        ))
        .on_permission_request(webview::permission)
        .manage(screen::ScreenState::default())
        .setup(|app| {
            #[cfg(windows)]
            webview::setup(app);
            Ok(())
        })
        .on_page_load(|webview, payload| {
            if payload.event() == tauri::webview::PageLoadEvent::Started {
                screen::reset(webview.app_handle());
            }
        })
        .invoke_handler(tauri::generate_handler![
            launched_by_autostart,
            webview::reload_app,
            screen::screen_sources,
            screen::screen_start,
            screen::screen_stop,
            screen::screen_watched
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Ludra");
}
