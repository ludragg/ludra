mod congestion;
mod keyframes;
mod ladder;
mod lane;
mod pacer;
mod peer;
mod publisher;
mod quality;
mod support;
mod viewers;
mod watchdog;

use std::collections::HashMap;
use std::sync::{Arc, OnceLock};
use std::time::Instant;

use tauri::{AppHandle, Emitter, Manager, State};
use tokio::sync::Mutex;

use peer::{IceServer, LinkState, Peer};
pub use publisher::{Publisher, Selection};
pub use quality::Quality;
use support::Detected;

const PEER_EVENT: &str = "stream-peer";
const BROKEN_EVENT: &str = "stream-broken";
const MAIN_WINDOW: &str = "main";

fn trace(message: impl std::fmt::Display) {
    if cfg!(debug_assertions) {
        eprintln!("stream: {message}");
    }
}

#[derive(Default)]
pub struct StreamState {
    publisher: OnceLock<Arc<Publisher>>,
    peers: Mutex<HashMap<String, Peer>>,
}

impl StreamState {
    pub fn publisher(&self, app: &AppHandle) -> Arc<Publisher> {
        self.publisher
            .get_or_init(|| {
                let app = app.clone();
                Publisher::new(move |reason| {
                    let _ = app.emit_to(MAIN_WINDOW, BROKEN_EVENT, reason);
                })
            })
            .clone()
    }

    async fn clear(&self) {
        let peers: Vec<Peer> = self
            .peers
            .lock()
            .await
            .drain()
            .map(|(_, peer)| peer)
            .collect();
        for peer in peers {
            peer.close().await;
        }
    }
}

#[derive(Clone, serde::Serialize)]
struct PeerEvent {
    viewer: String,
    connected: bool,
}

#[tauri::command]
pub async fn stream_encoders() -> Vec<Detected> {
    tauri::async_runtime::spawn_blocking(support::hardware_encoders)
        .await
        .unwrap_or_default()
}

#[tauri::command]
pub async fn stream_offer(
    app: AppHandle,
    state: State<'_, StreamState>,
    viewer: String,
    servers: Vec<IceServer>,
    direct: bool,
) -> Result<String, String> {
    let publisher = state.publisher(&app);
    if publisher.broken() {
        return Err("the hardware encoder is not available".to_owned());
    }
    let previous = state.peers.lock().await.remove(&viewer);
    if let Some(previous) = previous {
        previous.close().await;
    }
    let (events, id) = (app.clone(), viewer.clone());
    let requested = Instant::now();
    let (peer, offer) = Peer::offer(viewer.clone(), publisher, servers, direct, move |link| {
        let outcome = match link {
            LinkState::Connected => "a viewer is connected to the native stream",
            LinkState::Failed => "a native viewer connection failed",
        };
        trace(format_args!(
            "{outcome} after {} ms",
            requested.elapsed().as_millis()
        ));
        let _ = events.emit_to(
            MAIN_WINDOW,
            PEER_EVENT,
            PeerEvent {
                viewer: id.clone(),
                connected: link == LinkState::Connected,
            },
        );
    })
    .await?;
    state.peers.lock().await.insert(viewer, peer);
    Ok(offer)
}

#[tauri::command]
pub async fn stream_answer(
    state: State<'_, StreamState>,
    viewer: String,
    sdp: String,
) -> Result<(), String> {
    match state.peers.lock().await.get(&viewer) {
        Some(peer) => peer.answer(sdp).await,
        None => Err("no stream for this viewer".to_owned()),
    }
}

#[tauri::command]
pub async fn stream_close(state: State<'_, StreamState>, viewer: String) -> Result<(), String> {
    let peer = state.peers.lock().await.remove(&viewer);
    if let Some(peer) = peer {
        trace("a native viewer connection was closed");
        peer.close().await;
    }
    Ok(())
}

pub fn reset(app: &AppHandle) {
    let Some(state) = app.try_state::<StreamState>() else {
        return;
    };
    if let Some(publisher) = state.publisher.get() {
        publisher.shutdown();
    }
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        app.state::<StreamState>().clear().await;
    });
}
