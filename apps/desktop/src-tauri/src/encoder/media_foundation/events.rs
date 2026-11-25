use std::sync::mpsc::Sender;

use windows::Win32::Media::MediaFoundation::{
    IMFAsyncCallback, IMFAsyncCallback_Impl, IMFAsyncResult, IMFMediaEventGenerator,
};
use windows::core::{IUnknownImpl, Ref, implement};

use super::super::Message;

#[implement(IMFAsyncCallback)]
pub struct EventPump {
    pub(super) generator: IMFMediaEventGenerator,
    pub(super) messages: Sender<Message>,
}

impl IMFAsyncCallback_Impl for EventPump_Impl {
    fn GetParameters(&self, _flags: *mut u32, _queue: *mut u32) -> windows::core::Result<()> {
        Err(windows::Win32::Foundation::E_NOTIMPL.into())
    }

    fn Invoke(&self, result: Ref<IMFAsyncResult>) -> windows::core::Result<()> {
        let event = unsafe { self.generator.EndGetEvent(result.ok()?)? };
        let kind = unsafe { event.GetType()? };
        if self.messages.send(Message::Event(kind)).is_ok() {
            let next: IMFAsyncCallback = self.to_interface();
            unsafe { self.generator.BeginGetEvent(&next, None)? };
        }
        Ok(())
    }
}
