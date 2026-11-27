#![windows_subsystem = "windows"]

mod dev;
mod diagnostics;
#[cfg(windows)]
mod dialog;
#[cfg(windows)]
mod encoder;
mod files;
mod registry;
#[cfg(windows)]
mod screen;
mod session;
#[cfg(windows)]
mod stream;
mod toast;
mod tray;
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
    diagnostics::install_crash_hook();
    let profile = dev::profile();
    let builder = tauri::Builder::default();
    let builder = if profile.is_some() {
        builder
    } else {
        builder.plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
    };

    builder
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec![AUTOSTART_FLAG]),
        ))
        .on_permission_request(webview::permission)
        .manage(screen::ScreenState::default())
        .manage(stream::StreamState::default())
        .manage(toast::ToastState::default())
        .manage(files::FilesState::default())
        .manage(tray::TrayState::default())
        .setup(move |app| {
            if let Ok(directory) = app.path().app_local_data_dir() {
                diagnostics::open(directory);
            }
            if launched_by_autostart()
                && let Some(window) = app.get_webview_window("main")
            {
                let _ = window.hide();
            }
            #[cfg(windows)]
            webview::setup(app);
            #[cfg(windows)]
            if let Ok(directory) = app.path().app_local_data_dir() {
                encoder::set_guard_directory(directory);
            }
            if let (Some(profile), Some(window)) = (&profile, app.get_webview_window("main")) {
                let _ = window.set_title(&format!("Ludra Dev · {}", profile.name));
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() != "main" {
                return;
            }
            match event {
                tauri::WindowEvent::Destroyed => window.app_handle().exit(0),
                tauri::WindowEvent::DragDrop(tauri::DragDropEvent::Drop { paths, .. }) => {
                    files::dropped(window, paths)
                }
                _ => {}
            }
        })
        .on_page_load(|webview, payload| {
            #[cfg(windows)]
            webview::disable_browser_keys(webview);
            if webview.label() == "main"
                && payload.event() == tauri::webview::PageLoadEvent::Started
            {
                screen::reset(webview.app_handle());
            }
        })
        .invoke_handler(tauri::generate_handler![
            launched_by_autostart,
            dev::dev_profile,
            diagnostics::diagnostics_enable,
            diagnostics::diagnostics_trail,
            diagnostics::diagnostics_record,
            diagnostics::diagnostics_pending,
            diagnostics::diagnostics_discard,
            files::pick_files,
            files::share_file,
            files::stage_preview,
            files::shared_file,
            files::media_path,
            files::stash_file,
            files::stash_voice,
            files::reveal_file,
            files::read_shared,
            files::save_target,
            files::auto_target,
            files::folder_target,
            files::voice_target,
            files::download_folder,
            files::choose_download_folder,
            files::reset_download_folder,
            files::begin_download,
            files::write_download,
            files::finish_download,
            files::abort_download,
            webview::reload_app,
            screen::screen_sources,
            screen::screen_start,
            screen::screen_stop,
            screen::screen_watched,
            session::session_token_read,
            session::session_token_save,
            session::session_token_clear,
            stream::stream_encoders,
            stream::stream_offer,
            stream::stream_answer,
            stream::stream_close,
            toast::toast_push,
            toast::toast_take,
            toast::toast_layout,
            toast::toast_open,
            tray::tray_menu,
            tray::tray_layout,
            tray::tray_close,
            tray::tray_open,
            tray::tray_quit
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Ludra");
}
