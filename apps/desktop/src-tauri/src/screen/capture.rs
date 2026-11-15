use std::mem::ManuallyDrop;
use std::sync::Arc;
use std::time::{Duration, Instant};

use tauri::{AppHandle, Emitter};
use windows::Win32::Foundation::TRUE;
use windows::Win32::Graphics::Direct3D11::{
    D3D11_BIND_RENDER_TARGET, D3D11_CPU_ACCESS_READ, D3D11_MAP_READ, D3D11_MAPPED_SUBRESOURCE,
    D3D11_TEXTURE2D_DESC, D3D11_USAGE_DEFAULT, D3D11_USAGE_STAGING,
    D3D11_VIDEO_FRAME_FORMAT_PROGRESSIVE, D3D11_VIDEO_PROCESSOR_CONTENT_DESC,
    D3D11_VIDEO_PROCESSOR_INPUT_VIEW_DESC, D3D11_VIDEO_PROCESSOR_OUTPUT_VIEW_DESC,
    D3D11_VIDEO_PROCESSOR_STREAM, D3D11_VIDEO_USAGE_OPTIMAL_QUALITY,
    D3D11_VPIV_DIMENSION_TEXTURE2D, D3D11_VPOV_DIMENSION_TEXTURE2D, ID3D11Device,
    ID3D11DeviceContext, ID3D11Texture2D, ID3D11VideoContext, ID3D11VideoDevice,
    ID3D11VideoProcessor, ID3D11VideoProcessorEnumerator, ID3D11VideoProcessorOutputView,
};
use windows::Win32::Graphics::Dxgi::Common::{
    DXGI_FORMAT_B8G8R8A8_UNORM, DXGI_RATIONAL, DXGI_SAMPLE_DESC,
};
use windows::core::Interface;
use windows_capture::capture::{Context, GraphicsCaptureApiHandler};
use windows_capture::frame::Frame;
use windows_capture::graphics_capture_api::InternalCaptureControl;

use super::bridge::Bridge;

pub struct Flags {
    pub bridge: Arc<Bridge>,
    pub app: AppHandle,
    pub width: u32,
    pub height: u32,
    pub fps: u32,
}

pub struct Capture {
    bridge: Arc<Bridge>,
    app: AppHandle,
    device: ID3D11Device,
    context: ID3D11DeviceContext,
    max_width: u32,
    max_height: u32,
    interval: Duration,
    last: Option<Instant>,
    started: Instant,
    scaler: Option<Scaler>,
    software: bool,
}

impl Capture {
    fn scale_on_gpu(
        &mut self,
        frame: &Frame,
        width: u32,
        height: u32,
        timestamp: u64,
    ) -> windows::core::Result<()> {
        let (input_width, input_height) = (frame.width(), frame.height());
        let rebuild = self
            .scaler
            .as_ref()
            .is_none_or(|scaler| !scaler.matches(input_width, input_height, width, height));
        if rebuild {
            self.scaler = Some(Scaler::new(
                &self.device,
                &self.context,
                input_width,
                input_height,
                width,
                height,
            )?);
        }
        let scaler = self.scaler.as_ref().expect("scaler exists");
        scaler.process(frame.as_raw_texture())?;
        let context = &self.context;
        self.bridge.send(width, height, timestamp, |target| {
            scaler.read(context, target).is_ok()
        });
        Ok(())
    }
}

fn scale_on_cpu(
    source: &[u8],
    pitch: usize,
    input_width: u32,
    input_height: u32,
    target: &mut [u8],
    width: u32,
    height: u32,
) -> bool {
    let row = width as usize * 4;
    let needed = pitch * (input_height as usize - 1) + input_width as usize * 4;
    if source.len() < needed || target.len() < row * height as usize {
        return false;
    }
    for y in 0..height as usize {
        let source_y = (y * input_height as usize / height as usize).min(input_height as usize - 1);
        let source_row = &source[source_y * pitch..];
        let target_row = &mut target[y * row..(y + 1) * row];
        for x in 0..width as usize {
            let source_x =
                (x * input_width as usize / width as usize).min(input_width as usize - 1) * 4;
            target_row[x * 4..x * 4 + 4].copy_from_slice(&source_row[source_x..source_x + 4]);
        }
    }
    true
}

impl GraphicsCaptureApiHandler for Capture {
    type Flags = Flags;
    type Error = String;

    fn new(ctx: Context<Self::Flags>) -> Result<Self, Self::Error> {
        let flags = ctx.flags;
        Ok(Self {
            bridge: flags.bridge,
            app: flags.app,
            device: ctx.device,
            context: ctx.device_context,
            max_width: flags.width,
            max_height: flags.height,
            interval: Duration::from_secs_f64(1.0 / f64::from(flags.fps.max(1)) * 0.92),
            last: None,
            started: Instant::now(),
            scaler: None,
            software: false,
        })
    }

    fn on_frame_arrived(
        &mut self,
        frame: &mut Frame,
        _control: InternalCaptureControl,
    ) -> Result<(), Self::Error> {
        let now = Instant::now();
        if self
            .last
            .is_some_and(|last| now.duration_since(last) < self.interval)
        {
            return Ok(());
        }
        self.last = Some(now);

        let (input_width, input_height) = (frame.width(), frame.height());
        if input_width == 0 || input_height == 0 {
            return Ok(());
        }
        let (width, height) = fit(input_width, input_height, self.max_width, self.max_height);
        if (width * height * 4) as usize > self.bridge.size() {
            return Ok(());
        }

        let timestamp = now.duration_since(self.started).as_micros() as u64;
        if !self.software && self.scale_on_gpu(frame, width, height, timestamp).is_err() {
            self.software = true;
            self.scaler = None;
        }
        if self.software {
            let Ok(mut buffer) = frame.buffer() else {
                return Ok(());
            };
            let pitch = buffer.row_pitch() as usize;
            let source = buffer.as_raw_buffer();
            self.bridge.send(width, height, timestamp, |target| {
                scale_on_cpu(
                    source,
                    pitch,
                    input_width,
                    input_height,
                    target,
                    width,
                    height,
                )
            });
        }
        Ok(())
    }

    fn on_closed(&mut self) -> Result<(), Self::Error> {
        let _ = self.app.emit("screen-ended", ());
        Ok(())
    }
}

pub fn fit(width: u32, height: u32, max_width: u32, max_height: u32) -> (u32, u32) {
    let scale = (max_width as f64 / width as f64)
        .min(max_height as f64 / height as f64)
        .min(1.0);
    let even = |value: f64| ((value.round() as u32) & !1).max(2);
    (even(width as f64 * scale), even(height as f64 * scale))
}

struct Scaler {
    video_device: ID3D11VideoDevice,
    video_context: ID3D11VideoContext,
    enumerator: ID3D11VideoProcessorEnumerator,
    processor: ID3D11VideoProcessor,
    output_view: ID3D11VideoProcessorOutputView,
    output: ID3D11Texture2D,
    staging: ID3D11Texture2D,
    input_width: u32,
    input_height: u32,
    width: u32,
    height: u32,
}

impl Scaler {
    fn new(
        device: &ID3D11Device,
        context: &ID3D11DeviceContext,
        input_width: u32,
        input_height: u32,
        width: u32,
        height: u32,
    ) -> windows::core::Result<Self> {
        let video_device: ID3D11VideoDevice = device.cast()?;
        let video_context: ID3D11VideoContext = context.cast()?;
        let rate = DXGI_RATIONAL {
            Numerator: 60,
            Denominator: 1,
        };
        let content = D3D11_VIDEO_PROCESSOR_CONTENT_DESC {
            InputFrameFormat: D3D11_VIDEO_FRAME_FORMAT_PROGRESSIVE,
            InputFrameRate: rate,
            InputWidth: input_width,
            InputHeight: input_height,
            OutputFrameRate: rate,
            OutputWidth: width,
            OutputHeight: height,
            Usage: D3D11_VIDEO_USAGE_OPTIMAL_QUALITY,
        };
        let enumerator = unsafe { video_device.CreateVideoProcessorEnumerator(&content)? };
        let processor = unsafe { video_device.CreateVideoProcessor(&enumerator, 0)? };

        let output = texture(
            device,
            width,
            height,
            D3D11_USAGE_DEFAULT,
            D3D11_BIND_RENDER_TARGET.0 as u32,
            0,
        )?;
        let staging = texture(
            device,
            width,
            height,
            D3D11_USAGE_STAGING,
            0,
            D3D11_CPU_ACCESS_READ.0 as u32,
        )?;

        let output_desc = D3D11_VIDEO_PROCESSOR_OUTPUT_VIEW_DESC {
            ViewDimension: D3D11_VPOV_DIMENSION_TEXTURE2D,
            ..Default::default()
        };
        let mut output_view = None;
        unsafe {
            video_device.CreateVideoProcessorOutputView(
                &output,
                &enumerator,
                &output_desc,
                Some(&mut output_view),
            )?
        };

        Ok(Self {
            video_device,
            video_context,
            enumerator,
            processor,
            output_view: output_view.expect("output view"),
            output,
            staging,
            input_width,
            input_height,
            width,
            height,
        })
    }

    fn matches(&self, input_width: u32, input_height: u32, width: u32, height: u32) -> bool {
        self.input_width == input_width
            && self.input_height == input_height
            && self.width == width
            && self.height == height
    }

    fn process(&self, input: &ID3D11Texture2D) -> windows::core::Result<()> {
        let input_desc = D3D11_VIDEO_PROCESSOR_INPUT_VIEW_DESC {
            FourCC: 0,
            ViewDimension: D3D11_VPIV_DIMENSION_TEXTURE2D,
            ..Default::default()
        };
        let mut input_view = None;
        unsafe {
            self.video_device.CreateVideoProcessorInputView(
                input,
                &self.enumerator,
                &input_desc,
                Some(&mut input_view),
            )?;
        }
        let stream = D3D11_VIDEO_PROCESSOR_STREAM {
            Enable: TRUE,
            pInputSurface: ManuallyDrop::new(input_view),
            ..Default::default()
        };
        let streams = [stream];
        let result = unsafe {
            self.video_context
                .VideoProcessorBlt(&self.processor, &self.output_view, 0, &streams)
        };
        let [stream] = streams;
        drop(ManuallyDrop::into_inner(stream.pInputSurface));
        result
    }

    fn read(&self, context: &ID3D11DeviceContext, target: &mut [u8]) -> windows::core::Result<()> {
        unsafe {
            context.CopyResource(&self.staging, &self.output);
            let mut mapped = D3D11_MAPPED_SUBRESOURCE::default();
            context.Map(&self.staging, 0, D3D11_MAP_READ, 0, Some(&mut mapped))?;
            let row = (self.width * 4) as usize;
            let pitch = mapped.RowPitch as usize;
            if mapped.pData.is_null() || pitch < row || target.len() < row * self.height as usize {
                context.Unmap(&self.staging, 0);
                return Err(windows::core::Error::empty());
            }
            let source = std::slice::from_raw_parts(
                mapped.pData as *const u8,
                pitch * (self.height as usize - 1) + row,
            );
            for y in 0..self.height as usize {
                target[y * row..(y + 1) * row].copy_from_slice(&source[y * pitch..y * pitch + row]);
            }
            context.Unmap(&self.staging, 0);
        }
        Ok(())
    }
}

fn texture(
    device: &ID3D11Device,
    width: u32,
    height: u32,
    usage: windows::Win32::Graphics::Direct3D11::D3D11_USAGE,
    bind: u32,
    cpu: u32,
) -> windows::core::Result<ID3D11Texture2D> {
    let desc = D3D11_TEXTURE2D_DESC {
        Width: width,
        Height: height,
        MipLevels: 1,
        ArraySize: 1,
        Format: DXGI_FORMAT_B8G8R8A8_UNORM,
        SampleDesc: DXGI_SAMPLE_DESC {
            Count: 1,
            Quality: 0,
        },
        Usage: usage,
        BindFlags: bind,
        CPUAccessFlags: cpu,
        MiscFlags: 0,
    };
    let mut result = None;
    unsafe { device.CreateTexture2D(&desc, None, Some(&mut result))? };
    Ok(result.expect("texture"))
}
