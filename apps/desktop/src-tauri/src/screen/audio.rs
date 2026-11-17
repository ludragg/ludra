use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc;
use std::thread::JoinHandle;
use std::time::Duration;

use tauri::ipc::{Channel, InvokeResponseBody};
use windows::Win32::Foundation::{CloseHandle, WAIT_OBJECT_0};
use windows::Win32::Media::Audio::{
    AUDCLNT_BUFFERFLAGS_SILENT, AUDCLNT_SHAREMODE_SHARED, AUDCLNT_STREAMFLAGS_AUTOCONVERTPCM,
    AUDCLNT_STREAMFLAGS_EVENTCALLBACK, AUDCLNT_STREAMFLAGS_LOOPBACK, AUDIOCLIENT_ACTIVATION_PARAMS,
    AUDIOCLIENT_ACTIVATION_PARAMS_0, AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK,
    AUDIOCLIENT_PROCESS_LOOPBACK_PARAMS, ActivateAudioInterfaceAsync,
    IActivateAudioInterfaceAsyncOperation, IActivateAudioInterfaceCompletionHandler,
    IActivateAudioInterfaceCompletionHandler_Impl, IAudioCaptureClient, IAudioClient,
    PROCESS_LOOPBACK_MODE_EXCLUDE_TARGET_PROCESS_TREE, VIRTUAL_AUDIO_DEVICE_PROCESS_LOOPBACK,
    WAVEFORMATEX,
};
use windows::Win32::System::Com::StructuredStorage::{
    PROPVARIANT, PROPVARIANT_0, PROPVARIANT_0_0, PROPVARIANT_0_0_0,
};
use windows::Win32::System::Com::{BLOB, COINIT_MULTITHREADED, CoInitializeEx, CoUninitialize};
use windows::Win32::System::Com::{IAgileObject, IAgileObject_Impl};
use windows::Win32::System::Threading::{CreateEventW, WaitForSingleObject};
use windows::Win32::System::Variant::VT_BLOB;
use windows::core::{HRESULT, IUnknown, Interface, Ref, implement};

const SAMPLE_RATE: u32 = 48_000;
const CHANNELS: u16 = 2;
const WAVE_FORMAT_IEEE_FLOAT: u16 = 3;
const CHUNK_FRAMES: usize = 480;

#[implement(IActivateAudioInterfaceCompletionHandler, IAgileObject)]
struct Completion(mpsc::Sender<()>);

impl IAgileObject_Impl for Completion_Impl {}

impl IActivateAudioInterfaceCompletionHandler_Impl for Completion_Impl {
    fn ActivateCompleted(
        &self,
        _operation: Ref<IActivateAudioInterfaceAsyncOperation>,
    ) -> windows::core::Result<()> {
        let _ = self.0.send(());
        Ok(())
    }
}

pub struct SystemAudio {
    running: Arc<AtomicBool>,
    thread: Option<JoinHandle<()>>,
}

impl SystemAudio {
    pub fn start(channel: Channel<InvokeResponseBody>, excluded: u32) -> Result<Self, String> {
        let running = Arc::new(AtomicBool::new(true));
        let (ready_sender, ready_receiver) = mpsc::channel();
        let flag = running.clone();
        let thread = std::thread::spawn(move || {
            let initialized = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) }.is_ok();
            match open(excluded) {
                Ok((client, capture)) => {
                    let _ = ready_sender.send(Ok(()));
                    pump(&client, &capture, &flag, &channel);
                    unsafe {
                        let _ = client.Stop();
                    }
                }
                Err(error) => {
                    let _ = ready_sender.send(Err(error.to_string()));
                }
            }
            if initialized {
                unsafe { CoUninitialize() };
            }
        });
        ready_receiver.recv().map_err(|error| error.to_string())??;
        Ok(Self {
            running,
            thread: Some(thread),
        })
    }
}

impl Drop for SystemAudio {
    fn drop(&mut self) {
        self.running.store(false, Ordering::Release);
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
    }
}

fn open(excluded: u32) -> windows::core::Result<(IAudioClient, IAudioCaptureClient)> {
    let mut params = AUDIOCLIENT_ACTIVATION_PARAMS {
        ActivationType: AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK,
        Anonymous: AUDIOCLIENT_ACTIVATION_PARAMS_0 {
            ProcessLoopbackParams: AUDIOCLIENT_PROCESS_LOOPBACK_PARAMS {
                TargetProcessId: excluded,
                ProcessLoopbackMode: PROCESS_LOOPBACK_MODE_EXCLUDE_TARGET_PROCESS_TREE,
            },
        },
    };
    let variant = std::mem::ManuallyDrop::new(PROPVARIANT {
        Anonymous: PROPVARIANT_0 {
            Anonymous: std::mem::ManuallyDrop::new(PROPVARIANT_0_0 {
                vt: VT_BLOB,
                wReserved1: 0,
                wReserved2: 0,
                wReserved3: 0,
                Anonymous: PROPVARIANT_0_0_0 {
                    blob: BLOB {
                        cbSize: size_of::<AUDIOCLIENT_ACTIVATION_PARAMS>() as u32,
                        pBlobData: (&raw mut params).cast(),
                    },
                },
            }),
        },
    });

    let (sender, receiver) = mpsc::channel();
    let handler: IActivateAudioInterfaceCompletionHandler = Completion(sender).into();
    let operation = unsafe {
        ActivateAudioInterfaceAsync(
            VIRTUAL_AUDIO_DEVICE_PROCESS_LOOPBACK,
            &IAudioClient::IID,
            Some(&*variant),
            &handler,
        )?
    };
    receiver
        .recv_timeout(Duration::from_secs(5))
        .map_err(|_| windows::core::Error::from(HRESULT(0x8000_000Au32 as i32)))?;

    let mut result = HRESULT(0);
    let mut unknown: Option<IUnknown> = None;
    unsafe { operation.GetActivateResult(&mut result, &mut unknown)? };
    result.ok()?;
    let client: IAudioClient = unknown.ok_or_else(windows::core::Error::empty)?.cast()?;

    let block = CHANNELS * 4;
    let format = WAVEFORMATEX {
        wFormatTag: WAVE_FORMAT_IEEE_FLOAT,
        nChannels: CHANNELS,
        nSamplesPerSec: SAMPLE_RATE,
        nAvgBytesPerSec: SAMPLE_RATE * u32::from(block),
        nBlockAlign: block,
        wBitsPerSample: 32,
        cbSize: 0,
    };
    unsafe {
        client.Initialize(
            AUDCLNT_SHAREMODE_SHARED,
            AUDCLNT_STREAMFLAGS_LOOPBACK
                | AUDCLNT_STREAMFLAGS_EVENTCALLBACK
                | AUDCLNT_STREAMFLAGS_AUTOCONVERTPCM,
            2_000_000,
            0,
            &format,
            None,
        )?;
    }
    let capture: IAudioCaptureClient = unsafe { client.GetService()? };
    Ok((client, capture))
}

fn pump(
    client: &IAudioClient,
    capture: &IAudioCaptureClient,
    running: &AtomicBool,
    channel: &Channel<InvokeResponseBody>,
) {
    let Ok(event) = (unsafe { CreateEventW(None, false, false, None) }) else {
        return;
    };
    if unsafe { client.SetEventHandle(event) }.is_err() || unsafe { client.Start() }.is_err() {
        let _ = unsafe { CloseHandle(event) };
        return;
    }

    let frame_bytes = usize::from(CHANNELS) * 4;
    let mut pending: Vec<u8> = Vec::with_capacity(CHUNK_FRAMES * frame_bytes * 4);
    while running.load(Ordering::Acquire) {
        if unsafe { WaitForSingleObject(event, 100) } != WAIT_OBJECT_0 {
            continue;
        }
        loop {
            let Ok(size) = (unsafe { capture.GetNextPacketSize() }) else {
                break;
            };
            if size == 0 {
                break;
            }
            let mut data = std::ptr::null_mut();
            let mut frames = 0u32;
            let mut flags = 0u32;
            if unsafe { capture.GetBuffer(&mut data, &mut frames, &mut flags, None, None) }.is_err()
            {
                break;
            }
            let length = frames as usize * frame_bytes;
            if flags & AUDCLNT_BUFFERFLAGS_SILENT.0 as u32 != 0 || data.is_null() {
                pending.resize(pending.len() + length, 0);
            } else {
                pending.extend_from_slice(unsafe { std::slice::from_raw_parts(data, length) });
            }
            let _ = unsafe { capture.ReleaseBuffer(frames) };
        }

        let chunk = CHUNK_FRAMES * frame_bytes;
        while pending.len() >= chunk {
            let rest = pending.split_off(chunk);
            let block = std::mem::replace(&mut pending, rest);
            if channel.send(InvokeResponseBody::Raw(block)).is_err() {
                running.store(false, Ordering::Release);
                break;
            }
        }
    }
    let _ = unsafe { CloseHandle(event) };
}
