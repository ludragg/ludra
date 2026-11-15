use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use image::codecs::jpeg::JpegEncoder;
use image::{ExtendedColorType, ImageEncoder};
use serde::Serialize;
use windows::Win32::Foundation::{HWND, RECT};
use windows::Win32::Graphics::Gdi::{
    BI_RGB, BITMAPINFO, BITMAPINFOHEADER, BitBlt, CreateCompatibleBitmap, CreateCompatibleDC,
    DIB_RGB_COLORS, DeleteDC, DeleteObject, GetDC, GetDIBits, GetMonitorInfoW, HALFTONE, HDC,
    HGDIOBJ, HMONITOR, MONITORINFO, ReleaseDC, SRCCOPY, SelectObject, SetStretchBltMode,
    StretchBlt,
};
use windows::Win32::Storage::Xps::{PRINT_WINDOW_FLAGS, PrintWindow};
use windows::Win32::UI::WindowsAndMessaging::{
    GetWindowRect, GetWindowThreadProcessId, IsHungAppWindow, IsIconic,
};
use windows_capture::monitor::Monitor;
use windows_capture::window::Window;

const THUMBNAIL_WIDTH: i32 = 320;
const THUMBNAIL_HEIGHT: i32 = 180;
const PW_RENDERFULLCONTENT: u32 = 2;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Source {
    pub id: String,
    pub kind: &'static str,
    pub name: String,
    pub thumbnail: Option<String>,
}

pub enum Target {
    Monitor(Monitor),
    Window(Window),
}

pub fn list() -> Vec<Source> {
    let mut sources = Vec::new();

    for (index, monitor) in Monitor::enumerate()
        .unwrap_or_default()
        .into_iter()
        .enumerate()
    {
        let name = monitor
            .name()
            .unwrap_or_else(|_| format!("Tela {}", index + 1));
        sources.push(Source {
            id: format!("monitor:{}", index + 1),
            kind: "screen",
            name,
            thumbnail: monitor_thumbnail(HMONITOR(monitor.as_raw_hmonitor())),
        });
    }

    let own = std::process::id();
    for window in Window::enumerate().unwrap_or_default() {
        let hwnd = HWND(window.as_raw_hwnd());
        let title = window.title().unwrap_or_default();
        if title.trim().is_empty()
            || window_process(hwnd) == own
            || unsafe { IsIconic(hwnd).as_bool() }
        {
            continue;
        }
        sources.push(Source {
            id: format!("window:{}", hwnd.0 as usize),
            kind: "window",
            name: title,
            thumbnail: if unsafe { IsHungAppWindow(hwnd).as_bool() } {
                None
            } else {
                window_thumbnail(hwnd)
            },
        });
    }

    sources
}

pub fn resolve(id: &str) -> Option<Target> {
    let (kind, value) = id.split_once(':')?;
    match kind {
        "monitor" => Monitor::from_index(value.parse().ok()?)
            .ok()
            .map(Target::Monitor),
        "window" => {
            let window =
                Window::from_raw_hwnd(value.parse::<usize>().ok()? as *mut std::ffi::c_void);
            window.is_valid().then_some(Target::Window(window))
        }
        _ => None,
    }
}

fn window_process(hwnd: HWND) -> u32 {
    let mut process = 0;
    unsafe { GetWindowThreadProcessId(hwnd, Some(&mut process)) };
    process
}

fn monitor_thumbnail(monitor: HMONITOR) -> Option<String> {
    let mut info = MONITORINFO {
        cbSize: size_of::<MONITORINFO>() as u32,
        ..Default::default()
    };
    if !unsafe { GetMonitorInfoW(monitor, &mut info) }.as_bool() {
        return None;
    }
    let rect = info.rcMonitor;
    unsafe {
        let screen = GetDC(None);
        let result = snapshot(
            screen,
            rect.right - rect.left,
            rect.bottom - rect.top,
            |target| {
                BitBlt(
                    target,
                    0,
                    0,
                    rect.right - rect.left,
                    rect.bottom - rect.top,
                    Some(screen),
                    rect.left,
                    rect.top,
                    SRCCOPY,
                )
                .is_ok()
            },
        );
        ReleaseDC(None, screen);
        result
    }
}

fn window_thumbnail(hwnd: HWND) -> Option<String> {
    let mut rect = RECT::default();
    unsafe { GetWindowRect(hwnd, &mut rect) }.ok()?;
    unsafe {
        let screen = GetDC(None);
        let result = snapshot(
            screen,
            rect.right - rect.left,
            rect.bottom - rect.top,
            |target| PrintWindow(hwnd, target, PRINT_WINDOW_FLAGS(PW_RENDERFULLCONTENT)).as_bool(),
        );
        ReleaseDC(None, screen);
        result
    }
}

unsafe fn snapshot(
    reference: HDC,
    width: i32,
    height: i32,
    draw: impl FnOnce(HDC) -> bool,
) -> Option<String> {
    if width <= 0 || height <= 0 {
        return None;
    }
    let scale =
        (THUMBNAIL_WIDTH as f32 / width as f32).min(THUMBNAIL_HEIGHT as f32 / height as f32);
    let thumb_width = ((width as f32 * scale).round() as i32).max(1);
    let thumb_height = ((height as f32 * scale).round() as i32).max(1);

    unsafe {
        let full_dc = CreateCompatibleDC(Some(reference));
        let full_bitmap = CreateCompatibleBitmap(reference, width, height);
        let previous_full = SelectObject(full_dc, HGDIOBJ(full_bitmap.0));
        let drawn = draw(full_dc);

        let thumb_dc = CreateCompatibleDC(Some(reference));
        let thumb_bitmap = CreateCompatibleBitmap(reference, thumb_width, thumb_height);
        let previous_thumb = SelectObject(thumb_dc, HGDIOBJ(thumb_bitmap.0));
        SetStretchBltMode(thumb_dc, HALFTONE);
        let stretched = drawn
            && StretchBlt(
                thumb_dc,
                0,
                0,
                thumb_width,
                thumb_height,
                Some(full_dc),
                0,
                0,
                width,
                height,
                SRCCOPY,
            )
            .as_bool();

        let mut info = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: thumb_width,
                biHeight: -thumb_height,
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB.0,
                ..Default::default()
            },
            ..Default::default()
        };
        SelectObject(thumb_dc, previous_thumb);
        let mut pixels = vec![0u8; (thumb_width * thumb_height * 4) as usize];
        let copied = stretched
            && GetDIBits(
                thumb_dc,
                thumb_bitmap,
                0,
                thumb_height as u32,
                Some(pixels.as_mut_ptr().cast()),
                &mut info,
                DIB_RGB_COLORS,
            ) != 0;

        SelectObject(full_dc, previous_full);
        let _ = DeleteObject(HGDIOBJ(thumb_bitmap.0));
        let _ = DeleteObject(HGDIOBJ(full_bitmap.0));
        let _ = DeleteDC(thumb_dc);
        let _ = DeleteDC(full_dc);

        if !copied {
            return None;
        }
        encode(&pixels, thumb_width as u32, thumb_height as u32)
    }
}

fn encode(bgra: &[u8], width: u32, height: u32) -> Option<String> {
    let rgb: Vec<u8> = bgra
        .as_chunks::<4>()
        .0
        .iter()
        .flat_map(|pixel| [pixel[2], pixel[1], pixel[0]])
        .collect();
    let mut jpeg = Vec::new();
    JpegEncoder::new_with_quality(&mut jpeg, 70)
        .write_image(&rgb, width, height, ExtendedColorType::Rgb8)
        .ok()?;
    Some(format!("data:image/jpeg;base64,{}", STANDARD.encode(jpeg)))
}
