use std::collections::HashMap;
use std::sync::Arc;
use std::sync::atomic::{AtomicU32, Ordering};
use std::time::{Duration, Instant};

use tokio::sync::mpsc;

use super::quality::Quality;
use crate::encoder::EncodedFrame;

pub const MAIN_LANE: usize = 0;
pub const SLOW_LANE: usize = 1;
pub const LANES: usize = 2;

const SLOW_BELOW: f64 = 0.5;
const RECOVERED_ABOVE: f64 = 0.7;
const SLOW_AFTER: Duration = Duration::from_secs(2);
const FIRST_HOLD: Duration = Duration::from_secs(10);
const LONGEST_HOLD: Duration = Duration::from_secs(120);
const RELAPSE_WINDOW: Duration = Duration::from_secs(60);
const PROVEN_FOR: Duration = Duration::from_secs(5);

pub struct Viewer {
    pub frames: mpsc::Sender<Arc<EncodedFrame>>,
    pub estimate: Arc<AtomicU32>,
    pub lane: usize,
    pub syncing: bool,
    slow_since: Option<Instant>,
    recovering_since: Option<Instant>,
    demoted: Option<Instant>,
    promoted: Option<Instant>,
    hold: Duration,
}

impl Viewer {
    pub fn new(frames: mpsc::Sender<Arc<EncodedFrame>>, estimate: Arc<AtomicU32>) -> Self {
        Self {
            frames,
            estimate,
            lane: MAIN_LANE,
            syncing: true,
            slow_since: None,
            recovering_since: None,
            demoted: None,
            promoted: None,
            hold: FIRST_HOLD,
        }
    }

    pub fn estimate(&self) -> u32 {
        self.estimate.load(Ordering::Relaxed)
    }

    fn move_to(&mut self, lane: usize) {
        self.lane = lane;
        self.syncing = true;
        self.slow_since = None;
        self.recovering_since = None;
    }

    fn demote(&mut self, now: Instant) {
        let relapsed = self
            .promoted
            .is_some_and(|at| now.duration_since(at) < RELAPSE_WINDOW);
        self.hold = if relapsed {
            (self.hold * 2).min(LONGEST_HOLD)
        } else {
            FIRST_HOLD
        };
        self.demoted = Some(now);
        self.move_to(SLOW_LANE);
    }

    fn promote(&mut self, now: Instant) {
        self.promoted = Some(now);
        self.move_to(MAIN_LANE);
    }
}

fn best_rate(viewers: &HashMap<String, Viewer>, quality: Quality) -> f64 {
    let best = viewers
        .values()
        .map(|viewer| quality.bitrate_for(viewer.estimate()))
        .max()
        .unwrap_or_default();
    f64::from(best)
}

pub fn pace_setter(
    viewers: &HashMap<String, Viewer>,
    lane: usize,
    quality: Quality,
) -> Option<u32> {
    let floor = if lane == MAIN_LANE {
        best_rate(viewers, quality) * SLOW_BELOW
    } else {
        0.0
    };
    viewers
        .values()
        .filter(|viewer| viewer.lane == lane)
        .map(Viewer::estimate)
        .filter(|&estimate| f64::from(quality.bitrate_for(estimate)) >= floor)
        .min()
}

pub fn rebalance(
    viewers: &mut HashMap<String, Viewer>,
    quality: Quality,
    slow_lane_bitrate: u32,
) -> [bool; LANES] {
    let now = Instant::now();
    let mut gained = [false; LANES];
    let best = best_rate(viewers, quality);
    let alone = viewers.len() < LANES;
    let proven = f64::from(slow_lane_bitrate) >= best * RECOVERED_ABOVE;
    for viewer in viewers.values_mut() {
        if viewer.lane == MAIN_LANE {
            let rate = f64::from(quality.bitrate_for(viewer.estimate()));
            if alone || rate >= best * SLOW_BELOW {
                viewer.slow_since = None;
            } else if now.duration_since(*viewer.slow_since.get_or_insert(now)) >= SLOW_AFTER {
                viewer.demote(now);
                gained[SLOW_LANE] = true;
            }
            continue;
        }
        let held = viewer
            .demoted
            .is_some_and(|at| now.duration_since(at) < viewer.hold);
        if !proven || held {
            viewer.recovering_since = None;
        }
        let recovered = proven
            && !held
            && now.duration_since(*viewer.recovering_since.get_or_insert(now)) >= PROVEN_FOR;
        if alone || recovered {
            viewer.promote(now);
            gained[MAIN_LANE] = true;
        }
    }
    if !viewers.is_empty() && viewers.values().all(|viewer| viewer.lane == SLOW_LANE) {
        viewers.values_mut().for_each(|viewer| viewer.promote(now));
        gained = [true, false];
    }
    gained
}
