#[cfg(windows)]
mod credential;

use tauri::{AppHandle, Webview};

const MAIN_WINDOW: &str = "main";
const MAX_TOKEN: usize = 512;

fn main_window(webview: &Webview) -> Result<(), String> {
    if webview.label() == MAIN_WINDOW {
        Ok(())
    } else {
        Err("not allowed".into())
    }
}

fn valid(token: &str) -> bool {
    !token.is_empty()
        && token.len() <= MAX_TOKEN
        && token
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_')
}

fn target(app: &AppHandle) -> String {
    let mut target = format!("{}/session", app.config().identifier);
    if let Some(folder) =
        std::env::var_os("WEBVIEW2_USER_DATA_FOLDER").filter(|folder| !folder.is_empty())
    {
        target.push('@');
        target.push_str(&folder.to_string_lossy());
    }
    target
}

#[tauri::command]
pub fn session_token_read(app: AppHandle, webview: Webview) -> Result<Option<String>, String> {
    main_window(&webview)?;
    let Some(secret) = credential::read(&target(&app)).map_err(|error| error.to_string())? else {
        return Ok(None);
    };
    Ok(String::from_utf8(secret).ok().filter(|token| valid(token)))
}

#[tauri::command]
pub fn session_token_save(app: AppHandle, webview: Webview, token: String) -> Result<(), String> {
    main_window(&webview)?;
    if !valid(&token) {
        return Err("invalid token".into());
    }
    credential::write(&target(&app), token.as_bytes()).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn session_token_clear(app: AppHandle, webview: Webview) -> Result<(), String> {
    main_window(&webview)?;
    credential::delete(&target(&app)).map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::valid;

    #[test]
    fn accepts_server_tokens() {
        assert!(valid("q5yPZ0s7Ho2lPj9Qm0J0cJ8pZ1o3fXr3Yb5X9cW2vA0"));
        assert!(valid("a-b_c"));
    }

    #[test]
    fn rejects_anything_else() {
        assert!(!valid(""));
        assert!(!valid("has space"));
        assert!(!valid("quote\""));
        assert!(!valid("line\nbreak"));
        assert!(!valid(&"a".repeat(513)));
    }
}
