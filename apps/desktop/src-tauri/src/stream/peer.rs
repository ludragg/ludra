use std::net::{IpAddr, ToSocketAddrs, UdpSocket};
use std::sync::Arc;
use std::sync::atomic::{AtomicU32, Ordering};
use std::time::{Duration, Instant};

use rtc::interceptor::{
    CongestionControlBuilder, Registry, Slot, TwccReceiverBuilder, TwccSenderBuilder,
};
use rtc::media_stream::MediaStreamTrack;
use rtc::peer_connection::configuration::RTCConfigurationBuilder;
use rtc::peer_connection::configuration::interceptor_registry::register_default_interceptors;
use rtc::peer_connection::configuration::media_engine::{MIME_TYPE_H264, MediaEngine};
use rtc::peer_connection::configuration::setting_engine::{SettingEngine, SettingEngineBuilder};
use rtc::peer_connection::sdp::RTCSessionDescription;
use rtc::peer_connection::transport::RTCIceServer;
use rtc::rtp::codec::h264::H264Payloader;
use rtc::rtp::packetizer::{Packetizer, new_packetizer};
use rtc::rtp::sequence::{Sequencer, new_random_sequencer};
use rtc::rtp_transceiver::rtp_sender::{
    RTCPFeedback, RTCRtpCodec, RTCRtpCodecParameters, RTCRtpCodingParameters,
    RTCRtpEncodingParameters, RTCRtpHeaderExtensionCapability, RtpCodecKind,
};
use tokio::sync::{Notify, mpsc};
use tokio::task::JoinHandle;
use webrtc::media_stream::track_local::static_rtp::TrackLocalStaticRTP;
use webrtc::media_stream::track_local::{TrackLocal, TrackLocalEvent};
use webrtc::peer_connection::{
    PeerConnection, PeerConnectionBuilder, PeerConnectionEventHandler, RTCIceGatheringState,
    RTCIceTransportPolicy, RTCPeerConnectionState,
};
use webrtc::rtp_transceiver::RtpSender;
use webrtc::runtime::default_runtime;

use super::congestion::Estimator;
use super::keyframes::KeyframeRequests;
use super::pacer::Pacer;
use super::publisher::Publisher;
use crate::encoder::EncodedFrame;

const TRANSPORT_CC: &str =
    "http://www.ietf.org/id/draft-holmer-rmcat-transport-wide-cc-extensions-01";
const H264_PROFILE: &str = "level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=64001f";
const PAYLOAD_TYPE: u8 = 102;
const CLOCK_RATE: u32 = 90_000;
const MTU: usize = 1200;
const QUEUE: usize = 12;
const GATHER_LIMIT: Duration = Duration::from_secs(8);
const KEYFRAME_SLOT: usize = 14_000;

#[derive(Clone, serde::Deserialize)]
pub struct IceServer {
    pub urls: Vec<String>,
    pub username: String,
    pub credential: String,
}

#[derive(Clone, Copy, PartialEq)]
pub enum LinkState {
    Connected,
    Failed,
}

type StateHandler = Box<dyn Fn(LinkState) + Send + Sync>;

struct Events {
    id: String,
    publisher: Arc<Publisher>,
    frames: mpsc::Sender<Arc<EncodedFrame>>,
    estimate: Arc<AtomicU32>,
    gathered: Arc<Notify>,
    on_state: StateHandler,
}

#[async_trait::async_trait]
impl PeerConnectionEventHandler for Events {
    async fn on_ice_gathering_state_change(&self, state: RTCIceGatheringState) {
        if state == RTCIceGatheringState::Complete {
            self.gathered.notify_one();
        }
    }

    async fn on_connection_state_change(&self, state: RTCPeerConnectionState) {
        match state {
            RTCPeerConnectionState::Connected => {
                self.publisher
                    .join(self.id.clone(), self.frames.clone(), self.estimate.clone());
                (self.on_state)(LinkState::Connected);
            }
            RTCPeerConnectionState::Disconnected => self.publisher.leave(&self.id),
            RTCPeerConnectionState::Failed => {
                self.publisher.leave(&self.id);
                (self.on_state)(LinkState::Failed);
            }
            _ => {}
        }
    }
}

pub struct Peer {
    id: String,
    publisher: Arc<Publisher>,
    connection: Box<dyn PeerConnection>,
    tasks: Vec<JoinHandle<()>>,
}

impl Peer {
    pub async fn offer(
        id: String,
        publisher: Arc<Publisher>,
        servers: Vec<IceServer>,
        direct: bool,
        on_state: impl Fn(LinkState) + Send + Sync + 'static,
    ) -> Result<(Self, String), String> {
        let address = local_address(&servers).ok_or("no route to the relay")?;
        let (initial, minimum, maximum) = publisher.quality().limits();
        let estimate = Arc::new(AtomicU32::new(initial));
        let (frames, queue) = mpsc::channel(QUEUE);
        let gathered = Arc::new(Notify::new());

        let mut media = MediaEngine::default();
        let codec = RTCRtpCodecParameters {
            rtp_codec: RTCRtpCodec {
                mime_type: MIME_TYPE_H264.to_owned(),
                clock_rate: CLOCK_RATE,
                channels: 0,
                sdp_fmtp_line: H264_PROFILE.to_owned(),
                rtcp_feedback: vec![],
            },
            payload_type: PAYLOAD_TYPE,
            ..Default::default()
        };
        media
            .register_codec(codec.clone(), RtpCodecKind::Video)
            .map_err(text)?;
        media.register_feedback(
            RTCPFeedback {
                typ: "transport-cc".to_owned(),
                parameter: String::new(),
            },
            RtpCodecKind::Video,
        );
        media
            .register_header_extension(
                RTCRtpHeaderExtensionCapability {
                    uri: TRANSPORT_CC.to_owned(),
                },
                RtpCodecKind::Video,
                None,
            )
            .map_err(text)?;
        let congestion = Registry::new()
            .with(
                Slot::CongestionControl,
                CongestionControlBuilder::new(Estimator::new(
                    initial,
                    minimum,
                    maximum,
                    estimate.clone(),
                ))
                .build(),
            )
            .with(Slot::TwccSender, TwccSenderBuilder::new().build())
            .with(Slot::TwccReceiver, TwccReceiverBuilder::new().build());
        let registry = register_default_interceptors(congestion, &mut media)
            .map_err(text)?
            .with(Slot::from(KEYFRAME_SLOT), KeyframeRequests::default());

        let policy = if direct {
            RTCIceTransportPolicy::All
        } else {
            RTCIceTransportPolicy::Relay
        };
        let configuration = RTCConfigurationBuilder::new()
            .with_ice_servers(ice_servers(servers, direct))
            .with_ice_transport_policy(policy)
            .build();
        let events = Events {
            id: id.clone(),
            publisher: publisher.clone(),
            frames,
            estimate: estimate.clone(),
            gathered: gathered.clone(),
            on_state: Box::new(on_state),
        };
        let connection = PeerConnectionBuilder::new()
            .with_configuration(configuration)
            .with_setting_engine(settings(direct))
            .with_media_engine(media)
            .with_interceptor_registry(registry)
            .with_handler(Arc::new(events))
            .with_runtime(default_runtime().ok_or("no async runtime")?)
            .with_udp_addrs(vec![format!("{address}:0")])
            .build()
            .await
            .map_err(text)?;
        let mut peer = Self {
            id,
            publisher,
            connection: Box::new(connection),
            tasks: Vec::new(),
        };

        let ssrc = random();
        let track = Arc::new(TrackLocalStaticRTP::new(MediaStreamTrack::new(
            "ludra-screen".to_owned(),
            "ludra-screen-video".to_owned(),
            "screen".to_owned(),
            RtpCodecKind::Video,
            vec![RTCRtpEncodingParameters {
                rtp_coding_parameters: RTCRtpCodingParameters {
                    ssrc: Some(ssrc),
                    ..Default::default()
                },
                codec: codec.rtp_codec,
                ..Default::default()
            }],
        )));
        let sender = peer
            .connection
            .add_track(track.clone() as Arc<dyn TrackLocal>)
            .await
            .map_err(text)?;

        let offer = peer.connection.create_offer(None).await.map_err(text)?;
        peer.connection
            .set_local_description(offer)
            .await
            .map_err(text)?;
        let _ = tokio::time::timeout(GATHER_LIMIT, gathered.notified()).await;
        let local = peer
            .connection
            .local_description()
            .await
            .ok_or("no local description")?;

        let feedback = track.clone();
        let keyframes = peer.publisher.clone();
        let viewer = peer.id.clone();
        peer.tasks.push(tokio::spawn(async move {
            while let Some(event) = feedback.poll().await {
                if let TrackLocalEvent::OnRtcpPacket(_) = event {
                    keyframes.request_keyframe(&viewer);
                }
            }
        }));
        peer.tasks
            .push(tokio::spawn(transmit(track, sender, ssrc, estimate, queue)));
        Ok((peer, local.sdp))
    }

    pub async fn answer(&self, sdp: String) -> Result<(), String> {
        let answer = RTCSessionDescription::answer(sdp).map_err(text)?;
        self.connection
            .set_remote_description(answer)
            .await
            .map_err(text)
    }

    pub async fn close(self) {
        self.publisher.leave(&self.id);
        for task in &self.tasks {
            task.abort();
        }
        let _ = self.connection.close().await;
    }
}

async fn transmit(
    track: Arc<TrackLocalStaticRTP>,
    sender: Arc<dyn RtpSender>,
    ssrc: u32,
    estimate: Arc<AtomicU32>,
    mut queue: mpsc::Receiver<Arc<EncodedFrame>>,
) {
    let mut pacer = Pacer::new();
    let mut packetizer = None;
    let mut started = false;
    let base = random();
    while let Some(frame) = queue.recv().await {
        started |= frame.keyframe;
        if !started {
            continue;
        }
        if packetizer.is_none() {
            let Some(payload_type) = negotiated(&sender).await else {
                continue;
            };
            packetizer = Some(new_packetizer(
                Instant::now(),
                MTU,
                payload_type,
                ssrc,
                Box::new(H264Payloader::default()),
                Box::new(new_random_sequencer()),
                CLOCK_RATE,
            ));
        }
        let Some(current) = packetizer.as_mut() else {
            continue;
        };
        let Ok(packets) = current.packetize(Instant::now(), &frame.data, 0) else {
            continue;
        };
        let timestamp = base.wrapping_add((frame.timestamp_us * 9 / 100) as u32);
        for mut packet in packets {
            pacer
                .admit(packet.payload.len(), estimate.load(Ordering::Relaxed))
                .await;
            packet.header.timestamp = timestamp;
            let _ = track.write_rtp(packet).await;
        }
    }
}

async fn negotiated(sender: &Arc<dyn RtpSender>) -> Option<u8> {
    let parameters = sender.get_parameters().await.ok()?;
    parameters
        .rtp_parameters
        .codecs
        .first()
        .map(|codec| codec.payload_type)
}

fn settings(direct: bool) -> SettingEngine {
    let builder = SettingEngineBuilder::new();
    if direct {
        builder.build()
    } else {
        builder
            .with_relay_acceptance_min_wait(Some(Duration::ZERO))
            .build()
    }
}

fn ice_servers(servers: Vec<IceServer>, direct: bool) -> Vec<RTCIceServer> {
    let discovery: Vec<RTCIceServer> = servers
        .iter()
        .filter(|_| direct)
        .flat_map(|server| server.urls.iter())
        .filter_map(|url| relay_host(url))
        .map(|host| RTCIceServer {
            urls: vec![format!("stun:{host}")],
            ..Default::default()
        })
        .collect();
    servers
        .into_iter()
        .map(|server| RTCIceServer {
            urls: server.urls,
            username: server.username,
            credential: server.credential,
        })
        .chain(discovery)
        .collect()
}

fn random() -> u32 {
    let high = u32::from(new_random_sequencer().next_sequence_number());
    let low = u32::from(new_random_sequencer().next_sequence_number());
    high << 16 | low
}

fn relay_host(url: &str) -> Option<&str> {
    url.strip_prefix("turn:")?.split('?').next()
}

fn local_address(servers: &[IceServer]) -> Option<IpAddr> {
    let target = servers
        .iter()
        .flat_map(|server| server.urls.iter())
        .filter_map(|url| relay_host(url))
        .find_map(|host| {
            host.to_socket_addrs()
                .ok()?
                .find(|address| address.is_ipv4())
        })?;
    let socket = UdpSocket::bind("0.0.0.0:0").ok()?;
    socket.connect(target).ok()?;
    Some(socket.local_addr().ok()?.ip())
}

fn text(error: impl std::fmt::Display) -> String {
    error.to_string()
}
