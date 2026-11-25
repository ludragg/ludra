use std::sync::{Mutex, MutexGuard};
use std::time::{Duration, Instant};

use windows::Win32::Graphics::Direct3D11::{ID3D11Device, ID3D11Texture2D};
use windows::core::Interface;

use super::ladder::Ladder;
use super::quality::Quality;
use super::watchdog::Watchdog;
use crate::encoder::{Backend, Config, Control, Encoder};

const KEYFRAME_GAP: Duration = Duration::from_millis(500);
const RETUNE_GAP: Duration = Duration::from_millis(300);
const RESIZE_GAP: Duration = Duration::from_millis(500);
const SHARP_DROP: f64 = 0.65;
const REMEMBERED_SHARE: f64 = 0.75;
const REMEMBER_FOR: Duration = Duration::from_secs(20);

struct Active {
    encoder: Encoder,
    device: usize,
    size: (u32, u32),
    since: Instant,
}

struct Tuning {
    control: Option<Control>,
    bitrate: u32,
    source_height: u32,
    tuned: Instant,
    keyframe: Instant,
    keyframe_pending: bool,
    ladder: Ladder,
    watchdog: Watchdog,
    remembered: Option<(u32, Instant)>,
}

impl Tuning {
    fn new(bitrate: u32) -> Self {
        let past = Instant::now()
            .checked_sub(KEYFRAME_GAP)
            .unwrap_or_else(Instant::now);
        Self {
            control: None,
            bitrate,
            source_height: 0,
            tuned: past,
            keyframe: past,
            keyframe_pending: false,
            ladder: Ladder::new(),
            watchdog: Watchdog::new(),
            remembered: None,
        }
    }

    fn within_memory(&mut self, wanted: u32) -> u32 {
        if f64::from(wanted) < f64::from(self.bitrate) * SHARP_DROP {
            let safe = (f64::from(self.bitrate) * REMEMBERED_SHARE) as u32;
            self.remembered = Some((safe, Instant::now()));
        }
        match self.remembered {
            Some((safe, since)) if since.elapsed() < REMEMBER_FOR => wanted.min(safe),
            _ => wanted,
        }
    }

    fn send_keyframe(&mut self) {
        if !self.keyframe_pending || self.keyframe.elapsed() < KEYFRAME_GAP {
            return;
        }
        if let Some(control) = &self.control {
            control.request_keyframe();
            self.keyframe = Instant::now();
            self.keyframe_pending = false;
        }
    }
}

pub struct Lane {
    active: Mutex<Option<Active>>,
    tuning: Mutex<Tuning>,
}

pub fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

impl Lane {
    pub fn new(bitrate: u32) -> Self {
        Self {
            active: Mutex::default(),
            tuning: Mutex::new(Tuning::new(bitrate)),
        }
    }

    pub fn reset(&self, bitrate: u32) {
        self.stop();
        *lock(&self.tuning) = Tuning::new(bitrate);
    }

    pub fn stop(&self) {
        let previous = self.take();
        drop(previous);
    }

    fn take(&self) -> Option<Active> {
        let previous = lock(&self.active).take();
        if previous.is_some() {
            lock(&self.tuning).control = None;
        }
        previous
    }

    pub fn source_height(&self) -> u32 {
        lock(&self.tuning).source_height
    }

    pub fn is_idle(&self) -> bool {
        lock(&self.tuning).control.is_none()
    }

    pub fn seed(&self, bitrate: u32, source_height: u32, fps: u32) {
        let mut tuning = lock(&self.tuning);
        tuning.bitrate = bitrate;
        tuning.source_height = source_height;
        tuning.ladder = Ladder::fitting(bitrate, source_height, fps);
        tuning.remembered = None;
    }

    pub fn bitrate(&self) -> u32 {
        let tuning = lock(&self.tuning);
        if tuning.control.is_some() {
            tuning.bitrate
        } else {
            0
        }
    }

    pub fn encode(
        &self,
        device: &ID3D11Device,
        source: (u32, u32),
        timestamp_us: u64,
        quality: Quality,
        backend: Option<Backend>,
        start: impl FnOnce(Config) -> Result<Encoder, String>,
        render: impl FnOnce(&ID3D11Texture2D, (u32, u32)) -> bool,
    ) -> Result<(), String> {
        let key = device.as_raw() as usize;
        let (size, bitrate) = {
            let mut tuning = lock(&self.tuning);
            tuning.source_height = source.1;
            (tuning.ladder.size(source), tuning.bitrate)
        };
        let stale = lock(&self.active).as_ref().is_none_or(|current| {
            current.device != key || (current.size != size && current.since.elapsed() > RESIZE_GAP)
        });
        if stale {
            drop(self.take());
            let encoder = start(Config {
                width: size.0,
                height: size.1,
                fps: quality.fps,
                bitrate,
                mode: quality.mode,
                backend,
            })?;
            lock(&self.tuning).control = Some(encoder.control());
            *lock(&self.active) = Some(Active {
                encoder,
                device: key,
                size,
                since: Instant::now(),
            });
        }
        if let Some(current) = lock(&self.active).as_ref() {
            let size = current.size;
            current
                .encoder
                .encode(timestamp_us, |texture| render(texture, size));
        }
        Ok(())
    }

    pub fn tune(&self, estimate: u32, quality: Quality) {
        let mut tuning = lock(&self.tuning);
        if tuning.tuned.elapsed() < RETUNE_GAP {
            return;
        }
        tuning.tuned = Instant::now();
        let wanted = tuning.within_memory(quality.bitrate_for(estimate));
        let source_height = tuning.source_height;
        tuning
            .ladder
            .update(wanted, source_height, quality.fps, quality.ceiling());
        if wanted.abs_diff(tuning.bitrate) < tuning.bitrate / 20 {
            return;
        }
        tuning.bitrate = wanted;
        if let Some(control) = &tuning.control {
            control.set_bitrate(wanted);
        }
    }

    pub fn ignores_limit(&self, bytes: usize, quality: Quality) -> bool {
        let mut tuning = lock(&self.tuning);
        let requested = tuning.bitrate;
        tuning.watchdog.ignores_limit(bytes, requested, quality.fps)
    }

    pub fn request_keyframe(&self) {
        let mut tuning = lock(&self.tuning);
        tuning.keyframe_pending = true;
        tuning.send_keyframe();
    }

    pub fn flush_keyframe(&self) {
        lock(&self.tuning).send_keyframe();
    }
}
