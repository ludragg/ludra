use std::collections::VecDeque;
use std::sync::Arc;
use std::time::{Duration, Instant};

use super::pool::Slot;

const BACKLOG: usize = 2;
const REPEAT_AFTER: Duration = Duration::from_millis(500);
const REPEAT_FOR_KEYFRAME: Duration = Duration::from_millis(60);
const STALL_LIMIT: Duration = Duration::from_secs(2);

pub struct Job {
    pub slot: Arc<Slot>,
    pub timestamp_us: u64,
    pub keyframe: bool,
}

#[derive(Default)]
pub struct Schedule {
    waiting: VecDeque<(Arc<Slot>, u64)>,
    last: Option<(Arc<Slot>, u64, Instant)>,
    encoding: VecDeque<(Arc<Slot>, u64, Instant)>,
    keyframe: bool,
}

impl Schedule {
    pub fn frame(&mut self, slot: Slot, timestamp_us: u64) {
        if self.waiting.len() == BACKLOG {
            self.waiting.pop_front();
        }
        let slot = Arc::new(slot);
        self.last = Some((slot.clone(), timestamp_us, Instant::now()));
        self.waiting.push_back((slot, timestamp_us));
    }

    pub fn keyframe(&mut self) {
        self.keyframe = true;
    }

    pub fn next(&mut self) -> Option<Job> {
        if self.waiting.is_empty() && self.encoding.is_empty() {
            self.repeat();
        }
        let (slot, timestamp_us) = self.waiting.pop_front()?;
        Some(Job {
            slot,
            timestamp_us,
            keyframe: std::mem::take(&mut self.keyframe),
        })
    }

    pub fn retry(&mut self, job: Job) {
        self.keyframe |= job.keyframe;
        self.waiting.push_front((job.slot, job.timestamp_us));
    }

    pub fn submitted(&mut self, job: Job) {
        self.encoding
            .push_back((job.slot, job.timestamp_us, Instant::now()));
    }

    pub fn completed(&mut self) -> Option<u64> {
        self.encoding
            .pop_front()
            .map(|(_, timestamp_us, _)| timestamp_us)
    }

    pub fn in_flight(&self) -> bool {
        !self.encoding.is_empty()
    }

    pub fn busy(&self) -> bool {
        self.in_flight() || !self.waiting.is_empty()
    }

    pub fn stalled(&self) -> bool {
        self.encoding
            .front()
            .is_some_and(|(_, _, since)| since.elapsed() > STALL_LIMIT)
    }

    fn repeat(&mut self) {
        let Some((slot, timestamp_us, since)) = &self.last else {
            return;
        };
        let idle = since.elapsed();
        if idle < REPEAT_AFTER && !(self.keyframe && idle >= REPEAT_FOR_KEYFRAME) {
            return;
        }
        let repeated = (slot.clone(), timestamp_us + idle.as_micros() as u64);
        self.last = Some((repeated.0.clone(), repeated.1, Instant::now()));
        self.waiting.push_back(repeated);
    }
}
