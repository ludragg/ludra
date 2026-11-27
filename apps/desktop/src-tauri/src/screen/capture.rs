use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};

use tauri::{AppHandle, Emitter};
use windows::Win32::Graphics::Direct3D11::{ID3D11Device, ID3D11DeviceContext, ID3D11Texture2D};
use windows::core::Interface;
use windows_capture::capture::{Context, GraphicsCaptureApiHandler};
use windows_capture::frame::Frame;
use windows_capture::graphics_capture_api::InternalCaptureControl;

use super::bridge::{Bridge, Format};
use super::handoff::Handoff;
use super::scaler::{Readback, Scaler};
use crate::stream::Publisher;

const IDLE_INTERVAL: Duration = Duration::from_secs(1);
const PREVIEW_INTERVAL: Duration = Duration::from_secs(1);
const PREVIEW_FLOWING: Duration = Duration::from_millis(250);
const SCALERS: usize = 2;

fn epoch() -> Instant {
    static EPOCH: OnceLock<Instant> = OnceLock::new();
    *EPOCH.get_or_init(Instant::now)
}

pub struct Flags {
    pub bridge: Arc<Bridge>,
    pub watched: Arc<AtomicBool>,
    pub publisher: Arc<Publisher>,
    pub handoff: Option<Arc<Mutex<Handoff>>>,
    pub app: AppHandle,
    pub width: u32,
    pub height: u32,
    pub fps: u32,
}

struct Staged {
    width: u32,
    height: u32,
    timestamp: u64,
    since: Instant,
}

pub struct Capture {
    bridge: Arc<Bridge>,
    watched: Arc<AtomicBool>,
    publisher: Arc<Publisher>,
    handoff: Option<Arc<Mutex<Handoff>>>,
    app: AppHandle,
    device: ID3D11Device,
    context: ID3D11DeviceContext,
    max_width: u32,
    max_height: u32,
    interval: Duration,
    pace: Duration,
    next: Option<Instant>,
    previewed: Option<Instant>,
    readback: Option<Readback>,
    staged: Option<Staged>,
    native: Vec<(usize, Scaler)>,
    software: bool,
}

impl Capture {
    fn due(&mut self, now: Instant, active: bool) -> bool {
        let interval = if active { self.interval } else { IDLE_INTERVAL };
        if self.pace != interval {
            self.pace = interval;
            self.next = None;
        }
        let next = match self.next {
            Some(next) if now + interval / 4 < next => return false,
            Some(next) if now < next + interval => next + interval,
            _ => now + interval,
        };
        self.next = Some(next);
        true
    }

    fn preview_due(&mut self, now: Instant, legacy: bool, streaming: bool) -> bool {
        if !legacy
            && streaming
            && self
                .previewed
                .is_some_and(|previous| now.duration_since(previous) < PREVIEW_INTERVAL)
        {
            return false;
        }
        self.previewed = Some(now);
        true
    }

    fn encode(&mut self, frame: &Frame, size: (u32, u32), timestamp: u64) {
        let input = (frame.width(), frame.height());
        let handoff = self.handoff.clone();
        let mut guard = handoff.as_ref().map(|shared| {
            shared
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner())
        });
        let carried = guard.as_mut().and_then(|handoff| {
            handoff
                .carry(&self.device, &self.context, frame.as_raw_texture())
                .ok()
        });
        let source = match &carried {
            Some(carried) => (carried.device, carried.context, carried.texture),
            None => (&self.device, &self.context, frame.as_raw_texture()),
        };
        let failed = render(
            &self.publisher,
            &mut self.native,
            source,
            input,
            size,
            timestamp,
        );
        drop(carried);
        drop(guard);
        if failed {
            self.native.clear();
            self.publisher
                .fail("the GPU cannot convert frames".to_owned());
        }
    }

    fn deliver(&mut self, wait: bool) {
        let (Some(staged), Some(readback)) = (&self.staged, &self.readback) else {
            return;
        };
        if !self.bridge.ready() {
            return;
        }
        let wait = wait || staged.since.elapsed() > PREVIEW_FLOWING;
        let context = &self.context;
        let sent = self.bridge.send(
            staged.width,
            staged.height,
            Format::Nv12,
            staged.timestamp,
            |target| readback.read(context, target, wait).is_ok(),
        );
        if sent || wait {
            self.staged = None;
        }
    }

    fn scale_on_gpu(
        &mut self,
        frame: &Frame,
        width: u32,
        height: u32,
        timestamp: u64,
        deferred: bool,
    ) -> windows::core::Result<()> {
        let input = (frame.width(), frame.height());
        let rebuild = self
            .readback
            .as_ref()
            .is_none_or(|readback| !readback.scaler.matches(input, (width, height)));
        if rebuild {
            self.staged = None;
            self.readback = Some(Readback::new(
                &self.device,
                &self.context,
                input,
                (width, height),
            )?);
        }
        if deferred && self.staged.is_some() {
            self.deliver(false);
            return Ok(());
        }
        let readback = self.readback.as_ref().expect("readback exists");
        readback.stage(&self.context, frame.as_raw_texture())?;
        self.staged = Some(Staged {
            width,
            height,
            timestamp,
            since: Instant::now(),
        });
        if !deferred {
            self.deliver(true);
        }
        Ok(())
    }
}

fn render(
    publisher: &Arc<Publisher>,
    native: &mut Vec<(usize, Scaler)>,
    (device, context, source): (&ID3D11Device, &ID3D11DeviceContext, &ID3D11Texture2D),
    input: (u32, u32),
    size: (u32, u32),
    timestamp: u64,
) -> bool {
    let owner = device.as_raw() as usize;
    let mut failed = false;
    publisher.encode(device, size, timestamp, |texture, output| {
        let rendered = (|| -> windows::core::Result<()> {
            let found = native
                .iter()
                .position(|(device, scaler)| *device == owner && scaler.matches(input, output));
            let index = match found {
                Some(index) => index,
                None => {
                    if native.len() == SCALERS {
                        native.remove(0);
                    }
                    native.push((owner, Scaler::new(device, context, input, output)?));
                    native.len() - 1
                }
            };
            let scaler = &native[index].1;
            let view = scaler.view(texture)?;
            scaler.blit(source, &view)?;
            unsafe { context.Flush() };
            Ok(())
        })();
        failed |= rendered.is_err();
        rendered.is_ok()
    });
    failed
}

fn scale_on_cpu(
    source: &[u8],
    pitch: usize,
    input_width: u32,
    input_height: u32,
    target: &mut [u8],
    width: u32,
    height: u32,
) -> bool {
    let row = width as usize * 4;
    let needed = pitch * (input_height as usize - 1) + input_width as usize * 4;
    if source.len() < needed || target.len() < row * height as usize {
        return false;
    }
    for y in 0..height as usize {
        let source_y = (y * input_height as usize / height as usize).min(input_height as usize - 1);
        let source_row = &source[source_y * pitch..];
        let target_row = &mut target[y * row..(y + 1) * row];
        for x in 0..width as usize {
            let source_x =
                (x * input_width as usize / width as usize).min(input_width as usize - 1) * 4;
            target_row[x * 4..x * 4 + 4].copy_from_slice(&source_row[source_x..source_x + 4]);
        }
    }
    true
}

impl GraphicsCaptureApiHandler for Capture {
    type Flags = Flags;
    type Error = String;

    fn new(ctx: Context<Self::Flags>) -> Result<Self, Self::Error> {
        let flags = ctx.flags;
        Ok(Self {
            bridge: flags.bridge,
            watched: flags.watched,
            publisher: flags.publisher,
            handoff: flags.handoff,
            app: flags.app,
            device: ctx.device,
            context: ctx.device_context,
            max_width: flags.width,
            max_height: flags.height,
            interval: Duration::from_secs_f64(1.0 / f64::from(flags.fps.max(1))),
            pace: Duration::ZERO,
            next: None,
            previewed: None,
            readback: None,
            staged: None,
            native: Vec::new(),
            software: false,
        })
    }

    fn on_frame_arrived(
        &mut self,
        frame: &mut Frame,
        _control: InternalCaptureControl,
    ) -> Result<(), Self::Error> {
        let now = Instant::now();
        let legacy = self.watched.load(Ordering::Relaxed);
        let streaming = self.publisher.streaming();
        self.deliver(false);
        if !self.due(now, legacy || streaming) {
            return Ok(());
        }

        let (input_width, input_height) = (frame.width(), frame.height());
        if input_width == 0 || input_height == 0 {
            return Ok(());
        }
        let (width, height) = fit(input_width, input_height, self.max_width, self.max_height);
        let timestamp = now.duration_since(epoch()).as_micros() as u64;
        self.encode(frame, (width, height), timestamp);
        let deferred = !legacy && streaming;
        if (width * height * 4) as usize > self.bridge.size()
            || !self.preview_due(now, legacy, streaming)
            || !self.bridge.ready()
        {
            return Ok(());
        }

        if !self.software
            && self
                .scale_on_gpu(frame, width, height, timestamp, deferred)
                .is_err()
        {
            self.software = true;
            self.staged = None;
            self.readback = None;
        }
        if self.software {
            let Ok(mut buffer) = frame.buffer() else {
                return Ok(());
            };
            let pitch = buffer.row_pitch() as usize;
            let source = buffer.as_raw_buffer();
            self.bridge
                .send(width, height, Format::Bgra, timestamp, |target| {
                    scale_on_cpu(
                        source,
                        pitch,
                        input_width,
                        input_height,
                        target,
                        width,
                        height,
                    )
                });
        }
        Ok(())
    }

    fn on_closed(&mut self) -> Result<(), Self::Error> {
        let _ = self.app.emit("screen-ended", ());
        Ok(())
    }
}

pub fn fit(width: u32, height: u32, max_width: u32, max_height: u32) -> (u32, u32) {
    let scale = (max_width as f64 / width as f64)
        .min(max_height as f64 / height as f64)
        .min(1.0);
    let even = |value: f64| ((value.round() as u32) & !1).max(2);
    (even(width as f64 * scale), even(height as f64 * scale))
}
