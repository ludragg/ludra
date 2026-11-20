use std::collections::HashMap;
use std::path::PathBuf;

use tauri::{AppHandle, Manager};

pub struct Registry {
    file: &'static str,
    map: Option<HashMap<String, PathBuf>>,
}

impl Registry {
    pub const fn new(file: &'static str) -> Self {
        Self { file, map: None }
    }

    pub fn get(&mut self, app: &AppHandle, id: &str) -> Option<PathBuf> {
        self.load(app).get(id).filter(|path| path.exists()).cloned()
    }

    pub fn known(&mut self, app: &AppHandle, id: &str) -> bool {
        self.load(app).contains_key(id)
    }

    pub fn insert(&mut self, app: &AppHandle, id: String, path: PathBuf) {
        self.load(app).insert(id, path);
        if let (Some(location), Some(map)) = (location(app, self.file), &self.map) {
            if let Some(dir) = location.parent() {
                let _ = std::fs::create_dir_all(dir);
            }
            if let Ok(text) = serde_json::to_string(map) {
                let _ = std::fs::write(location, text);
            }
        }
    }

    fn load(&mut self, app: &AppHandle) -> &mut HashMap<String, PathBuf> {
        let file = self.file;
        self.map.get_or_insert_with(|| {
            location(app, file)
                .and_then(|path| std::fs::read_to_string(path).ok())
                .and_then(|text| serde_json::from_str::<HashMap<String, PathBuf>>(&text).ok())
                .unwrap_or_default()
        })
    }
}

fn location(app: &AppHandle, file: &str) -> Option<PathBuf> {
    app.path()
        .app_local_data_dir()
        .ok()
        .map(|dir| dir.join(file))
}
