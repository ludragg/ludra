use std::time::{Duration, Instant};

const STEPS: [u32; 3] = [1080, 720, 540];
const LOWER_BELOW: f64 = 0.85;
const RAISE_ABOVE: f64 = 1.15;
const NEAR_CEILING: f64 = 0.95;
const LOWER_AFTER: Duration = Duration::from_millis(1500);
const RAISE_AFTER: Duration = Duration::from_secs(4);
const WARMUP: Duration = Duration::from_secs(8);

fn needed(height: u32, fps: u32) -> f64 {
    let base = match height {
        0..=540 => 1_200_000.0,
        541..=720 => 2_200_000.0,
        721..=1080 => 4_500_000.0,
        _ => 9_000_000.0,
    };
    let motion = match fps {
        0..=30 => 0.35,
        31..=60 => 1.0,
        _ => 1.4,
    };
    base * motion
}

pub struct Ladder {
    limit: u32,
    started: Instant,
    low: Option<Instant>,
    high: Option<Instant>,
}

impl Ladder {
    pub fn new() -> Self {
        Self {
            limit: u32::MAX,
            started: Instant::now(),
            low: None,
            high: None,
        }
    }

    pub fn fitting(bitrate: u32, source_height: u32, fps: u32) -> Self {
        let affordable = |height: u32| f64::from(bitrate) >= needed(height, fps) * LOWER_BELOW;
        let limit = if affordable(source_height) {
            u32::MAX
        } else {
            STEPS
                .into_iter()
                .filter(|&step| step < source_height)
                .find(|&step| affordable(step))
                .unwrap_or(STEPS[STEPS.len() - 1])
        };
        Self {
            limit,
            ..Self::new()
        }
    }

    pub fn update(&mut self, bitrate: u32, source_height: u32, fps: u32, ceiling: u32) {
        let now = Instant::now();
        let current = self.limit.min(source_height);
        let lower = STEPS.into_iter().find(|&step| step < current);
        let higher = (current < source_height).then(|| {
            STEPS
                .into_iter()
                .rev()
                .find(|&step| step > current && step < source_height)
                .unwrap_or(source_height)
        });
        let bitrate = f64::from(bitrate);

        let wanted = needed(current, fps);
        let starving = lower.filter(|_| bitrate < wanted * LOWER_BELOW);
        if let Some(step) = starving {
            let since = *self.low.get_or_insert(now);
            let settled = now.duration_since(self.started) >= WARMUP || bitrate < wanted / 2.0;
            if settled && now.duration_since(since) >= LOWER_AFTER {
                self.limit = step;
                self.low = None;
            }
        } else {
            self.low = None;
        }

        let reachable = f64::from(ceiling) * NEAR_CEILING;
        let affordable =
            higher.filter(|&step| bitrate >= (needed(step, fps) * RAISE_ABOVE).min(reachable));
        if let Some(step) = affordable {
            let since = *self.high.get_or_insert(now);
            if now.duration_since(since) >= RAISE_AFTER {
                self.limit = if step >= source_height {
                    u32::MAX
                } else {
                    step
                };
                self.high = None;
            }
        } else {
            self.high = None;
        }
    }

    pub fn size(&self, (width, height): (u32, u32)) -> (u32, u32) {
        if self.limit >= height {
            return (width, height);
        }
        let even = |value: u32| (value & !1).max(2);
        let scaled = u64::from(width) * u64::from(self.limit) / u64::from(height);
        (even(scaled as u32), even(self.limit))
    }
}
