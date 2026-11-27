use tauri::{Manager, Runtime, WebviewWindow, WebviewWindowBuilder};

use crate::storage;

const OFFSCREEN: f64 = -32000.0;

pub fn create<R: Runtime, M: Manager<R>>(
    builder: WebviewWindowBuilder<'_, R, M>,
) -> tauri::Result<WebviewWindow<R>> {
    let window = storage::webview(builder)
        .position(OFFSCREEN, OFFSCREEN)
        .focused(false)
        .visible(true)
        .build()?;
    window.hide()?;
    Ok(window)
}
