use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex, Weak};
use std::time::{Duration, Instant};

use tokio::sync::mpsc;
use windows::Win32::Graphics::Direct3D11::{ID3D11Device, ID3D11Texture2D};

use super::lane::{Lane, lock};
use super::quality::Quality;
use super::viewers::{LANES, MAIN_LANE, SLOW_LANE, Viewer, pace_setter, rebalance};
use crate::encoder::{Backend, Config, EncodedFrame, Encoder, Mode, Output};

const REBALANCE_GAP: Duration = Duration::from_secs(1);
const DEFAULT_QUALITY: Quality = Quality {
    height: 1080,
    fps: 60,
    mode: Mode::Balanced,
};

#[derive(Clone, Copy, PartialEq)]
pub enum Selection {
    Automatic,
    Only(Backend),
    Compatibility,
}

impl Selection {
    pub fn parse(id: &str) -> Self {
        match Backend::parse(id) {
            Some(backend) => Self::Only(backend),
            None if id == "compatibility" => Self::Compatibility,
            None => Self::Automatic,
        }
    }

    fn backend(self) -> Option<Backend> {
        match self {
            Self::Only(backend) => Some(backend),
            Self::Automatic | Self::Compatibility => None,
        }
    }
}

type BrokenHandler = Box<dyn Fn(String) + Send + Sync>;

pub struct Publisher {
    viewers: Mutex<HashMap<String, Viewer>>,
    watching: AtomicUsize,
    lanes: [Lane; LANES],
    quality: Mutex<Quality>,
    selection: Mutex<Selection>,
    rebalanced: Mutex<Instant>,
    broken: AtomicBool,
    on_broken: BrokenHandler,
}

impl Publisher {
    pub fn new(on_broken: impl Fn(String) + Send + Sync + 'static) -> Arc<Self> {
        Arc::new(Self {
            viewers: Mutex::default(),
            watching: AtomicUsize::new(0),
            lanes: std::array::from_fn(|_| Lane::new(DEFAULT_QUALITY.initial())),
            quality: Mutex::new(DEFAULT_QUALITY),
            selection: Mutex::new(Selection::Automatic),
            rebalanced: Mutex::new(Instant::now()),
            broken: AtomicBool::new(false),
            on_broken: Box::new(on_broken),
        })
    }

    pub fn configure(&self, quality: Quality, selection: Selection) {
        for lane in &self.lanes {
            lane.reset(quality.initial());
        }
        *lock(&self.quality) = quality;
        *lock(&self.selection) = selection;
        self.broken
            .store(selection == Selection::Compatibility, Ordering::Release);
    }

    pub fn quality(&self) -> Quality {
        *lock(&self.quality)
    }

    pub fn streaming(&self) -> bool {
        self.watching.load(Ordering::Acquire) > 0 && !self.broken()
    }

    pub fn broken(&self) -> bool {
        self.broken.load(Ordering::Acquire)
    }

    pub fn join(
        &self,
        id: String,
        frames: mpsc::Sender<Arc<EncodedFrame>>,
        estimate: Arc<std::sync::atomic::AtomicU32>,
    ) {
        let mut viewers = lock(&self.viewers);
        viewers.insert(id, Viewer::new(frames, estimate));
        self.watching.store(viewers.len(), Ordering::Release);
        super::trace(format_args!("native viewers: {}", viewers.len()));
        drop(viewers);
        self.lanes[MAIN_LANE].request_keyframe();
    }

    pub fn leave(&self, id: &str) {
        let mut viewers = lock(&self.viewers);
        viewers.remove(id);
        self.watching.store(viewers.len(), Ordering::Release);
        super::trace(format_args!("native viewers: {}", viewers.len()));
    }

    pub fn request_keyframe(&self, id: &str) {
        let lane = lock(&self.viewers).get(id).map(|viewer| viewer.lane);
        if let Some(lane) = lane {
            self.lanes[lane].request_keyframe();
        }
    }

    pub fn shutdown(&self) {
        lock(&self.viewers).clear();
        self.watching.store(0, Ordering::Release);
        for lane in &self.lanes {
            lane.stop();
        }
    }

    pub fn fail(&self, reason: String) {
        if !self.broken.swap(true, Ordering::AcqRel) {
            (self.on_broken)(reason);
        }
    }

    pub fn encode(
        self: &Arc<Self>,
        device: &ID3D11Device,
        source: (u32, u32),
        timestamp_us: u64,
        mut render: impl FnMut(&ID3D11Texture2D, (u32, u32)) -> bool,
    ) {
        let quality = self.quality();
        let backend = lock(&self.selection).backend();
        for (index, lane) in self.lanes.iter().enumerate() {
            if self.broken() {
                return;
            }
            let needed = index == MAIN_LANE
                || lock(&self.viewers)
                    .values()
                    .any(|viewer| viewer.lane == index);
            if !needed {
                lane.stop();
                continue;
            }
            let result = lane.encode(
                device,
                source,
                timestamp_us,
                quality,
                backend,
                |config| self.start_encoder(device, index, config),
                &mut render,
            );
            if let Err(error) = result {
                self.fail(error);
            }
        }
    }

    fn start_encoder(
        self: &Arc<Self>,
        device: &ID3D11Device,
        lane: usize,
        config: Config,
    ) -> Result<Encoder, String> {
        let publisher: Weak<Self> = Arc::downgrade(self);
        let encoder = Encoder::start(device, config, move |output| {
            if let Some(publisher) = publisher.upgrade() {
                match output {
                    Output::Frame(frame) => publisher.distribute(lane, frame),
                    Output::Failed(error) => publisher.fail(error),
                }
            }
        })?;
        super::trace(format_args!(
            "encoder {} started at {}x{}, {} fps, lane {lane}",
            encoder.name, config.width, config.height, config.fps
        ));
        Ok(encoder)
    }

    fn distribute(&self, index: usize, frame: EncodedFrame) {
        let frame = Arc::new(frame);
        let quality = self.quality();
        let mut congested = false;
        let slowest = {
            let mut viewers = lock(&self.viewers);
            for viewer in viewers.values_mut().filter(|viewer| viewer.lane == index) {
                if viewer.syncing && !frame.keyframe {
                    continue;
                }
                let sent = viewer.frames.try_send(frame.clone());
                viewer.syncing = matches!(sent, Err(mpsc::error::TrySendError::Full(_)));
                congested |= viewer.syncing;
            }
            pace_setter(&viewers, index, quality)
        };

        let lane = &self.lanes[index];
        if let Some(estimate) = slowest {
            lane.tune(estimate, quality);
            if lane.ignores_limit(frame.data.len(), quality) {
                self.fail("the encoder ignores the bitrate limit".to_owned());
            }
        }
        if congested {
            lane.request_keyframe();
        }
        lane.flush_keyframe();
        if index == MAIN_LANE {
            self.balance(quality);
        }
    }

    fn balance(&self, quality: Quality) {
        {
            let mut rebalanced = lock(&self.rebalanced);
            if rebalanced.elapsed() < REBALANCE_GAP {
                return;
            }
            *rebalanced = Instant::now();
        }
        let slow = &self.lanes[SLOW_LANE];
        let slow_bitrate = slow.bitrate();
        let source_height = self.lanes[MAIN_LANE].source_height();
        let starting = slow.is_idle();
        let gained = {
            let mut viewers = lock(&self.viewers);
            let gained = rebalance(&mut viewers, quality, slow_bitrate);
            let slowest = pace_setter(&viewers, SLOW_LANE, quality);
            if let Some(estimate) = slowest.filter(|_| gained[SLOW_LANE] && starting) {
                slow.seed(quality.bitrate_for(estimate), source_height, quality.fps);
            }
            gained
        };
        for (lane, gained) in self.lanes.iter().zip(gained) {
            if gained {
                lane.request_keyframe();
            }
        }
    }
}
