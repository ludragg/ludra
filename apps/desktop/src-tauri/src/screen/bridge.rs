use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc;

use tauri::Webview;
use webview2_com::Microsoft::Web::WebView2::Win32::{
    COREWEBVIEW2_SHARED_BUFFER_ACCESS_READ_ONLY, ICoreWebView2_17, ICoreWebView2Environment12,
    ICoreWebView2SharedBuffer,
};
use windows::core::{HSTRING, Interface, PCWSTR};

const SLOTS: usize = 3;

struct SharedBuffer(ICoreWebView2SharedBuffer);

unsafe impl Send for SharedBuffer {}
unsafe impl Sync for SharedBuffer {}

struct Slot {
    buffer: Arc<SharedBuffer>,
    pointer: usize,
    busy: Arc<AtomicBool>,
}

pub struct Bridge {
    webview: Webview,
    slots: Vec<Slot>,
    size: usize,
    session: u64,
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
                        let buffer = unsafe { environment.CreateSharedBuffer(size as u64)? };
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
            .map(|(buffer, pointer)| Slot {
                buffer: Arc::new(buffer),
                pointer,
                busy: Arc::new(AtomicBool::new(false)),
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

    pub fn release(&self, session: u64, slot: usize) {
        if session != self.session {
            return;
        }
        if let Some(slot) = self.slots.get(slot) {
            slot.busy.store(false, Ordering::Release);
        }
    }

    pub fn send(
        &self,
        width: u32,
        height: u32,
        timestamp: u64,
        fill: impl FnOnce(&mut [u8]) -> bool,
    ) -> bool {
        let length = (width * height * 4) as usize;
        if length > self.size {
            return false;
        }
        let Some((index, slot)) = self.slots.iter().enumerate().find(|(_, slot)| {
            slot.busy
                .compare_exchange(false, true, Ordering::AcqRel, Ordering::Relaxed)
                .is_ok()
        }) else {
            return false;
        };

        let target = unsafe { std::slice::from_raw_parts_mut(slot.pointer as *mut u8, length) };
        if !fill(target) {
            slot.busy.store(false, Ordering::Release);
            return false;
        }

        let buffer = slot.buffer.clone();
        let busy = slot.busy.clone();
        let session = self.session;
        let meta = HSTRING::from(format!(
            r#"{{"kind":"ludra-screen","session":{session},"slot":{index},"width":{width},"height":{height},"timestamp":{timestamp}}}"#
        ));
        let posted = self.webview.with_webview(move |platform| {
            let result = (|| -> windows::core::Result<()> {
                let core: ICoreWebView2_17 =
                    unsafe { platform.controller().CoreWebView2()? }.cast()?;
                unsafe {
                    core.PostSharedBufferToScript(
                        &buffer.0,
                        COREWEBVIEW2_SHARED_BUFFER_ACCESS_READ_ONLY,
                        PCWSTR(meta.as_ptr()),
                    )
                }
            })();
            if result.is_err() {
                busy.store(false, Ordering::Release);
            }
        });
        if posted.is_err() {
            slot.busy.store(false, Ordering::Release);
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
