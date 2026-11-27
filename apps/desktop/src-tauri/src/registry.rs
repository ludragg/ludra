use std::collections::HashMap;
use std::path::{Path, PathBuf};

use crate::storage;

pub const SHARED_FILES: &str = "shared-files.json";
pub const SAVED_FILES: &str = "downloaded-files.json";

pub struct Registry {
    file: &'static str,
    map: Option<HashMap<String, PathBuf>>,
}

impl Registry {
    pub const fn new(file: &'static str) -> Self {
        Self { file, map: None }
    }

    pub fn get(&mut self, id: &str) -> Option<PathBuf> {
        self.load().get(id).filter(|path| path.exists()).cloned()
    }

    pub fn refers(&mut self, path: &Path) -> bool {
        self.load().values().any(|known| known == path)
    }

    pub fn known(&mut self, id: &str) -> bool {
        self.load().contains_key(id)
    }

    pub fn insert(&mut self, id: String, path: PathBuf) {
        self.load().insert(id, path);
        if let (Some(location), Some(map)) = (location(self.file), &self.map) {
            let _ = write(&location, map);
        }
    }

    fn load(&mut self) -> &mut HashMap<String, PathBuf> {
        let file = self.file;
        self.map
            .get_or_insert_with(|| location(file).map(|path| read(&path)).unwrap_or_default())
    }
}

pub fn read(location: &Path) -> HashMap<String, PathBuf> {
    std::fs::read_to_string(location)
        .ok()
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_default()
}

pub fn write(location: &Path, map: &HashMap<String, PathBuf>) -> std::io::Result<()> {
    if let Some(directory) = location.parent() {
        std::fs::create_dir_all(directory)?;
    }
    std::fs::write(location, serde_json::to_string(map)?)
}

fn location(file: &str) -> Option<PathBuf> {
    storage::directory().map(|directory| directory.join(file))
}
