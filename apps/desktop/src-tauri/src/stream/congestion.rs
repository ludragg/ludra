use std::sync::Arc;
use std::sync::atomic::{AtomicU32, Ordering};
use std::time::Instant;

use rtc::interceptor::{BandwidthEstimator, EstimatorStats, Gcc, PacketReport};

pub struct Estimator {
    inner: Gcc,
    target: Arc<AtomicU32>,
}

impl Estimator {
    pub fn new(initial: u32, minimum: u32, maximum: u32, target: Arc<AtomicU32>) -> Self {
        target.store(initial, Ordering::Relaxed);
        Self {
            inner: Gcc::new(initial.into(), minimum.into(), maximum.into()),
            target,
        }
    }

    fn publish(&self) {
        self.target
            .store(self.inner.target_bitrate() as u32, Ordering::Relaxed);
    }
}

impl BandwidthEstimator for Estimator {
    fn on_reports(&mut self, now: Instant, reports: &[PacketReport]) {
        self.inner.on_reports(now, reports);
        self.publish();
    }

    fn target_bitrate(&self) -> f64 {
        self.inner.target_bitrate()
    }

    fn handle_timeout(&mut self, now: Instant) {
        self.inner.handle_timeout(now);
        self.publish();
    }

    fn poll_timeout(&self) -> Option<Instant> {
        self.inner.poll_timeout()
    }

    fn stats(&self) -> EstimatorStats {
        self.inner.stats()
    }
}
