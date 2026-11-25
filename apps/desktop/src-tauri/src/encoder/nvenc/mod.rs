mod api;

use std::sync::mpsc::{Receiver, RecvTimeoutError};

use windows::Win32::Graphics::Direct3D11::ID3D11Device;

use api::Session;

use super::schedule::Schedule;
use super::{BUSY_TICK, Config, IDLE_TICK, Message, Output, nal};

pub const NAME: &str = "NVIDIA NVENC";

pub struct Nvenc {
    session: Session,
    header: Vec<u8>,
}

impl Nvenc {
    pub fn open(device: &ID3D11Device, config: Config) -> Result<Self, String> {
        Ok(Self {
            session: Session::open(device, config)?,
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
                Ok(Message::Bitrate(bitrate)) => self.session.set_bitrate(bitrate),
                Ok(Message::Keyframe) => schedule.keyframe(),
                Ok(Message::Event(_)) | Err(RecvTimeoutError::Timeout) => {}
                Ok(Message::Stop) | Err(RecvTimeoutError::Disconnected) => return Ok(()),
            }
            let Some(job) = schedule.next() else {
                continue;
            };
            let data = self.session.encode(&job)?;
            let timestamp_us = job.timestamp_us;
            if let Some(data) = data {
                output(Output::Frame(nal::complete(
                    data,
                    &mut self.header,
                    timestamp_us,
                )));
            }
        }
    }
}
