use std::time::{Duration, Instant};

const WINDOW: Duration = Duration::from_secs(12);
const TOLERANCE: f64 = 1.35;
const SLACK: f64 = 300_000.0;

pub struct Watchdog {
    since: Instant,
    bytes: usize,
    requested: u64,
    frames: u32,
}

impl Watchdog {
    pub fn new() -> Self {
        Self {
            since: Instant::now(),
            bytes: 0,
            requested: 0,
            frames: 0,
        }
    }

    pub fn ignores_limit(&mut self, bytes: usize, requested: u32, fps: u32) -> bool {
        self.bytes += bytes;
        self.requested += u64::from(requested);
        self.frames += 1;
        let elapsed = self.since.elapsed();
        if elapsed < WINDOW {
            return false;
        }
        let seconds = elapsed.as_secs_f64();
        let produced = self.bytes as f64 * 8.0 / seconds;
        let asked = self.requested as f64 / f64::from(self.frames);
        let busy = f64::from(self.frames) >= f64::from(fps) * seconds / 2.0;
        *self = Self::new();
        busy && produced > asked * TOLERANCE + SLACK
    }
}
