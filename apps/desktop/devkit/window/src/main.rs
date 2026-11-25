#![windows_subsystem = "windows"]

use tauri::{Manager, Webview};
use webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2Settings3;
use windows_core::Interface;

fn disable_browser_keys(webview: &Webview) {
    let _ = webview.with_webview(|platform| unsafe {
        let settings = platform
            .controller()
            .CoreWebView2()
            .and_then(|webview| webview.Settings())
            .and_then(|settings| settings.cast::<ICoreWebView2Settings3>());
        if let Ok(settings) = settings {
            let _ = settings.SetAreBrowserAcceleratorKeysEnabled(false);
        }
    });
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
        .on_page_load(|webview, _| disable_browser_keys(webview))
        .run(tauri::generate_context!())
        .expect("failed to run the Ludra Dev panel");
}
