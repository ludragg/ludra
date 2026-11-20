use serde::Serialize;

#[derive(Clone, Serialize)]
pub struct DevProfile {
    pub name: String,
    pub login: String,
    pub password: String,
}

pub fn profile() -> Option<DevProfile> {
    if !cfg!(debug_assertions) {
        return None;
    }
    let name = std::env::var("LUDRA_DEV_PROFILE")
        .ok()
        .filter(|name| !name.is_empty())?;
    Some(DevProfile {
        name,
        login: std::env::var("LUDRA_DEV_LOGIN").unwrap_or_default(),
        password: std::env::var("LUDRA_DEV_PASSWORD").unwrap_or_default(),
    })
}

#[tauri::command]
pub fn dev_profile() -> Option<DevProfile> {
    profile()
}
