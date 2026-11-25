mod amf;
mod guard;
mod media_foundation;
mod nal;
mod nvenc;
mod pool;
mod profile;
mod schedule;

use std::sync::Arc;
use std::sync::mpsc::{self, Receiver, Sender};
use std::thread::JoinHandle;
use std::time::Duration;

use bytes::Bytes;
use windows::Win32::Graphics::Direct3D11::{ID3D11Device, ID3D11Multithread, ID3D11Texture2D};
use windows::Win32::Graphics::Dxgi::IDXGIDevice;
use windows::Win32::System::Com::{COINIT_MULTITHREADED, CoInitializeEx, CoUninitialize};
use windows::Win32::System::Threading::{
    GetCurrentThread, SetThreadPriority, THREAD_PRIORITY_ABOVE_NORMAL,
};
use windows::core::Interface;

use crate::diagnostics;

pub use guard::set_directory as set_guard_directory;
pub use profile::{Backend, Mode};

use guard::Guard;
use pool::{Pool, Slot};

const IDLE_TICK: Duration = Duration::from_millis(20);
const BUSY_TICK: Duration = Duration::from_millis(1);
const GPU_PRIORITY: i32 = 5;

#[derive(Clone, Copy)]
pub struct Config {
    pub width: u32,
    pub height: u32,
    pub fps: u32,
    pub bitrate: u32,
    pub mode: Mode,
    pub backend: Option<Backend>,
}

pub struct EncodedFrame {
    pub data: Bytes,
    pub keyframe: bool,
    pub timestamp_us: u64,
}

pub enum Output {
    Frame(EncodedFrame),
    Failed(String),
}

enum Message {
    Frame(Slot, u64),
    Event(u32),
    Bitrate(u32),
    Keyframe,
    Stop,
}

type Ready = Sender<Result<String, String>>;

struct Device(ID3D11Device);

unsafe impl Send for Device {}

#[derive(Clone)]
pub struct Control {
    messages: Sender<Message>,
}

impl Control {
    pub fn set_bitrate(&self, bitrate: u32) {
        let _ = self.messages.send(Message::Bitrate(bitrate));
    }

    pub fn request_keyframe(&self) {
        let _ = self.messages.send(Message::Keyframe);
    }
}

pub struct Encoder {
    pool: Arc<Pool>,
    control: Control,
    thread: Option<JoinHandle<()>>,
    pub name: String,
}

impl Encoder {
    pub fn start(
        device: &ID3D11Device,
        config: Config,
        output: impl FnMut(Output) + Send + 'static,
    ) -> Result<Self, String> {
        if let Ok(protection) = device.cast::<ID3D11Multithread>() {
            let _ = unsafe { protection.SetMultithreadProtected(true) };
        }
        if let Ok(graphics) = device.cast::<IDXGIDevice>() {
            let _ = unsafe { graphics.SetGPUThreadPriority(GPU_PRIORITY) };
        }
        let pool = Arc::new(
            Pool::new(device, config.width, config.height).map_err(|error| error.to_string())?,
        );
        let (messages, inbox) = mpsc::channel();
        let (ready, started) = mpsc::channel();
        let device = Device(device.clone());
        let events = messages.clone();
        let thread = std::thread::Builder::new()
            .name("video-encoder".to_owned())
            .spawn(move || run(device, config, events, inbox, ready, output))
            .map_err(|error| error.to_string())?;
        let name = started
            .recv()
            .map_err(|_| "encoder thread stopped".to_owned())??;
        Ok(Self {
            pool,
            control: Control { messages },
            thread: Some(thread),
            name,
        })
    }

    pub fn control(&self) -> Control {
        self.control.clone()
    }

    pub fn encode(&self, timestamp_us: u64, render: impl FnOnce(&ID3D11Texture2D) -> bool) -> bool {
        let Some(slot) = self.pool.acquire() else {
            return false;
        };
        if !render(slot.texture()) {
            return false;
        }
        self.control
            .messages
            .send(Message::Frame(slot, timestamp_us))
            .is_ok()
    }
}

impl Drop for Encoder {
    fn drop(&mut self) {
        let _ = self.control.messages.send(Message::Stop);
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
    }
}

fn unavailable(backend: Backend, error: &str) {
    diagnostics::trail(
        "encoder",
        format_args!("{} did not start: {error}", backend.id()),
    );
}

enum Direct {
    Amf(amf::Amf),
    Nvenc(nvenc::Nvenc),
}

impl Direct {
    fn open(device: &ID3D11Device, config: Config) -> Option<(Self, Guard, &'static str)> {
        let wanted = |backend| config.backend.is_none_or(|chosen| chosen == backend);
        let amd = || {
            let guard = Guard::arm(Backend::Amf.id())?;
            let encoder = amf::Amf::open(device, config)
                .map_err(|error| unavailable(Backend::Amf, &error))
                .ok()?;
            Some((Self::Amf(encoder), guard, amf::NAME))
        };
        let nvidia = || {
            let guard = Guard::arm(Backend::Nvenc.id())?;
            let encoder = nvenc::Nvenc::open(device, config)
                .map_err(|error| unavailable(Backend::Nvenc, &error))
                .ok()?;
            Some((Self::Nvenc(encoder), guard, nvenc::NAME))
        };
        wanted(Backend::Amf)
            .then(amd)
            .flatten()
            .or_else(|| wanted(Backend::Nvenc).then(nvidia).flatten())
    }

    fn run(self, inbox: Receiver<Message>, output: &mut impl FnMut(Output)) -> Result<(), String> {
        match self {
            Self::Amf(encoder) => encoder.run(inbox, output),
            Self::Nvenc(encoder) => encoder.run(inbox, output),
        }
    }
}

fn run(
    device: Device,
    config: Config,
    messages: Sender<Message>,
    inbox: Receiver<Message>,
    ready: Ready,
    mut output: impl FnMut(Output),
) {
    let apartment = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) }.is_ok();
    let _ = unsafe { SetThreadPriority(GetCurrentThread(), THREAD_PRIORITY_ABOVE_NORMAL) };
    match Direct::open(&device.0, config) {
        Some((encoder, guard, name)) => {
            let _ = ready.send(Ok(name.to_owned()));
            let mut unproven = Some(guard);
            let result = encoder.run(inbox, &mut |value| {
                unproven.take();
                output(value);
            });
            if let Err(error) = result {
                output(Output::Failed(error));
            }
        }
        None if matches!(config.backend, None | Some(Backend::Windows)) => {
            media_foundation::run(&device.0, config, messages, inbox, &ready, &mut output);
        }
        None => {
            let _ = ready.send(Err("the chosen encoder did not start".to_owned()));
        }
    }
    if apartment {
        unsafe { CoUninitialize() };
    }
}
