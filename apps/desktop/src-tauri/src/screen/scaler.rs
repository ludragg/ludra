use std::mem::ManuallyDrop;

use windows::Win32::Foundation::TRUE;
use windows::Win32::Graphics::Direct3D11::{
    D3D11_BIND_RENDER_TARGET, D3D11_CPU_ACCESS_READ, D3D11_MAP_FLAG_DO_NOT_WAIT, D3D11_MAP_READ,
    D3D11_MAPPED_SUBRESOURCE, D3D11_TEXTURE2D_DESC, D3D11_USAGE, D3D11_USAGE_DEFAULT,
    D3D11_USAGE_STAGING, D3D11_VIDEO_FRAME_FORMAT_PROGRESSIVE, D3D11_VIDEO_PROCESSOR_COLOR_SPACE,
    D3D11_VIDEO_PROCESSOR_CONTENT_DESC, D3D11_VIDEO_PROCESSOR_FORMAT_SUPPORT_OUTPUT,
    D3D11_VIDEO_PROCESSOR_INPUT_VIEW_DESC, D3D11_VIDEO_PROCESSOR_OUTPUT_VIEW_DESC,
    D3D11_VIDEO_PROCESSOR_STREAM, D3D11_VIDEO_USAGE_OPTIMAL_SPEED, D3D11_VPIV_DIMENSION_TEXTURE2D,
    D3D11_VPOV_DIMENSION_TEXTURE2D, ID3D11Device, ID3D11DeviceContext, ID3D11Texture2D,
    ID3D11VideoContext, ID3D11VideoDevice, ID3D11VideoProcessor, ID3D11VideoProcessorEnumerator,
    ID3D11VideoProcessorOutputView,
};
use windows::Win32::Graphics::Dxgi::Common::{DXGI_FORMAT_NV12, DXGI_RATIONAL, DXGI_SAMPLE_DESC};
use windows::core::Interface;

const FULL_RANGE_RGB: u32 = 0;
const LIMITED_RANGE_BT709: u32 = 1 << 2 | 1 << 4;

pub struct Scaler {
    video_device: ID3D11VideoDevice,
    video_context: ID3D11VideoContext,
    enumerator: ID3D11VideoProcessorEnumerator,
    processor: ID3D11VideoProcessor,
    input: (u32, u32),
    output: (u32, u32),
}

impl Scaler {
    pub fn new(
        device: &ID3D11Device,
        context: &ID3D11DeviceContext,
        input: (u32, u32),
        output: (u32, u32),
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
            InputWidth: input.0,
            InputHeight: input.1,
            OutputFrameRate: rate,
            OutputWidth: output.0,
            OutputHeight: output.1,
            Usage: D3D11_VIDEO_USAGE_OPTIMAL_SPEED,
        };
        let enumerator = unsafe { video_device.CreateVideoProcessorEnumerator(&content)? };
        let support = unsafe { enumerator.CheckVideoProcessorFormat(DXGI_FORMAT_NV12)? };
        if support & D3D11_VIDEO_PROCESSOR_FORMAT_SUPPORT_OUTPUT.0 as u32 == 0 {
            return Err(windows::core::Error::empty());
        }
        let processor = unsafe { video_device.CreateVideoProcessor(&enumerator, 0)? };
        let input_space = D3D11_VIDEO_PROCESSOR_COLOR_SPACE {
            _bitfield: FULL_RANGE_RGB,
        };
        let output_space = D3D11_VIDEO_PROCESSOR_COLOR_SPACE {
            _bitfield: LIMITED_RANGE_BT709,
        };
        unsafe {
            video_context.VideoProcessorSetStreamColorSpace(&processor, 0, &input_space);
            video_context.VideoProcessorSetOutputColorSpace(&processor, &output_space);
        }
        Ok(Self {
            video_device,
            video_context,
            enumerator,
            processor,
            input,
            output,
        })
    }

    pub fn matches(&self, input: (u32, u32), output: (u32, u32)) -> bool {
        self.input == input && self.output == output
    }

    pub fn view(
        &self,
        target: &ID3D11Texture2D,
    ) -> windows::core::Result<ID3D11VideoProcessorOutputView> {
        let description = D3D11_VIDEO_PROCESSOR_OUTPUT_VIEW_DESC {
            ViewDimension: D3D11_VPOV_DIMENSION_TEXTURE2D,
            ..Default::default()
        };
        let mut view = None;
        unsafe {
            self.video_device.CreateVideoProcessorOutputView(
                target,
                &self.enumerator,
                &description,
                Some(&mut view),
            )?
        };
        view.ok_or_else(windows::core::Error::empty)
    }

    pub fn blit(
        &self,
        source: &ID3D11Texture2D,
        view: &ID3D11VideoProcessorOutputView,
    ) -> windows::core::Result<()> {
        let description = D3D11_VIDEO_PROCESSOR_INPUT_VIEW_DESC {
            FourCC: 0,
            ViewDimension: D3D11_VPIV_DIMENSION_TEXTURE2D,
            ..Default::default()
        };
        let mut input_view = None;
        unsafe {
            self.video_device.CreateVideoProcessorInputView(
                source,
                &self.enumerator,
                &description,
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
                .VideoProcessorBlt(&self.processor, view, 0, &streams)
        };
        let [stream] = streams;
        drop(ManuallyDrop::into_inner(stream.pInputSurface));
        result
    }
}

pub struct Readback {
    pub scaler: Scaler,
    view: ID3D11VideoProcessorOutputView,
    target: ID3D11Texture2D,
    staging: ID3D11Texture2D,
}

impl Readback {
    pub fn new(
        device: &ID3D11Device,
        context: &ID3D11DeviceContext,
        input: (u32, u32),
        output: (u32, u32),
    ) -> windows::core::Result<Self> {
        let scaler = Scaler::new(device, context, input, output)?;
        let target = texture(
            device,
            output,
            D3D11_USAGE_DEFAULT,
            D3D11_BIND_RENDER_TARGET.0 as u32,
            0,
        )?;
        let staging = texture(
            device,
            output,
            D3D11_USAGE_STAGING,
            0,
            D3D11_CPU_ACCESS_READ.0 as u32,
        )?;
        let view = scaler.view(&target)?;
        Ok(Self {
            scaler,
            view,
            target,
            staging,
        })
    }

    pub fn stage(
        &self,
        context: &ID3D11DeviceContext,
        source: &ID3D11Texture2D,
    ) -> windows::core::Result<()> {
        self.scaler.blit(source, &self.view)?;
        unsafe {
            context.CopyResource(&self.staging, &self.target);
            context.Flush();
        }
        Ok(())
    }

    pub fn read(
        &self,
        context: &ID3D11DeviceContext,
        pixels: &mut [u8],
        wait: bool,
    ) -> windows::core::Result<()> {
        let (width, height) = self.scaler.output;
        let flags = if wait {
            0
        } else {
            D3D11_MAP_FLAG_DO_NOT_WAIT.0 as u32
        };
        unsafe {
            let mut mapped = D3D11_MAPPED_SUBRESOURCE::default();
            context.Map(&self.staging, 0, D3D11_MAP_READ, flags, Some(&mut mapped))?;
            let row = width as usize;
            let rows = height as usize * 3 / 2;
            let pitch = mapped.RowPitch as usize;
            if mapped.pData.is_null() || pitch < row || pixels.len() < row * rows {
                context.Unmap(&self.staging, 0);
                return Err(windows::core::Error::empty());
            }
            let source =
                std::slice::from_raw_parts(mapped.pData as *const u8, pitch * (rows - 1) + row);
            for y in 0..rows {
                pixels[y * row..(y + 1) * row].copy_from_slice(&source[y * pitch..y * pitch + row]);
            }
            context.Unmap(&self.staging, 0);
        }
        Ok(())
    }
}

fn texture(
    device: &ID3D11Device,
    (width, height): (u32, u32),
    usage: D3D11_USAGE,
    bind: u32,
    cpu: u32,
) -> windows::core::Result<ID3D11Texture2D> {
    let description = D3D11_TEXTURE2D_DESC {
        Width: width,
        Height: height,
        MipLevels: 1,
        ArraySize: 1,
        Format: DXGI_FORMAT_NV12,
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
    unsafe { device.CreateTexture2D(&description, None, Some(&mut result))? };
    result.ok_or_else(windows::core::Error::empty)
}
