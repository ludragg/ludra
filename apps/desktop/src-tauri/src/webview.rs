use tauri::webview::{PermissionKind, PermissionResponse};
use tauri::{Manager, Runtime, Webview, WebviewWindow};
use webview2_com::Microsoft::Web::WebView2::Win32::{
    COREWEBVIEW2_BROWSING_DATA_KINDS_DISK_CACHE, COREWEBVIEW2_PERMISSION_KIND,
    COREWEBVIEW2_PERMISSION_KIND_AUTOPLAY, COREWEBVIEW2_PERMISSION_KIND_CAMERA,
    COREWEBVIEW2_PERMISSION_KIND_CLIPBOARD_READ, COREWEBVIEW2_PERMISSION_KIND_MICROPHONE,
    COREWEBVIEW2_PERMISSION_KIND_NOTIFICATIONS, COREWEBVIEW2_PERMISSION_STATE_ALLOW,
    COREWEBVIEW2_PROCESS_FAILED_KIND, ICoreWebView2_13, ICoreWebView2Profile2,
    ICoreWebView2Profile4, ICoreWebView2Settings3,
};
use webview2_com::{
    ClearBrowsingDataCompletedHandler, ProcessFailedEventHandler,
    SetPermissionStateCompletedHandler,
};
use windows::core::{HSTRING, Interface};

use crate::diagnostics::{self, Level};

const GRANTED: [COREWEBVIEW2_PERMISSION_KIND; 5] = [
    COREWEBVIEW2_PERMISSION_KIND_MICROPHONE,
    COREWEBVIEW2_PERMISSION_KIND_CAMERA,
    COREWEBVIEW2_PERMISSION_KIND_AUTOPLAY,
    COREWEBVIEW2_PERMISSION_KIND_NOTIFICATIONS,
    COREWEBVIEW2_PERMISSION_KIND_CLIPBOARD_READ,
];

const ORIGINS: [&str; 3] = [
    "http://tauri.localhost",
    "https://tauri.localhost",
    "http://localhost:6767",
];

pub fn permission<R: Runtime>(_: Webview<R>, kind: PermissionKind) -> PermissionResponse {
    match kind {
        PermissionKind::Microphone
        | PermissionKind::Camera
        | PermissionKind::Autoplay
        | PermissionKind::Notifications
        | PermissionKind::ClipboardRead => PermissionResponse::Allow,
        _ => PermissionResponse::Default,
    }
}

pub fn disable_browser_keys<R: Runtime>(webview: &Webview<R>) {
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

pub fn setup<R: Runtime, M: Manager<R>>(manager: &M) {
    if let Some(window) = manager.get_webview_window("main") {
        save_permissions(&window);
        watch_failures(&window);
    }
}

fn watch_failures<R: Runtime>(window: &WebviewWindow<R>) {
    let _ = window.with_webview(|platform| unsafe {
        let Ok(webview) = platform.controller().CoreWebView2() else {
            return;
        };
        let handler = ProcessFailedEventHandler::create(Box::new(|_, arguments| {
            let mut kind = COREWEBVIEW2_PROCESS_FAILED_KIND::default();
            if let Some(arguments) = arguments {
                let _ = arguments.ProcessFailedKind(&mut kind);
            }
            diagnostics::report(
                Level::Crash,
                "webview",
                format_args!("a webview process failed, kind {}", kind.0),
            );
            Ok(())
        }));
        let mut token = 0;
        let _ = webview.add_ProcessFailed(&handler, &mut token);
    });
}

#[tauri::command]
pub fn reload_app<R: Runtime>(window: WebviewWindow<R>) -> Result<(), String> {
    window
        .with_webview(|platform| unsafe {
            let Ok(webview) = platform.controller().CoreWebView2() else {
                return;
            };
            let profile = webview
                .cast::<ICoreWebView2_13>()
                .and_then(|webview| webview.Profile())
                .and_then(|profile| profile.cast::<ICoreWebView2Profile2>());
            let Ok(profile) = profile else {
                let _ = webview.Reload();
                return;
            };
            let reload = webview.clone();
            let handler =
                ClearBrowsingDataCompletedHandler::create(Box::new(move |_| reload.Reload()));
            if profile
                .ClearBrowsingData(COREWEBVIEW2_BROWSING_DATA_KINDS_DISK_CACHE, &handler)
                .is_err()
            {
                let _ = webview.Reload();
            }
        })
        .map_err(|error| error.to_string())
}

fn save_permissions<R: Runtime>(window: &WebviewWindow<R>) {
    let _ = window.with_webview(|platform| unsafe {
        let profile = platform
            .controller()
            .CoreWebView2()
            .and_then(|webview| webview.cast::<ICoreWebView2_13>())
            .and_then(|webview| webview.Profile())
            .and_then(|profile| profile.cast::<ICoreWebView2Profile4>());
        let Ok(profile) = profile else {
            return;
        };
        for origin in ORIGINS {
            for kind in GRANTED {
                let handler = SetPermissionStateCompletedHandler::create(Box::new(|_| Ok(())));
                let _ = profile.SetPermissionState(
                    kind,
                    &HSTRING::from(origin),
                    COREWEBVIEW2_PERMISSION_STATE_ALLOW,
                    &handler,
                );
            }
        }
    });
}
