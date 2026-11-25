mod api;

use std::sync::mpsc::{Receiver, RecvTimeoutError};

use windows::Win32::Graphics::Direct3D11::ID3D11Device;
use windows::core::{Interface, PCWSTR, w};

use api::{Component, Context, Factory, Variant};

use super::schedule::{Job, Schedule};
use super::{BUSY_TICK, Config, EncodedFrame, IDLE_TICK, Message, Output, nal};

pub const NAME: &str = "AMD AMF";

const USAGE_ULTRA_LOW_LATENCY: i64 = 1;
const PROFILE_HIGH: i64 = 100;
const LEVEL_5_2: i64 = 52;
const PRESET_SPEED: i64 = 1;
const RATE_CONTROL_CBR: i64 = 1;
const PICTURE_IDR: i64 = 2;
const KEYFRAME_SECONDS: u32 = 4;
const VBV_FRACTION: u32 = 4;
const QUERY_TIMEOUT_MS: i64 = 40;

pub struct Amf {
    component: Component,
    context: Context,
    header: Vec<u8>,
}

impl Amf {
    pub fn open(device: &ID3D11Device, config: Config) -> Result<Self, String> {
        let factory = Factory::load()?;
        let context = factory.context(device.as_raw())?;
        let component = factory.component(&context, w!("AMFVideoEncoderVCE_AVC"))?;
        let period = i64::from(config.fps * KEYFRAME_SECONDS);
        component.set(w!("Usage"), Variant::int(USAGE_ULTRA_LOW_LATENCY))?;
        component.set(w!("FrameSize"), Variant::size(config.width, config.height))?;
        component.set(w!("FrameRate"), Variant::rate(config.fps, 1))?;
        component.set(w!("RateControlMethod"), Variant::int(RATE_CONTROL_CBR))?;
        let optional: [(PCWSTR, Variant); 9] = [
            (w!("Profile"), Variant::int(PROFILE_HIGH)),
            (w!("ProfileLevel"), Variant::int(LEVEL_5_2)),
            (w!("QualityPreset"), Variant::int(PRESET_SPEED)),
            (w!("EnforceHRD"), Variant::bool(true)),
            (w!("BPicturesPattern"), Variant::int(0)),
            (w!("IDRPeriod"), Variant::int(period)),
            (w!("HeaderInsertionSpacing"), Variant::int(period)),
            (w!("LowLatencyInternal"), Variant::bool(true)),
            (w!("QueryTimeout"), Variant::int(QUERY_TIMEOUT_MS)),
        ];
        for (name, value) in optional {
            let _ = component.set(name, value);
        }
        apply_bitrate(&component, config.bitrate)?;
        component.init(config.width, config.height)?;
        Ok(Self {
            component,
            context,
            header: Vec::new(),
        })
    }

    pub fn run(
        mut self,
        inbox: Receiver<Message>,
        output: &mut impl FnMut(Output),
    ) -> Result<(), String> {
        let mut schedule = Schedule::default();
        loop {
            let wait = if schedule.busy() {
                BUSY_TICK
            } else {
                IDLE_TICK
            };
            match inbox.recv_timeout(wait) {
                Ok(Message::Frame(slot, timestamp_us)) => schedule.frame(slot, timestamp_us),
                Ok(Message::Bitrate(bitrate)) => {
                    let _ = apply_bitrate(&self.component, bitrate);
                }
                Ok(Message::Keyframe) => schedule.keyframe(),
                Ok(Message::Event(_)) | Err(RecvTimeoutError::Timeout) => {}
                Ok(Message::Stop) | Err(RecvTimeoutError::Disconnected) => return Ok(()),
            }
            if let Some(job) = schedule.next() {
                if self.submit(&job)? {
                    schedule.submitted(job);
                } else {
                    schedule.retry(job);
                }
            }
            while schedule.in_flight() {
                let Some(data) = self.component.query()? else {
                    break;
                };
                if let Some(timestamp_us) = schedule.completed() {
                    output(Output::Frame(self.frame(data, timestamp_us)));
                }
            }
            if schedule.stalled() {
                return Err("encoder stalled".to_owned());
            }
        }
    }

    fn submit(&self, job: &Job) -> Result<bool, String> {
        let surface = self.context.surface(job.slot.texture().as_raw())?;
        if job.keyframe {
            surface.set(w!("ForcePictureType"), Variant::int(PICTURE_IDR))?;
            surface.set(w!("InsertSPS"), Variant::bool(true))?;
            surface.set(w!("InsertPPS"), Variant::bool(true))?;
        }
        self.component.submit(&surface, job.timestamp_us)
    }

    fn frame(&mut self, data: Vec<u8>, timestamp_us: u64) -> EncodedFrame {
        nal::complete(data, &mut self.header, timestamp_us)
    }
}

fn apply_bitrate(component: &Component, bitrate: u32) -> Result<(), String> {
    component.set(w!("TargetBitrate"), Variant::int(bitrate.into()))?;
    component.set(w!("PeakBitrate"), Variant::int(bitrate.into()))?;
    component.set(
        w!("VBVBufferSize"),
        Variant::int((bitrate / VBV_FRACTION).into()),
    )
}
