use std::ffi::c_void;
use std::ptr::{null, null_mut};

use windows::Win32::Graphics::Direct3D11::ID3D11Device;
use windows::Win32::System::LibraryLoader::{
    GetProcAddress, LOAD_LIBRARY_SEARCH_SYSTEM32, LoadLibraryExW,
};
use windows::core::{Interface, PCSTR, s, w};

use super::super::schedule::Job;
use super::super::{Config, Mode};

unsafe extern "C" {
    fn ludra_nvenc_open(
        create_instance: *const c_void,
        max_version: *const c_void,
        device: *mut c_void,
        width: u32,
        height: u32,
        fps: u32,
        bitrate: u32,
        effort: u32,
        result: *mut *mut c_void,
    ) -> i32;
    fn ludra_nvenc_encode(
        encoder: *mut c_void,
        texture: *mut c_void,
        timestamp: u64,
        keyframe: i32,
        data: *mut *const u8,
        size: *mut u32,
    ) -> i32;
    fn ludra_nvenc_release(encoder: *mut c_void);
    fn ludra_nvenc_set_bitrate(encoder: *mut c_void, bitrate: u32) -> i32;
    fn ludra_nvenc_close(encoder: *mut c_void);
}

fn entry_points() -> Result<(*const c_void, *const c_void), String> {
    let library =
        unsafe { LoadLibraryExW(w!("nvEncodeAPI64.dll"), None, LOAD_LIBRARY_SEARCH_SYSTEM32) }
            .map_err(|_| "NVENC runtime not found".to_owned())?;
    let find = |name: PCSTR| {
        unsafe { GetProcAddress(library, name) }
            .map(|address| address as *const c_void)
            .ok_or_else(|| "NVENC entry point not found".to_owned())
    };
    Ok((
        find(s!("NvEncodeAPICreateInstance"))?,
        find(s!("NvEncodeAPIGetMaxSupportedVersion"))?,
    ))
}

pub struct Session(*mut c_void);

impl Session {
    pub fn open(device: &ID3D11Device, config: Config) -> Result<Self, String> {
        let (create_instance, max_version) = entry_points()?;
        let mut encoder = null_mut();
        let status = unsafe {
            ludra_nvenc_open(
                create_instance,
                max_version,
                device.as_raw(),
                config.width,
                config.height,
                config.fps,
                config.bitrate,
                match config.mode {
                    Mode::Performance => 0,
                    Mode::Balanced => 1,
                    Mode::Quality | Mode::Extreme => 2,
                },
                &mut encoder,
            )
        };
        if status != 0 || encoder.is_null() {
            return Err(format!("NVENC initialization failed with {status}"));
        }
        Ok(Self(encoder))
    }

    pub fn encode(&mut self, job: &Job) -> Result<Option<Vec<u8>>, String> {
        let mut data = null();
        let mut size = 0;
        let status = unsafe {
            ludra_nvenc_encode(
                self.0,
                job.slot.texture().as_raw(),
                job.timestamp_us,
                job.keyframe.into(),
                &mut data,
                &mut size,
            )
        };
        if status != 0 {
            return Err(format!("NVENC encoding failed with {status}"));
        }
        if data.is_null() || size == 0 {
            return Ok(None);
        }
        let encoded = unsafe { std::slice::from_raw_parts(data, size as usize) }.to_vec();
        unsafe { ludra_nvenc_release(self.0) };
        Ok(Some(encoded))
    }

    pub fn set_bitrate(&mut self, bitrate: u32) {
        unsafe { ludra_nvenc_set_bitrate(self.0, bitrate) };
    }
}

impl Drop for Session {
    fn drop(&mut self) {
        unsafe { ludra_nvenc_close(self.0) };
    }
}
