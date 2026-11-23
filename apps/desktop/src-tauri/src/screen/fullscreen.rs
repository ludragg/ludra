use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use tauri::Emitter;
use windows::Win32::Foundation::HWND;
use windows::Win32::Graphics::Gdi::{GetMonitorInfoW, HMONITOR, MONITORINFO};
use windows::Win32::UI::WindowsAndMessaging::GetForegroundWindow;
use windows_capture::capture::CaptureControl;
use windows_capture::monitor::Monitor;
use windows_capture::window::Window;

use super::begin;
use super::capture::{Capture, Flags};
use super::sources::Target;

const POLL: Duration = Duration::from_millis(200);

pub struct Capturing {
    control: Mutex<Option<CaptureControl<Capture, String>>>,
    stopped: AtomicBool,
}

impl Capturing {
    pub fn new(control: CaptureControl<Capture, String>) -> Self {
        Self {
            control: Mutex::new(Some(control)),
            stopped: AtomicBool::new(false),
        }
    }

    pub fn stop(&self) {
        self.stopped.store(true, Ordering::Release);
        let control = self.control.lock().ok().and_then(|mut guard| guard.take());
        if let Some(control) = control {
            let _ = control.stop();
        }
    }
}

fn filling(window: Window) -> Option<Monitor> {
    if unsafe { GetForegroundWindow() } != HWND(window.as_raw_hwnd()) {
        return None;
    }
    let monitor = window.monitor()?;
    let rect = window.rect().ok()?;
    let mut info = MONITORINFO {
        cbSize: size_of::<MONITORINFO>() as u32,
        ..Default::default()
    };
    if !unsafe { GetMonitorInfoW(HMONITOR(monitor.as_raw_hmonitor()), &mut info) }.as_bool() {
        return None;
    }
    let area = info.rcMonitor;
    (rect.left <= area.left
        && rect.top <= area.top
        && rect.right >= area.right
        && rect.bottom >= area.bottom)
        .then_some(monitor)
}

pub fn watch(capturing: Arc<Capturing>, window: Window, flags: Flags) {
    thread::spawn(move || {
        let mut on_monitor = false;
        while !capturing.stopped.load(Ordering::Acquire) {
            thread::sleep(POLL);
            let target = match (on_monitor, filling(window)) {
                (false, Some(monitor)) => Target::Monitor(monitor),
                (true, None) => {
                    if !window.is_valid() {
                        let _ = flags.app.emit("screen-ended", ());
                        return;
                    }
                    Target::Window(window)
                }
                _ => continue,
            };

            let mut guard = capturing.control.lock().unwrap();
            if capturing.stopped.load(Ordering::Acquire) {
                return;
            }
            if let Some(old) = guard.take() {
                let _ = old.stop();
            }
            let next_on_monitor = matches!(target, Target::Monitor(_));
            match begin(target, flags.clone()) {
                Ok(control) => {
                    *guard = Some(control);
                    on_monitor = next_on_monitor;
                }
                Err(_) => match begin(Target::Window(window), flags.clone()) {
                    Ok(control) => {
                        *guard = Some(control);
                        on_monitor = false;
                    }
                    Err(_) => {
                        drop(guard);
                        let _ = flags.app.emit("screen-ended", ());
                        return;
                    }
                },
            }
        }
    });
}
