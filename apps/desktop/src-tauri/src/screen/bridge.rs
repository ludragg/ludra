use std::sync::Arc;
use std::sync::atomic::{AtomicU8, Ordering};
use std::sync::mpsc;

use tauri::Webview;
use webview2_com::Microsoft::Web::WebView2::Win32::{
    COREWEBVIEW2_SHARED_BUFFER_ACCESS_READ_WRITE, ICoreWebView2_17, ICoreWebView2Environment12,
    ICoreWebView2SharedBuffer,
};
use windows::core::{HSTRING, Interface, PCWSTR};

const SLOTS: usize = 3;
const HEADER: usize = 16;
const FREE: u8 = 0;
const BUSY: u8 = 1;

#[derive(Clone, Copy)]
pub enum Format {
    Bgra,
    Nv12,
}

impl Format {
    pub fn length(self, width: u32, height: u32) -> usize {
        let pixels = width as usize * height as usize;
        match self {
            Self::Bgra => pixels * 4,
            Self::Nv12 => pixels * 3 / 2,
        }
    }

    fn name(self) -> &'static str {
        match self {
            Self::Bgra => "BGRA",
            Self::Nv12 => "NV12",
        }
    }
}

struct SharedBuffer(ICoreWebView2SharedBuffer);

unsafe impl Send for SharedBuffer {}
unsafe impl Sync for SharedBuffer {}

struct Slot {
    buffer: Arc<SharedBuffer>,
    pointer: usize,
}

pub struct Bridge {
    webview: Webview,
    slots: Vec<Slot>,
    size: usize,
    session: u64,
}

pub fn browser_process(webview: &Webview) -> Option<u32> {
    let (sender, receiver) = mpsc::channel();
    webview
        .with_webview(move |platform| {
            let mut id = 0u32;
            let result = unsafe {
                platform
                    .controller()
                    .CoreWebView2()
                    .and_then(|core| core.BrowserProcessId(&mut id))
            };
            let _ = sender.send(result.ok().map(|()| id));
        })
        .ok()?;
    receiver.recv().ok().flatten().filter(|id| *id != 0)
}

fn state(pointer: usize) -> &'static AtomicU8 {
    unsafe { AtomicU8::from_ptr(pointer as *mut u8) }
}

impl Bridge {
    pub fn new(webview: Webview, size: usize, session: u64) -> Result<Self, String> {
        let (sender, receiver) = mpsc::channel();
        webview
            .with_webview(move |platform| {
                let result = (|| -> windows::core::Result<Vec<(SharedBuffer, usize)>> {
                    let environment: ICoreWebView2Environment12 = platform.environment().cast()?;
                    let mut buffers = Vec::with_capacity(SLOTS);
                    for _ in 0..SLOTS {
                        let buffer =
                            unsafe { environment.CreateSharedBuffer((HEADER + size) as u64)? };
                        let mut pointer = std::ptr::null_mut();
                        unsafe { buffer.Buffer(&mut pointer)? };
                        buffers.push((SharedBuffer(buffer), pointer as usize));
                    }
                    Ok(buffers)
                })();
                let _ = sender.send(result.map_err(|error| error.to_string()));
            })
            .map_err(|error| error.to_string())?;

        let buffers = receiver.recv().map_err(|error| error.to_string())??;
        let slots = buffers
            .into_iter()
            .map(|(buffer, pointer)| {
                state(pointer).store(FREE, Ordering::Release);
                Slot {
                    buffer: Arc::new(buffer),
                    pointer,
                }
            })
            .collect();
        Ok(Self {
            webview,
            slots,
            size,
            session,
        })
    }

    pub fn size(&self) -> usize {
        self.size
    }

    pub fn ready(&self) -> bool {
        self.slots
            .iter()
            .any(|slot| state(slot.pointer).load(Ordering::Acquire) == FREE)
    }

    pub fn send(
        &self,
        width: u32,
        height: u32,
        format: Format,
        timestamp: u64,
        fill: impl FnOnce(&mut [u8]) -> bool,
    ) -> bool {
        let length = format.length(width, height);
        if length > self.size {
            return false;
        }
        let Some((index, slot)) = self.slots.iter().enumerate().find(|(_, slot)| {
            state(slot.pointer)
                .compare_exchange(FREE, BUSY, Ordering::AcqRel, Ordering::Relaxed)
                .is_ok()
        }) else {
            return false;
        };

        let pointer = slot.pointer;
        let target =
            unsafe { std::slice::from_raw_parts_mut((pointer + HEADER) as *mut u8, length) };
        if !fill(target) {
            state(pointer).store(FREE, Ordering::Release);
            return false;
        }

        let buffer = slot.buffer.clone();
        let session = self.session;
        let meta = HSTRING::from(format!(
            r#"{{"kind":"ludra-screen","session":{session},"slot":{index},"offset":{HEADER},"format":"{}","width":{width},"height":{height},"timestamp":{timestamp}}}"#,
            format.name()
        ));
        let posted = self.webview.with_webview(move |platform| {
            let result = (|| -> windows::core::Result<()> {
                let core: ICoreWebView2_17 =
                    unsafe { platform.controller().CoreWebView2()? }.cast()?;
                unsafe {
                    core.PostSharedBufferToScript(
                        &buffer.0,
                        COREWEBVIEW2_SHARED_BUFFER_ACCESS_READ_WRITE,
                        PCWSTR(meta.as_ptr()),
                    )
                }
            })();
            if result.is_err() {
                state(pointer).store(FREE, Ordering::Release);
            }
        });
        if posted.is_err() {
            state(pointer).store(FREE, Ordering::Release);
            return false;
        }
        true
    }
}

impl Drop for Bridge {
    fn drop(&mut self) {
        let buffers: Vec<Arc<SharedBuffer>> =
            self.slots.drain(..).map(|slot| slot.buffer).collect();
        let _ = self.webview.with_webview(move |_| drop(buffers));
    }
}
