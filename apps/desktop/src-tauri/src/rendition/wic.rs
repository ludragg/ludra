use std::fs::File;
use std::io::Read;
use std::path::Path;

use image::metadata::Orientation;
use image::{DynamicImage, RgbaImage};
use windows::Win32::Foundation::GENERIC_READ;
use windows::Win32::Graphics::Imaging::{
    CLSID_WICBmpDecoder, CLSID_WICImagingFactory, CLSID_WICJpegDecoder, CLSID_WICPngDecoder,
    GUID_WICPixelFormat1bppIndexed, GUID_WICPixelFormat2bppIndexed, GUID_WICPixelFormat4bppIndexed,
    GUID_WICPixelFormat8bppIndexed, GUID_WICPixelFormat32bppRGBA, IWICBitmapDecoder,
    IWICBitmapFrameDecode, IWICBitmapSource, IWICImagingFactory, WICBitmapDitherTypeNone,
    WICBitmapInterpolationModeFant, WICBitmapPaletteTypeCustom, WICDecodeMetadataCacheOnDemand,
};
use windows::Win32::System::Com::StructuredStorage::{PROPVARIANT, PropVariantClear};
use windows::Win32::System::Com::{
    CLSCTX_INPROC_SERVER, COINIT_MULTITHREADED, CoCreateInstance, CoInitializeEx, CoUninitialize,
};
use windows::Win32::System::Variant::VT_UI2;
use windows::core::{GUID, HSTRING, Interface, w};

const MAX_SIDE: u32 = 65_535;
const MAX_PIXELS: u64 = 300_000_000;

struct Apartment(bool);

impl Apartment {
    fn enter() -> Self {
        Self(unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) }.is_ok())
    }
}

impl Drop for Apartment {
    fn drop(&mut self) {
        if self.0 {
            unsafe { CoUninitialize() };
        }
    }
}

fn built_in_decoder(path: &Path) -> Option<GUID> {
    let mut header = Vec::with_capacity(8);
    File::open(path)
        .ok()?
        .take(8)
        .read_to_end(&mut header)
        .ok()?;
    match header.as_slice() {
        [0xFF, 0xD8, 0xFF, ..] => Some(CLSID_WICJpegDecoder),
        [0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A] => Some(CLSID_WICPngDecoder),
        [b'B', b'M', ..] => Some(CLSID_WICBmpDecoder),
        _ => None,
    }
}

pub fn reduce(
    path: &Path,
    scale_for: impl Fn(u32, u32) -> Option<f64>,
) -> windows::core::Result<Option<DynamicImage>> {
    let Some(class) = built_in_decoder(path) else {
        return Ok(None);
    };
    let _apartment = Apartment::enter();
    unsafe {
        let factory: IWICImagingFactory =
            CoCreateInstance(&CLSID_WICImagingFactory, None, CLSCTX_INPROC_SERVER)?;
        let stream = factory.CreateStream()?;
        stream.InitializeFromFilename(&HSTRING::from(path), GENERIC_READ.0)?;
        let decoder: IWICBitmapDecoder = CoCreateInstance(&class, None, CLSCTX_INPROC_SERVER)?;
        decoder.Initialize(&stream, WICDecodeMetadataCacheOnDemand)?;
        if decoder.GetFrameCount()? > 1 {
            return Ok(None);
        }
        let frame = decoder.GetFrame(0)?;
        let (mut width, mut height) = (0, 0);
        frame.GetSize(&mut width, &mut height)?;
        let oversized =
            width.max(height) > MAX_SIDE || u64::from(width) * u64::from(height) > MAX_PIXELS;
        if oversized {
            return Ok(None);
        }
        let Some(scale) = scale_for(width, height) else {
            return Ok(None);
        };
        let target = |side: u32| ((f64::from(side) * scale).round() as u32).max(1);
        let (width, height) = (target(width), target(height));

        let source: IWICBitmapSource = if indexed(&frame)? {
            convert(&factory, &frame.cast()?)?
        } else {
            frame.cast()?
        };
        let scaler = factory.CreateBitmapScaler()?;
        scaler.Initialize(&source, width, height, WICBitmapInterpolationModeFant)?;
        let pixels = convert(&factory, &scaler.cast()?)?;
        let stride = width * 4;
        let mut buffer = vec![0; stride as usize * height as usize];
        pixels.CopyPixels(std::ptr::null(), stride, &mut buffer)?;

        let Some(buffer) = RgbaImage::from_raw(width, height, buffer) else {
            return Ok(None);
        };
        let mut reduced = DynamicImage::ImageRgba8(buffer);
        reduced.apply_orientation(orientation(&frame));
        Ok(Some(reduced))
    }
}

unsafe fn indexed(frame: &IWICBitmapFrameDecode) -> windows::core::Result<bool> {
    let format = unsafe { frame.GetPixelFormat()? };
    Ok([
        GUID_WICPixelFormat1bppIndexed,
        GUID_WICPixelFormat2bppIndexed,
        GUID_WICPixelFormat4bppIndexed,
        GUID_WICPixelFormat8bppIndexed,
    ]
    .contains(&format))
}

unsafe fn convert(
    factory: &IWICImagingFactory,
    source: &IWICBitmapSource,
) -> windows::core::Result<IWICBitmapSource> {
    unsafe {
        let converter = factory.CreateFormatConverter()?;
        converter.Initialize(
            source,
            &GUID_WICPixelFormat32bppRGBA,
            WICBitmapDitherTypeNone,
            None,
            0.0,
            WICBitmapPaletteTypeCustom,
        )?;
        converter.cast()
    }
}

unsafe fn orientation(frame: &IWICBitmapFrameDecode) -> Orientation {
    let mut value = PROPVARIANT::default();
    let read = unsafe {
        frame
            .GetMetadataQueryReader()
            .and_then(|reader| reader.GetMetadataByName(w!("/app1/ifd/{ushort=274}"), &mut value))
    };
    let found = read.ok().and_then(|()| unsafe {
        let inner = &value.Anonymous.Anonymous;
        (inner.vt == VT_UI2)
            .then(|| Orientation::from_exif(inner.Anonymous.uiVal as u8))
            .flatten()
    });
    let _ = unsafe { PropVariantClear(&mut value) };
    found.unwrap_or(Orientation::NoTransforms)
}
