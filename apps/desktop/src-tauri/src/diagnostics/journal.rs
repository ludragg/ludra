use std::collections::{BTreeMap, VecDeque};
use std::fs;
use std::path::PathBuf;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

const QUEUE_FILE: &str = "diagnostics.json";
const DISABLED_FILE: &str = "diagnostics-off";
const PENDING_LIMIT: usize = 50;
const SESSION_LIMIT: u32 = 200;
const REPEAT_AFTER: Duration = Duration::from_secs(10 * 60);
const TRAIL_LIMIT: usize = 60;
const TRAIL_LINE: usize = 300;
const MESSAGE_LIMIT: usize = 500;
const DETAIL_LIMIT: usize = 6000;
const AREA_LIMIT: usize = 40;

#[derive(Clone, Copy, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Level {
    Warning,
    Error,
    Crash,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Report {
    pub id: u64,
    pub occurred_at: u64,
    pub level: Level,
    pub area: String,
    pub message: String,
    pub detail: String,
    pub count: u32,
    pub version: String,
}

pub struct Journal {
    directory: Option<PathBuf>,
    enabled: bool,
    pending: Vec<Report>,
    trail: VecDeque<String>,
    recorded: BTreeMap<String, Instant>,
    session: u32,
    next_id: u64,
    started: Option<Instant>,
}

impl Journal {
    pub const fn new() -> Self {
        Self {
            directory: None,
            enabled: true,
            pending: Vec::new(),
            trail: VecDeque::new(),
            recorded: BTreeMap::new(),
            session: 0,
            next_id: 0,
            started: None,
        }
    }

    pub fn open(&mut self, directory: PathBuf) {
        let _ = fs::create_dir_all(&directory);
        self.enabled = !directory.join(DISABLED_FILE).exists();
        let saved: Vec<Report> = fs::read(directory.join(QUEUE_FILE))
            .ok()
            .and_then(|bytes| serde_json::from_slice(&bytes).ok())
            .unwrap_or_default();
        self.directory = Some(directory);
        if !self.enabled {
            self.forget();
            return;
        }
        let early = std::mem::replace(&mut self.pending, saved);
        for mut report in early {
            self.next_id = self.next_id.max(self.last_id()) + 1;
            report.id = self.next_id;
            self.pending.push(report);
        }
        self.next_id = self.next_id.max(self.last_id());
        self.save();
    }

    pub fn set_enabled(&mut self, enabled: bool) {
        self.enabled = enabled;
        let marker = self.directory.as_ref().map(|path| path.join(DISABLED_FILE));
        if enabled {
            if let Some(marker) = marker {
                let _ = fs::remove_file(marker);
            }
            return;
        }
        if let Some(marker) = marker {
            let _ = fs::write(marker, b"");
        }
        self.forget();
    }

    pub fn note(&mut self, area: &str, message: &str) {
        if !self.enabled {
            return;
        }
        let elapsed = self
            .started
            .get_or_insert_with(Instant::now)
            .elapsed()
            .as_secs_f64();
        if self.trail.len() == TRAIL_LIMIT {
            self.trail.pop_front();
        }
        self.trail.push_back(clip(
            &format!("+{elapsed:.1}s {area}: {message}"),
            TRAIL_LINE,
        ));
    }

    pub fn record(&mut self, level: Level, area: &str, message: &str, detail: &str, version: &str) {
        if !self.enabled {
            return;
        }
        let area = clip(area, AREA_LIMIT);
        let message = clip(message, MESSAGE_LIMIT);
        if let Some(report) = self.pending.iter_mut().find(|report| {
            report.level == level && report.area == area && report.message == message
        }) {
            report.count = report.count.saturating_add(1);
            self.save();
            return;
        }
        let key = format!("{area}|{message}");
        let repeated = self
            .recorded
            .get(&key)
            .is_some_and(|at| at.elapsed() < REPEAT_AFTER);
        if repeated || self.session >= SESSION_LIMIT {
            return;
        }
        self.recorded.insert(key, Instant::now());
        self.session += 1;
        self.next_id = self.next_id.max(self.last_id()) + 1;

        let mut full = detail.to_owned();
        if !self.trail.is_empty() {
            full = clip(&full, DETAIL_LIMIT / 2);
            full.push_str("\n--- recent activity ---\n");
            for line in &self.trail {
                full.push_str(line);
                full.push('\n');
            }
        }
        if self.pending.len() == PENDING_LIMIT {
            let oldest = self
                .pending
                .iter()
                .position(|report| report.level != Level::Crash)
                .unwrap_or(0);
            self.pending.remove(oldest);
        }
        self.pending.push(Report {
            id: self.next_id,
            occurred_at: SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map_or(0, |since| since.as_millis() as u64),
            level,
            area,
            message,
            detail: clip_end(&full, DETAIL_LIMIT),
            count: 1,
            version: version.to_owned(),
        });
        self.save();
    }

    pub fn pending(&self) -> Vec<Report> {
        if self.enabled {
            self.pending.clone()
        } else {
            Vec::new()
        }
    }

    pub fn discard(&mut self, ids: &[u64]) {
        self.pending.retain(|report| !ids.contains(&report.id));
        self.save();
    }

    fn last_id(&self) -> u64 {
        self.pending
            .iter()
            .map(|report| report.id)
            .max()
            .unwrap_or(0)
    }

    fn forget(&mut self) {
        self.pending.clear();
        self.trail.clear();
        self.recorded.clear();
        if let Some(directory) = &self.directory {
            let _ = fs::remove_file(directory.join(QUEUE_FILE));
        }
    }

    fn save(&self) {
        let Some(directory) = &self.directory else {
            return;
        };
        let path = directory.join(QUEUE_FILE);
        if self.pending.is_empty() {
            let _ = fs::remove_file(path);
        } else if let Ok(bytes) = serde_json::to_vec(&self.pending) {
            let _ = fs::write(path, bytes);
        }
    }
}

fn clip(text: &str, limit: usize) -> String {
    text.chars().take(limit).collect()
}

fn clip_end(text: &str, limit: usize) -> String {
    let excess = text.chars().count().saturating_sub(limit);
    text.chars().skip(excess).collect()
}
