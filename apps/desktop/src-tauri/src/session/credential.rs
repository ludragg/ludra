use windows::Win32::Foundation::ERROR_NOT_FOUND;
use windows::Win32::Security::Credentials::{
    CRED_PERSIST_LOCAL_MACHINE, CRED_TYPE_GENERIC, CREDENTIALW, CredDeleteW, CredFree, CredReadW,
    CredWriteW,
};
use windows::core::{HSTRING, PWSTR, Result};

const USER_NAME: &str = "Ludra";

fn wide(text: &str) -> Vec<u16> {
    text.encode_utf16().chain(Some(0)).collect()
}

fn not_found(error: &windows::core::Error) -> bool {
    error.code() == ERROR_NOT_FOUND.to_hresult()
}

pub fn read(target: &str) -> Result<Option<Vec<u8>>> {
    let target = HSTRING::from(target);
    let mut credential: *mut CREDENTIALW = std::ptr::null_mut();
    match unsafe { CredReadW(&target, CRED_TYPE_GENERIC, None, &mut credential) } {
        Ok(()) => {}
        Err(error) if not_found(&error) => return Ok(None),
        Err(error) => return Err(error),
    }

    let secret = unsafe {
        let found = &*credential;
        let size = found.CredentialBlobSize as usize;
        let secret = if size == 0 || found.CredentialBlob.is_null() {
            Vec::new()
        } else {
            std::slice::from_raw_parts(found.CredentialBlob, size).to_vec()
        };
        CredFree(credential as *const _);
        secret
    };
    Ok(Some(secret))
}

pub fn write(target: &str, secret: &[u8]) -> Result<()> {
    let mut target = wide(target);
    let mut user = wide(USER_NAME);
    let credential = CREDENTIALW {
        Type: CRED_TYPE_GENERIC,
        TargetName: PWSTR(target.as_mut_ptr()),
        CredentialBlobSize: secret.len() as u32,
        CredentialBlob: secret.as_ptr() as *mut u8,
        Persist: CRED_PERSIST_LOCAL_MACHINE,
        UserName: PWSTR(user.as_mut_ptr()),
        ..Default::default()
    };
    unsafe { CredWriteW(&credential, 0) }
}

pub fn delete(target: &str) -> Result<()> {
    let target = HSTRING::from(target);
    match unsafe { CredDeleteW(&target, CRED_TYPE_GENERIC, None) } {
        Err(error) if not_found(&error) => Ok(()),
        result => result,
    }
}
