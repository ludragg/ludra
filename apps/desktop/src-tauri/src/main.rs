#![windows_subsystem = "windows"]

mod dev;
#[cfg(windows)]
mod dialog;
#[cfg(windows)]
mod encoder;
mod files;
mod front;
mod popup;
mod registry;
#[cfg(windows)]
mod rendition;
#[cfg(windows)]
mod screen;
mod storage;
#[cfg(windows)]
mod stream;
mod toast;
mod tray;
#[cfg(windows)]
mod webview;

use tauri::{Manager, WebviewWindowBuilder};
use tauri_plugin_autostart::MacosLauncher;

const AUTOSTART_FLAG: &str = "--autostart";

#[tauri::command]
fn launched_by_autostart() -> bool {
    std::env::args().any(|arg| arg == AUTOSTART_FLAG)
}

fn main() {
    let profile = dev::profile();
    let builder = tauri::Builder::default();
    let builder = if profile.is_some() {
        builder
    } else {
        builder.plugin(tauri_plugin_single_instance::init(|app, _, _| {
            front::show_main(app);
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
            let directory = storage::prepare(app.handle())?;
            #[cfg(windows)]
            rendition::prune();
            if let Some(config) = app.config().app.windows.first() {
                storage::webview(WebviewWindowBuilder::from_config(app, config)?).build()?;
            }
            if launched_by_autostart()
                && let Some(window) = app.get_webview_window("main")
            {
                let _ = window.hide();
            }
            #[cfg(windows)]
            webview::setup(app);
            #[cfg(windows)]
            encoder::set_guard_directory(directory.to_path_buf());
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
            files::pick_files,
            files::share_file,
            files::stage_preview,
            files::shared_file,
            files::media_path,
            files::is_downloaded,
            rendition::image_rendition,
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
