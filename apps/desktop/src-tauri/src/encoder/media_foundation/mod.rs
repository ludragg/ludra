mod events;
mod transform;

use std::sync::mpsc::{Receiver, RecvTimeoutError, Sender};

use windows::Win32::Graphics::Direct3D11::ID3D11Device;
use windows::Win32::Media::MediaFoundation::{
    IMFAsyncCallback, METransformHaveOutput, METransformNeedInput, MF_VERSION, MFSTARTUP_LITE,
    MFShutdown, MFStartup,
};

use transform::Transform;

use super::schedule::Schedule;
use super::{Config, IDLE_TICK, Message, Output, Ready};

pub fn run(
    device: &ID3D11Device,
    config: Config,
    messages: Sender<Message>,
    inbox: Receiver<Message>,
    ready: &Ready,
    output: &mut impl FnMut(Output),
) {
    if let Err(error) = unsafe { MFStartup(MF_VERSION, MFSTARTUP_LITE) } {
        let _ = ready.send(Err(error.to_string()));
        return;
    }
    match Transform::open(device, config) {
        Ok(transform) => {
            if let Err(error) = pump(transform, messages, inbox, ready, output) {
                let _ = ready.send(Err(error.to_string()));
                output(Output::Failed(error.to_string()));
            }
        }
        Err(error) => {
            let _ = ready.send(Err(error));
        }
    }
    let _ = unsafe { MFShutdown() };
}

fn pump(
    mut transform: Transform,
    messages: Sender<Message>,
    inbox: Receiver<Message>,
    ready: &Ready,
    output: &mut impl FnMut(Output),
) -> windows::core::Result<()> {
    let generator = transform.events()?;
    let callback: IMFAsyncCallback = events::EventPump {
        generator: generator.clone(),
        messages,
    }
    .into();
    unsafe { generator.BeginGetEvent(&callback, None)? };
    let _ = ready.send(Ok(transform.name.clone()));

    let mut schedule = Schedule::default();
    let mut wanted = 0u32;
    loop {
        match inbox.recv_timeout(IDLE_TICK) {
            Ok(Message::Frame(slot, timestamp_us)) => schedule.frame(slot, timestamp_us),
            Ok(Message::Bitrate(bitrate)) => transform.set_bitrate(bitrate),
            Ok(Message::Keyframe) => schedule.keyframe(),
            Ok(Message::Event(kind)) if kind == METransformNeedInput.0 as u32 => wanted += 1,
            Ok(Message::Event(kind)) if kind == METransformHaveOutput.0 as u32 => {
                if let Some(mut frame) = transform.drain()? {
                    if let Some(timestamp_us) = schedule.completed() {
                        frame.timestamp_us = timestamp_us;
                    }
                    output(Output::Frame(frame));
                }
            }
            Ok(Message::Event(_)) | Err(RecvTimeoutError::Timeout) => {}
            Ok(Message::Stop) | Err(RecvTimeoutError::Disconnected) => return Ok(()),
        }
        if wanted > 0
            && let Some(job) = schedule.next()
        {
            if job.keyframe {
                transform.force_keyframe();
            }
            transform.feed(job.slot.texture(), job.timestamp_us)?;
            schedule.submitted(job);
            wanted -= 1;
        }
        if schedule.stalled() {
            return Err(windows::core::Error::new(
                windows::Win32::Foundation::E_FAIL,
                "encoder stalled",
            ));
        }
    }
}
