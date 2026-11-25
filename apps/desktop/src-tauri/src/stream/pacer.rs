use std::time::{Duration, Instant};

const HEADROOM: f64 = 2.5;
const FLOOR_BITS_PER_SECOND: f64 = 6_000_000.0;
const BURST_SECONDS: f64 = 0.02;
const SMALLEST_BURST: f64 = 15.0 * 1200.0;
const SHORTEST_WAIT: Duration = Duration::from_millis(1);

pub struct Pacer {
    budget: f64,
    refilled: Instant,
}

impl Pacer {
    pub fn new() -> Self {
        Self {
            budget: SMALLEST_BURST,
            refilled: Instant::now(),
        }
    }

    pub async fn admit(&mut self, bytes: usize, estimate: u32) {
        let rate = (f64::from(estimate) * HEADROOM).max(FLOOR_BITS_PER_SECOND) / 8.0;
        let burst = (rate * BURST_SECONDS).max(SMALLEST_BURST);
        let cost = (bytes as f64).min(burst);
        loop {
            let now = Instant::now();
            let earned = now.duration_since(self.refilled).as_secs_f64() * rate;
            self.budget = (self.budget + earned).min(burst);
            self.refilled = now;
            if self.budget >= cost {
                break;
            }
            let wait = Duration::from_secs_f64((cost - self.budget) / rate);
            tokio::time::sleep(wait.max(SHORTEST_WAIT)).await;
        }
        self.budget -= cost;
    }
}
