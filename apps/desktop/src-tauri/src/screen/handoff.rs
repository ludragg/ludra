use windows::Win32::Foundation::{E_FAIL, HANDLE, HMODULE};
use windows::Win32::Graphics::Direct3D::{
    D3D_DRIVER_TYPE_HARDWARE, D3D_FEATURE_LEVEL_11_0, D3D_FEATURE_LEVEL_11_1,
};
use windows::Win32::Graphics::Direct3D11::{
    D3D11_BIND_RENDER_TARGET, D3D11_BIND_SHADER_RESOURCE, D3D11_CREATE_DEVICE_BGRA_SUPPORT,
    D3D11_CREATE_DEVICE_VIDEO_SUPPORT, D3D11_RESOURCE_MISC_SHARED_KEYEDMUTEX, D3D11_SDK_VERSION,
    D3D11_TEXTURE2D_DESC, D3D11_USAGE_DEFAULT, D3D11CreateDevice, ID3D11Device,
    ID3D11DeviceContext, ID3D11Multithread, ID3D11Texture2D,
};
use windows::Win32::Graphics::Dxgi::Common::DXGI_SAMPLE_DESC;
use windows::Win32::Graphics::Dxgi::{IDXGIKeyedMutex, IDXGIResource};
use windows::core::{Error, Interface, Result};

const CAPTURED: u64 = 0;
const COPIED: u64 = 1;
const WAIT_MS: u32 = 500;

struct Link {
    owner: usize,
    size: (u32, u32),
    source: ID3D11Texture2D,
    source_lock: IDXGIKeyedMutex,
    target: ID3D11Texture2D,
    target_lock: IDXGIKeyedMutex,
}

pub struct Handoff {
    device: ID3D11Device,
    context: ID3D11DeviceContext,
    link: Option<Link>,
}

pub struct Carried<'a> {
    pub device: &'a ID3D11Device,
    pub context: &'a ID3D11DeviceContext,
    pub texture: &'a ID3D11Texture2D,
    lock: &'a IDXGIKeyedMutex,
}

impl Drop for Carried<'_> {
    fn drop(&mut self) {
        let _ = unsafe { self.lock.ReleaseSync(CAPTURED) };
    }
}

unsafe impl Send for Handoff {}

fn acquire(lock: &IDXGIKeyedMutex, key: u64) -> Result<()> {
    let result =
        unsafe { (Interface::vtable(lock).AcquireSync)(Interface::as_raw(lock), key, WAIT_MS) };
    result.ok()?;
    if result.0 != 0 {
        return Err(Error::from_hresult(E_FAIL));
    }
    Ok(())
}

impl Handoff {
    pub fn new() -> Result<Self> {
        let mut device = None;
        let mut context = None;
        unsafe {
            D3D11CreateDevice(
                None,
                D3D_DRIVER_TYPE_HARDWARE,
                HMODULE::default(),
                D3D11_CREATE_DEVICE_BGRA_SUPPORT | D3D11_CREATE_DEVICE_VIDEO_SUPPORT,
                Some(&[D3D_FEATURE_LEVEL_11_1, D3D_FEATURE_LEVEL_11_0]),
                D3D11_SDK_VERSION,
                Some(&mut device),
                None,
                Some(&mut context),
            )?;
        }
        let device: ID3D11Device = device.ok_or_else(Error::empty)?;
        if let Ok(protection) = device.cast::<ID3D11Multithread>() {
            let _ = unsafe { protection.SetMultithreadProtected(true) };
        }
        Ok(Self {
            device,
            context: context.ok_or_else(Error::empty)?,
            link: None,
        })
    }

    pub fn carry(
        &mut self,
        device: &ID3D11Device,
        context: &ID3D11DeviceContext,
        frame: &ID3D11Texture2D,
    ) -> Result<Carried<'_>> {
        if unsafe { self.device.GetDeviceRemovedReason() }.is_err() {
            *self = Self::new()?;
        }
        let owner = device.as_raw() as usize;
        let mut layout = D3D11_TEXTURE2D_DESC::default();
        unsafe { frame.GetDesc(&mut layout) };
        let size = (layout.Width, layout.Height);
        if self
            .link
            .as_ref()
            .is_none_or(|link| link.owner != owner || link.size != size)
        {
            self.link = None;
            self.link = Some(self.connect(device, owner, &layout)?);
        }
        let link = self.link.as_ref().ok_or_else(Error::empty)?;
        let copied = (|| {
            acquire(&link.source_lock, CAPTURED)?;
            unsafe {
                context.CopyResource(&link.source, frame);
                link.source_lock.ReleaseSync(COPIED)?;
            }
            acquire(&link.target_lock, COPIED)
        })();
        if let Err(error) = copied {
            self.link = None;
            return Err(error);
        }
        let link = self.link.as_ref().ok_or_else(Error::empty)?;
        Ok(Carried {
            device: &self.device,
            context: &self.context,
            texture: &link.target,
            lock: &link.target_lock,
        })
    }

    fn connect(
        &self,
        device: &ID3D11Device,
        owner: usize,
        layout: &D3D11_TEXTURE2D_DESC,
    ) -> Result<Link> {
        let description = D3D11_TEXTURE2D_DESC {
            Width: layout.Width,
            Height: layout.Height,
            MipLevels: 1,
            ArraySize: 1,
            Format: layout.Format,
            SampleDesc: DXGI_SAMPLE_DESC {
                Count: 1,
                Quality: 0,
            },
            Usage: D3D11_USAGE_DEFAULT,
            BindFlags: (D3D11_BIND_SHADER_RESOURCE.0 | D3D11_BIND_RENDER_TARGET.0) as u32,
            CPUAccessFlags: 0,
            MiscFlags: D3D11_RESOURCE_MISC_SHARED_KEYEDMUTEX.0 as u32,
        };
        let mut source = None;
        unsafe { device.CreateTexture2D(&description, None, Some(&mut source))? };
        let source = source.ok_or_else(Error::empty)?;
        let handle: HANDLE = unsafe { source.cast::<IDXGIResource>()?.GetSharedHandle()? };
        let mut target: Option<ID3D11Texture2D> = None;
        unsafe { self.device.OpenSharedResource(handle, &mut target)? };
        let target = target.ok_or_else(Error::empty)?;
        Ok(Link {
            owner,
            size: (layout.Width, layout.Height),
            source_lock: source.cast()?,
            source,
            target_lock: target.cast()?,
            target,
        })
    }
}
