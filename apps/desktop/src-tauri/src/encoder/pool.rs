use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};

use windows::Win32::Graphics::Direct3D11::{
    D3D11_BIND_RENDER_TARGET, D3D11_TEXTURE2D_DESC, D3D11_USAGE_DEFAULT, ID3D11Device,
    ID3D11Texture2D,
};
use windows::Win32::Graphics::Dxgi::Common::{DXGI_FORMAT_NV12, DXGI_SAMPLE_DESC};

const SLOTS: usize = 6;

struct Entry {
    texture: ID3D11Texture2D,
    busy: AtomicBool,
}

pub struct Pool {
    entries: Vec<Arc<Entry>>,
}

unsafe impl Send for Pool {}
unsafe impl Sync for Pool {}

pub struct Slot(Arc<Entry>);

unsafe impl Send for Slot {}

impl Slot {
    pub fn texture(&self) -> &ID3D11Texture2D {
        &self.0.texture
    }
}

impl Drop for Slot {
    fn drop(&mut self) {
        self.0.busy.store(false, Ordering::Release);
    }
}

impl Pool {
    pub fn new(device: &ID3D11Device, width: u32, height: u32) -> windows::core::Result<Self> {
        let description = D3D11_TEXTURE2D_DESC {
            Width: width,
            Height: height,
            MipLevels: 1,
            ArraySize: 1,
            Format: DXGI_FORMAT_NV12,
            SampleDesc: DXGI_SAMPLE_DESC {
                Count: 1,
                Quality: 0,
            },
            Usage: D3D11_USAGE_DEFAULT,
            BindFlags: D3D11_BIND_RENDER_TARGET.0 as u32,
            CPUAccessFlags: 0,
            MiscFlags: 0,
        };
        let entries = (0..SLOTS)
            .map(|_| {
                let mut texture = None;
                unsafe { device.CreateTexture2D(&description, None, Some(&mut texture))? };
                Ok(Arc::new(Entry {
                    texture: texture.ok_or_else(windows::core::Error::empty)?,
                    busy: AtomicBool::new(false),
                }))
            })
            .collect::<windows::core::Result<Vec<_>>>()?;
        Ok(Self { entries })
    }

    pub fn acquire(&self) -> Option<Slot> {
        self.entries
            .iter()
            .find(|entry| {
                entry
                    .busy
                    .compare_exchange(false, true, Ordering::AcqRel, Ordering::Relaxed)
                    .is_ok()
            })
            .map(|entry| Slot(entry.clone()))
    }
}
