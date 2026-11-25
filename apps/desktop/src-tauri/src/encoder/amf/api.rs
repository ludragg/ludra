use std::ffi::c_void;
use std::ptr::null_mut;

use windows::Win32::System::LibraryLoader::{
    GetProcAddress, LOAD_LIBRARY_SEARCH_SYSTEM32, LoadLibraryExW,
};
use windows::core::{GUID, PCWSTR, s, w};

const VERSION: u64 = 1 << 48 | 4 << 32 | 30 << 16;
const DIRECTX_11: i32 = 110;
const SURFACE_NV12: i32 = 1;
const OK: i32 = 0;
const REPEAT: i32 = 24;
const INPUT_FULL: i32 = 25;
const NEED_MORE_INPUT: i32 = 44;

const VARIANT_BOOL: u32 = 1;
const VARIANT_INT64: u32 = 2;
const VARIANT_SIZE: u32 = 5;
const VARIANT_RATE: u32 = 7;

const BUFFER_ID: GUID = GUID::from_values(
    0xb04b7248,
    0xb6f0,
    0x4321,
    [0xb6, 0x91, 0xba, 0xa4, 0x74, 0x0f, 0x9f, 0xcb],
);

const RELEASE: usize = 1;
const QUERY_INTERFACE: usize = 2;
const SET_PROPERTY: usize = 3;
const FACTORY_CREATE_CONTEXT: usize = 0;
const FACTORY_CREATE_COMPONENT: usize = 1;
const CONTEXT_TERMINATE: usize = 13;
const CONTEXT_INIT_DX11: usize = 18;
const CONTEXT_SURFACE_FROM_DX11: usize = 49;
const COMPONENT_INIT: usize = 17;
const COMPONENT_TERMINATE: usize = 19;
const COMPONENT_SUBMIT: usize = 22;
const COMPONENT_QUERY: usize = 23;
const DATA_SET_PTS: usize = 19;
const BUFFER_SIZE: usize = 24;
const BUFFER_NATIVE: usize = 25;

#[repr(C)]
#[derive(Clone, Copy)]
pub struct Variant {
    kind: u32,
    value: [u64; 2],
}

impl Variant {
    fn new(kind: u32, value: u64) -> Self {
        Self {
            kind,
            value: [value, 0],
        }
    }

    pub fn bool(value: bool) -> Self {
        Self::new(VARIANT_BOOL, value.into())
    }

    pub fn int(value: i64) -> Self {
        Self::new(VARIANT_INT64, value as u64)
    }

    pub fn size(width: u32, height: u32) -> Self {
        Self::new(VARIANT_SIZE, u64::from(width) | u64::from(height) << 32)
    }

    pub fn rate(numerator: u32, denominator: u32) -> Self {
        Self::new(
            VARIANT_RATE,
            u64::from(numerator) | u64::from(denominator) << 32,
        )
    }
}

unsafe fn method<F: Copy>(object: *mut c_void, index: usize) -> F {
    unsafe {
        let table = *(object as *const *const *const c_void);
        std::mem::transmute_copy(&*table.add(index))
    }
}

fn check(result: i32, step: &str) -> Result<(), String> {
    if result == OK {
        Ok(())
    } else {
        Err(format!("AMF {step} failed with {result}"))
    }
}

pub struct Object(*mut c_void);

impl Object {
    fn wrap(pointer: *mut c_void, step: &str) -> Result<Self, String> {
        if pointer.is_null() {
            Err(format!("AMF {step} returned nothing"))
        } else {
            Ok(Self(pointer))
        }
    }

    pub fn set(&self, name: PCWSTR, value: Variant) -> Result<(), String> {
        type SetProperty = unsafe extern "system" fn(*mut c_void, *const u16, Variant) -> i32;
        let result = unsafe { method::<SetProperty>(self.0, SET_PROPERTY)(self.0, name.0, value) };
        check(result, "property")
    }
}

impl Drop for Object {
    fn drop(&mut self) {
        type Release = unsafe extern "system" fn(*mut c_void) -> i32;
        unsafe { method::<Release>(self.0, RELEASE)(self.0) };
    }
}

pub struct Factory(*mut c_void);

impl Factory {
    pub fn load() -> Result<Self, String> {
        type Init = unsafe extern "C" fn(u64, *mut *mut c_void) -> i32;
        let library =
            unsafe { LoadLibraryExW(w!("amfrt64.dll"), None, LOAD_LIBRARY_SEARCH_SYSTEM32) }
                .map_err(|_| "AMF runtime not found".to_owned())?;
        let address =
            unsafe { GetProcAddress(library, s!("AMFInit")) }.ok_or("AMF entry point not found")?;
        let init: Init = unsafe { std::mem::transmute(address) };
        let mut factory = null_mut();
        check(unsafe { init(VERSION, &mut factory) }, "startup")?;
        if factory.is_null() {
            return Err("AMF startup returned nothing".to_owned());
        }
        Ok(Self(factory))
    }

    pub fn context(&self, device: *mut c_void) -> Result<Context, String> {
        type Create = unsafe extern "system" fn(*mut c_void, *mut *mut c_void) -> i32;
        let mut pointer = null_mut();
        check(
            unsafe { method::<Create>(self.0, FACTORY_CREATE_CONTEXT)(self.0, &mut pointer) },
            "context",
        )?;
        let context = Context(Object::wrap(pointer, "context")?);
        type InitDevice = unsafe extern "system" fn(*mut c_void, *mut c_void, i32) -> i32;
        check(
            unsafe {
                method::<InitDevice>(pointer, CONTEXT_INIT_DX11)(pointer, device, DIRECTX_11)
            },
            "device",
        )?;
        Ok(context)
    }

    pub fn component(&self, context: &Context, id: PCWSTR) -> Result<Component, String> {
        type Create = unsafe extern "system" fn(
            *mut c_void,
            *mut c_void,
            *const u16,
            *mut *mut c_void,
        ) -> i32;
        let mut pointer = null_mut();
        check(
            unsafe {
                method::<Create>(self.0, FACTORY_CREATE_COMPONENT)(
                    self.0,
                    context.0.0,
                    id.0,
                    &mut pointer,
                )
            },
            "encoder",
        )?;
        Ok(Component(Object::wrap(pointer, "encoder")?))
    }
}

pub struct Context(Object);

impl Context {
    pub fn surface(&self, texture: *mut c_void) -> Result<Object, String> {
        type Create = unsafe extern "system" fn(
            *mut c_void,
            *mut c_void,
            *mut *mut c_void,
            *mut c_void,
        ) -> i32;
        let mut pointer = null_mut();
        let this = self.0.0;
        check(
            unsafe {
                method::<Create>(this, CONTEXT_SURFACE_FROM_DX11)(
                    this,
                    texture,
                    &mut pointer,
                    null_mut(),
                )
            },
            "surface",
        )?;
        Object::wrap(pointer, "surface")
    }
}

impl Drop for Context {
    fn drop(&mut self) {
        type Terminate = unsafe extern "system" fn(*mut c_void) -> i32;
        unsafe { method::<Terminate>(self.0.0, CONTEXT_TERMINATE)(self.0.0) };
    }
}

pub struct Component(Object);

impl Component {
    pub fn set(&self, name: PCWSTR, value: Variant) -> Result<(), String> {
        self.0.set(name, value)
    }

    pub fn init(&self, width: u32, height: u32) -> Result<(), String> {
        type Init = unsafe extern "system" fn(*mut c_void, i32, i32, i32) -> i32;
        let this = self.0.0;
        check(
            unsafe {
                method::<Init>(this, COMPONENT_INIT)(
                    this,
                    SURFACE_NV12,
                    width as i32,
                    height as i32,
                )
            },
            "initialization",
        )
    }

    pub fn submit(&self, surface: &Object, timestamp_us: u64) -> Result<bool, String> {
        type SetPts = unsafe extern "system" fn(*mut c_void, i64);
        type Submit = unsafe extern "system" fn(*mut c_void, *mut c_void) -> i32;
        let this = self.0.0;
        unsafe { method::<SetPts>(surface.0, DATA_SET_PTS)(surface.0, (timestamp_us * 10) as i64) };
        match unsafe { method::<Submit>(this, COMPONENT_SUBMIT)(this, surface.0) } {
            OK | NEED_MORE_INPUT => Ok(true),
            INPUT_FULL => Ok(false),
            result => Err(format!("AMF input failed with {result}")),
        }
    }

    pub fn query(&self) -> Result<Option<Vec<u8>>, String> {
        type Query = unsafe extern "system" fn(*mut c_void, *mut *mut c_void) -> i32;
        let this = self.0.0;
        let mut pointer = null_mut();
        let result = unsafe { method::<Query>(this, COMPONENT_QUERY)(this, &mut pointer) };
        if pointer.is_null() {
            return match result {
                OK | REPEAT | NEED_MORE_INPUT => Ok(None),
                _ => Err(format!("AMF output failed with {result}")),
            };
        }
        read(&Object(pointer)).map(Some)
    }
}

impl Drop for Component {
    fn drop(&mut self) {
        type Terminate = unsafe extern "system" fn(*mut c_void) -> i32;
        unsafe { method::<Terminate>(self.0.0, COMPONENT_TERMINATE)(self.0.0) };
    }
}

fn read(data: &Object) -> Result<Vec<u8>, String> {
    type QueryInterface =
        unsafe extern "system" fn(*mut c_void, *const GUID, *mut *mut c_void) -> i32;
    type Size = unsafe extern "system" fn(*mut c_void) -> usize;
    type Native = unsafe extern "system" fn(*mut c_void) -> *const u8;
    let mut pointer = null_mut();
    check(
        unsafe {
            method::<QueryInterface>(data.0, QUERY_INTERFACE)(data.0, &BUFFER_ID, &mut pointer)
        },
        "buffer",
    )?;
    let buffer = Object::wrap(pointer, "buffer")?;
    let length = unsafe { method::<Size>(buffer.0, BUFFER_SIZE)(buffer.0) };
    let bytes = unsafe { method::<Native>(buffer.0, BUFFER_NATIVE)(buffer.0) };
    if bytes.is_null() {
        return Err("AMF buffer is empty".to_owned());
    }
    Ok(unsafe { std::slice::from_raw_parts(bytes, length) }.to_vec())
}
