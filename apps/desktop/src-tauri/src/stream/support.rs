use std::sync::OnceLock;

use windows::Win32::Graphics::Direct3D::D3D_DRIVER_TYPE_HARDWARE;
use windows::Win32::Graphics::Direct3D11::{
    D3D11_CREATE_DEVICE_BGRA_SUPPORT, D3D11_SDK_VERSION, D3D11CreateDevice, ID3D11Device,
};

use crate::encoder::{Backend, Config, Encoder, Mode};

#[derive(Clone, serde::Serialize)]
pub struct Detected {
    id: &'static str,
    name: String,
}

fn probe(backend: Backend) -> Config {
    Config {
        width: 1280,
        height: 720,
        fps: 60,
        bitrate: 4_000_000,
        mode: Mode::Balanced,
        backend: Some(backend),
    }
}

pub fn hardware_encoders() -> Vec<Detected> {
    static ENCODERS: OnceLock<Vec<Detected>> = OnceLock::new();
    ENCODERS
        .get_or_init(|| {
            let Some(device) = device() else {
                return Vec::new();
            };
            Backend::ALL
                .into_iter()
                .filter_map(|backend| {
                    let encoder = Encoder::start(&device, probe(backend), |_| {}).ok()?;
                    Some(Detected {
                        id: backend.id(),
                        name: encoder.name.clone(),
                    })
                })
                .collect()
        })
        .clone()
}

fn device() -> Option<ID3D11Device> {
    let mut device = None;
    unsafe {
        D3D11CreateDevice(
            None,
            D3D_DRIVER_TYPE_HARDWARE,
            Default::default(),
            D3D11_CREATE_DEVICE_BGRA_SUPPORT,
            None,
            D3D11_SDK_VERSION,
            Some(&mut device),
            None,
            None,
        )
        .ok()?;
    }
    device
}
