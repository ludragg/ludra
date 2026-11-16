use tauri::{Manager, Runtime, WebviewWindow};
use webview2_com::Microsoft::Web::WebView2::Win32::{
    COREWEBVIEW2_BROWSING_DATA_KINDS_DISK_CACHE, COREWEBVIEW2_PERMISSION_KIND,
    COREWEBVIEW2_PERMISSION_KIND_AUTOPLAY, COREWEBVIEW2_PERMISSION_KIND_CLIPBOARD_READ,
    COREWEBVIEW2_PERMISSION_KIND_MICROPHONE, COREWEBVIEW2_PERMISSION_KIND_NOTIFICATIONS,
    COREWEBVIEW2_PERMISSION_STATE_ALLOW, ICoreWebView2_13, ICoreWebView2Profile2,
};
use webview2_com::{
    ClearBrowsingDataCompletedHandler, PermissionRequestedEventHandler, take_pwstr,
};
use windows::core::{Interface, PWSTR};

const GRANTED: [COREWEBVIEW2_PERMISSION_KIND; 4] = [
    COREWEBVIEW2_PERMISSION_KIND_MICROPHONE,
    COREWEBVIEW2_PERMISSION_KIND_AUTOPLAY,
    COREWEBVIEW2_PERMISSION_KIND_NOTIFICATIONS,
    COREWEBVIEW2_PERMISSION_KIND_CLIPBOARD_READ,
];

const ORIGINS: [&str; 3] = [
    "http://tauri.localhost",
    "https://tauri.localhost",
    "http://localhost:6767",
];

pub fn setup<R: Runtime, M: Manager<R>>(manager: &M) {
    if let Some(window) = manager.get_webview_window("main") {
        grant_permissions(&window);
    }
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
            let handler = ClearBrowsingDataCompletedHandler::create(Box::new(move |_| {
                reload.Reload()
            }));
            if profile
                .ClearBrowsingData(COREWEBVIEW2_BROWSING_DATA_KINDS_DISK_CACHE, &handler)
                .is_err()
            {
                let _ = webview.Reload();
            }
        })
        .map_err(|error| error.to_string())
}

fn grant_permissions<R: Runtime>(window: &WebviewWindow<R>) {
    let _ = window.with_webview(|platform| unsafe {
        let Ok(webview) = platform.controller().CoreWebView2() else {
            return;
        };
        let handler = PermissionRequestedEventHandler::create(Box::new(|_, args| {
            let Some(args) = args else {
                return Ok(());
            };
            let mut kind = COREWEBVIEW2_PERMISSION_KIND::default();
            args.PermissionKind(&mut kind)?;
            let mut uri = PWSTR::null();
            args.Uri(&mut uri)?;
            if GRANTED.contains(&kind) && trusted(&take_pwstr(uri)) {
                args.SetState(COREWEBVIEW2_PERMISSION_STATE_ALLOW)?;
            }
            Ok(())
        }));
        let mut token = 0;
        let _ = webview.add_PermissionRequested(&handler, &mut token);
    });
}

fn trusted(uri: &str) -> bool {
    ORIGINS.iter().any(|origin| {
        uri.strip_prefix(origin)
            .is_some_and(|rest| rest.is_empty() || rest.starts_with('/'))
    })
}
