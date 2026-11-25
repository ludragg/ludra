use windows::Win32::Graphics::Direct3D11::{ID3D11Device, ID3D11Texture2D};
use windows::Win32::Graphics::Dxgi::IDXGIDevice;
use windows::Win32::Media::MediaFoundation::*;
use windows::Win32::System::Com::CoTaskMemFree;
use windows::Win32::System::Variant::VARIANT;
use windows::core::{GUID, Interface, PWSTR};

use super::super::{Config, EncodedFrame, Mode, nal};

const HUNDRED_NANOS_PER_SECOND: u64 = 10_000_000;
const KEYFRAME_SECONDS: u32 = 4;

pub struct Transform {
    activate: IMFActivate,
    transform: IMFTransform,
    codec: ICodecAPI,
    _manager: IMFDXGIDeviceManager,
    input: u32,
    output: u32,
    provides_samples: bool,
    output_size: u32,
    header: Vec<u8>,
    frame_duration: i64,
    pub name: String,
}

impl Transform {
    pub fn open(device: &ID3D11Device, config: Config) -> Result<Self, String> {
        let candidates = candidates(device).map_err(|error| error.to_string())?;
        let mut failure = "no hardware H.264 encoder".to_owned();
        for activate in candidates {
            match Self::configure(activate.clone(), device, config) {
                Ok(transform) => return Ok(transform),
                Err(error) => {
                    failure = format!("{}: {error}", friendly_name(&activate));
                    let _ = unsafe { activate.ShutdownObject() };
                }
            }
        }
        Err(failure)
    }

    fn configure(
        activate: IMFActivate,
        device: &ID3D11Device,
        config: Config,
    ) -> windows::core::Result<Self> {
        let name = friendly_name(&activate);
        let transform: IMFTransform = unsafe { activate.ActivateObject()? };
        let attributes = unsafe { transform.GetAttributes()? };
        unsafe {
            attributes.SetUINT32(&MF_TRANSFORM_ASYNC_UNLOCK, 1)?;
            let _ = attributes.SetUINT32(&MF_LOW_LATENCY, 1);
        }

        let mut token = 0;
        let mut manager = None;
        unsafe { MFCreateDXGIDeviceManager(&mut token, &mut manager)? };
        let manager = manager.ok_or_else(windows::core::Error::empty)?;
        unsafe {
            manager.ResetDevice(device, token)?;
            transform.ProcessMessage(MFT_MESSAGE_SET_D3D_MANAGER, manager.as_raw() as usize)?;
        }

        let mut inputs = [0];
        let mut outputs = [0];
        let (input, output) = match unsafe { transform.GetStreamIDs(&mut inputs, &mut outputs) } {
            Ok(()) => (inputs[0], outputs[0]),
            Err(_) => (0, 0),
        };

        let codec: ICodecAPI = transform.cast()?;
        let set = |key: &GUID, value: VARIANT| unsafe { codec.SetValue(key, &value) };
        let mode = eAVEncCommonRateControlMode_CBR.0 as u32;
        set(&CODECAPI_AVEncCommonRateControlMode, VARIANT::from(mode))?;
        set(
            &CODECAPI_AVEncCommonMeanBitRate,
            VARIANT::from(config.bitrate),
        )?;
        let _ = set(&CODECAPI_AVLowLatencyMode, VARIANT::from(true));
        let _ = set(&CODECAPI_AVEncMPVDefaultBPictureCount, VARIANT::from(0u32));
        let _ = set(
            &CODECAPI_AVEncMPVGOPSize,
            VARIANT::from(config.fps * KEYFRAME_SECONDS),
        );
        let effort = match config.mode {
            Mode::Performance => 0u32,
            Mode::Balanced => 33,
            Mode::Quality | Mode::Extreme => 70,
        };
        let _ = set(&CODECAPI_AVEncCommonQualityVsSpeed, VARIANT::from(effort));
        let _ = set(&CODECAPI_AVEncH264CABACEnable, VARIANT::from(true));

        let target = video_type(&MFVideoFormat_H264, config)?;
        unsafe {
            target.SetUINT32(&MF_MT_AVG_BITRATE, config.bitrate)?;
            target.SetUINT32(&MF_MT_MPEG2_PROFILE, eAVEncH264VProfile_High.0 as u32)?;
            transform.SetOutputType(output, &target, 0)?;
        }
        let source = video_type(&MFVideoFormat_NV12, config)?;
        unsafe {
            transform.SetInputType(input, &source, 0)?;
            transform.ProcessMessage(MFT_MESSAGE_NOTIFY_BEGIN_STREAMING, 0)?;
            transform.ProcessMessage(MFT_MESSAGE_NOTIFY_START_OF_STREAM, 0)?;
        }
        let info = unsafe { transform.GetOutputStreamInfo(output)? };
        let provides =
            MFT_OUTPUT_STREAM_PROVIDES_SAMPLES.0 | MFT_OUTPUT_STREAM_CAN_PROVIDE_SAMPLES.0;

        let mut result = Self {
            activate,
            transform,
            codec,
            _manager: manager,
            input,
            output,
            provides_samples: info.dwFlags & provides as u32 != 0,
            output_size: info.cbSize,
            header: Vec::new(),
            frame_duration: (HUNDRED_NANOS_PER_SECOND / u64::from(config.fps.max(1))) as i64,
            name,
        };
        result.read_header();
        Ok(result)
    }

    pub fn events(&self) -> windows::core::Result<IMFMediaEventGenerator> {
        self.transform.cast()
    }

    pub fn set_bitrate(&self, bitrate: u32) {
        let value = VARIANT::from(bitrate);
        let _ = unsafe {
            self.codec
                .SetValue(&CODECAPI_AVEncCommonMeanBitRate, &value)
        };
    }

    pub fn force_keyframe(&self) {
        let value = VARIANT::from(1u32);
        let _ = unsafe {
            self.codec
                .SetValue(&CODECAPI_AVEncVideoForceKeyFrame, &value)
        };
    }

    pub fn feed(&self, texture: &ID3D11Texture2D, timestamp_us: u64) -> windows::core::Result<()> {
        unsafe {
            let buffer = MFCreateDXGISurfaceBuffer(&ID3D11Texture2D::IID, texture, 0, false)?;
            let length = buffer.cast::<IMF2DBuffer>()?.GetContiguousLength()?;
            buffer.SetCurrentLength(length)?;
            let sample = MFCreateSample()?;
            sample.AddBuffer(&buffer)?;
            sample.SetSampleTime((timestamp_us * 10) as i64)?;
            sample.SetSampleDuration(self.frame_duration)?;
            self.transform.ProcessInput(self.input, &sample, 0)
        }
    }

    pub fn drain(&mut self) -> windows::core::Result<Option<EncodedFrame>> {
        let provided = if self.provides_samples {
            None
        } else {
            let sample = unsafe { MFCreateSample()? };
            unsafe { sample.AddBuffer(&MFCreateMemoryBuffer(self.output_size)?)? };
            Some(sample)
        };
        let mut buffers = [MFT_OUTPUT_DATA_BUFFER {
            dwStreamID: self.output,
            pSample: std::mem::ManuallyDrop::new(provided),
            dwStatus: 0,
            pEvents: std::mem::ManuallyDrop::new(None),
        }];
        let mut status = 0;
        let result = unsafe { self.transform.ProcessOutput(0, &mut buffers, &mut status) };
        let [buffer] = buffers;
        drop(std::mem::ManuallyDrop::into_inner(buffer.pEvents));
        let sample = std::mem::ManuallyDrop::into_inner(buffer.pSample);
        if let Err(error) = result {
            if error.code() != MF_E_TRANSFORM_STREAM_CHANGE {
                return Err(error);
            }
            unsafe {
                let next = self.transform.GetOutputAvailableType(self.output, 0)?;
                self.transform.SetOutputType(self.output, &next, 0)?;
            }
            self.read_header();
            return Ok(None);
        }
        let Some(sample) = sample else {
            return Ok(None);
        };
        self.read_sample(&sample).map(Some)
    }

    fn read_sample(&mut self, sample: &IMFSample) -> windows::core::Result<EncodedFrame> {
        let buffer = unsafe { sample.ConvertToContiguousBuffer()? };
        let mut pointer = std::ptr::null_mut();
        let mut length = 0;
        unsafe { buffer.Lock(&mut pointer, None, Some(&mut length))? };
        let encoded = unsafe { std::slice::from_raw_parts(pointer, length as usize) };
        let data = encoded.to_vec();
        unsafe { buffer.Unlock()? };
        if self.header.is_empty() {
            self.read_header();
        }
        Ok(nal::complete(data, &mut self.header, 0))
    }

    fn read_header(&mut self) {
        let Ok(current) = (unsafe { self.transform.GetOutputCurrentType(self.output) }) else {
            return;
        };
        let Ok(size) = (unsafe { current.GetBlobSize(&MF_MT_MPEG_SEQUENCE_HEADER) }) else {
            return;
        };
        let mut header = vec![0; size as usize];
        if unsafe { current.GetBlob(&MF_MT_MPEG_SEQUENCE_HEADER, &mut header, None) }.is_ok() {
            self.header = header;
        }
    }
}

impl Drop for Transform {
    fn drop(&mut self) {
        unsafe {
            let _ = self
                .transform
                .ProcessMessage(MFT_MESSAGE_NOTIFY_END_OF_STREAM, 0);
            let _ = self.transform.ProcessMessage(MFT_MESSAGE_COMMAND_FLUSH, 0);
            let _ = self.activate.ShutdownObject();
        }
    }
}

fn video_type(subtype: &GUID, config: Config) -> windows::core::Result<IMFMediaType> {
    let pair = |high: u32, low: u32| u64::from(high) << 32 | u64::from(low);
    unsafe {
        let media = MFCreateMediaType()?;
        media.SetGUID(&MF_MT_MAJOR_TYPE, &MFMediaType_Video)?;
        media.SetGUID(&MF_MT_SUBTYPE, subtype)?;
        media.SetUINT64(&MF_MT_FRAME_SIZE, pair(config.width, config.height))?;
        media.SetUINT64(&MF_MT_FRAME_RATE, pair(config.fps, 1))?;
        media.SetUINT64(&MF_MT_PIXEL_ASPECT_RATIO, pair(1, 1))?;
        media.SetUINT32(&MF_MT_INTERLACE_MODE, MFVideoInterlace_Progressive.0 as u32)?;
        media.SetUINT32(&MF_MT_VIDEO_NOMINAL_RANGE, MFNominalRange_16_235.0 as u32)?;
        media.SetUINT32(&MF_MT_YUV_MATRIX, MFVideoTransferMatrix_BT709.0 as u32)?;
        media.SetUINT32(&MF_MT_VIDEO_PRIMARIES, MFVideoPrimaries_BT709.0 as u32)?;
        media.SetUINT32(&MF_MT_TRANSFER_FUNCTION, MFVideoTransFunc_709.0 as u32)?;
        Ok(media)
    }
}

fn candidates(device: &ID3D11Device) -> windows::core::Result<Vec<IMFActivate>> {
    let adapter = unsafe { device.cast::<IDXGIDevice>()?.GetAdapter()?.GetDesc()? };
    let luid = adapter.AdapterLuid;
    let mut bytes = [0; 8];
    bytes[..4].copy_from_slice(&luid.LowPart.to_le_bytes());
    bytes[4..].copy_from_slice(&luid.HighPart.to_le_bytes());
    let mut filter = None;
    unsafe { MFCreateAttributes(&mut filter, 1)? };
    let filter = filter.ok_or_else(windows::core::Error::empty)?;
    unsafe { filter.SetBlob(&MFT_ENUM_ADAPTER_LUID, &bytes)? };

    let target = MFT_REGISTER_TYPE_INFO {
        guidMajorType: MFMediaType_Video,
        guidSubtype: MFVideoFormat_H264,
    };
    let mut pointer: *mut Option<IMFActivate> = std::ptr::null_mut();
    let mut count = 0;
    unsafe {
        MFTEnum2(
            MFT_CATEGORY_VIDEO_ENCODER,
            MFT_ENUM_FLAG_HARDWARE | MFT_ENUM_FLAG_SORTANDFILTER,
            None,
            Some(&target),
            &filter,
            &mut pointer,
            &mut count,
        )?;
    }
    if pointer.is_null() {
        return Ok(Vec::new());
    }
    let found = (0..count as usize)
        .filter_map(|index| unsafe { std::ptr::read(pointer.add(index)) })
        .collect();
    unsafe { CoTaskMemFree(Some(pointer.cast())) };
    Ok(found)
}

fn friendly_name(activate: &IMFActivate) -> String {
    let mut value = PWSTR::null();
    let mut length = 0;
    let found = unsafe {
        activate.GetAllocatedString(&MFT_FRIENDLY_NAME_Attribute, &mut value, &mut length)
    };
    if found.is_err() || value.is_null() {
        return "encoder".to_owned();
    }
    let name = unsafe { value.to_string() }.unwrap_or_default();
    unsafe { CoTaskMemFree(Some(value.as_ptr().cast())) };
    name
}
