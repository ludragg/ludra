import type { IceServer } from "@/protocol/ludra/v1/models_pb";
import { SignalKind } from "@/protocol/ludra/v1/models_pb";
import { applyScreenEncoding, preferScreenCodecs, tuneVideoBitrate, type ScreenQuality } from "@/services/screen";

type SinkElement = HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> };
type SinkContext = AudioContext & { setSinkId?: (id: string) => Promise<void> };

export class PeerLink {
  onSignal: (kind: SignalKind, payload: string) => void = () => {};
  onConnected: () => void = () => {};
  onFailed: () => void = () => {};
  onLatency: (milliseconds: number) => void = () => {};
  onScreen: (stream: MediaStream | null) => void = () => {};

  #connection: RTCPeerConnection;
  #polite: boolean;
  #context = new AudioContext() as SinkContext;
  #analyser = this.#context.createAnalyser();
  #boost = this.#context.createGain();
  #remote = new Audio() as SinkElement;
  #buffer = new Float32Array(this.#analyser.fftSize);
  #pending: RTCIceCandidateInit[] = [];
  #stats: number | undefined;
  #outputVolume = 1;
  #peerVolume = 1;
  #deafened = false;
  #voice: MediaStream | null = null;
  #screen: MediaStream | null = null;
  #screenSenders: RTCRtpSender[] = [];
  #senderKinds = new Map<RTCRtpSender, string>();
  #screenQuality: ScreenQuality | null = null;
  #negotiating = false;
  #makingOffer = false;
  #ignoreOffer = false;

  constructor(iceServers: IceServer[], track: MediaStreamTrack, polite: boolean) {
    this.#polite = polite;
    this.#connection = new RTCPeerConnection({
      iceServers: iceServers.map(({ urls, username, credential }) => ({ urls, username, credential })),
      iceTransportPolicy: "relay",
    });
    this.#connection.addTrack(track, new MediaStream([track]));

    this.#connection.onicecandidate = ({ candidate }) => {
      if (candidate) {
        this.onSignal(SignalKind.CANDIDATE, JSON.stringify(candidate.toJSON()));
      }
    };
    this.#connection.onconnectionstatechange = () => {
      const state = this.#connection.connectionState;
      if (state === "connected") {
        this.#negotiating = true;
        this.onConnected();
        this.#watchLatency();
      } else if (state === "failed") {
        this.onFailed();
      }
    };
    this.#connection.onnegotiationneeded = () => {
      if (this.#negotiating) {
        this.#renegotiate();
      }
    };
    this.#connection.ontrack = ({ streams, track: remote }) =>
      this.#track(streams[0] ?? new MediaStream([remote]), remote);
  }

  async offer() {
    const offer = await this.#connection.createOffer();
    offer.sdp = tuneVideoBitrate(offer.sdp ?? "");
    await this.#connection.setLocalDescription(offer);
    this.onSignal(SignalKind.OFFER, JSON.stringify(offer));
  }

  async receive(kind: SignalKind, payload: string) {
    const data = JSON.parse(payload);

    if (kind === SignalKind.CANDIDATE) {
      if (!this.#connection.remoteDescription) {
        this.#pending.push(data);
        return;
      }
      await this.#connection.addIceCandidate(data).catch((cause) => {
        if (!this.#ignoreOffer) {
          throw cause;
        }
      });
      return;
    }

    if (kind === SignalKind.OFFER) {
      const collision = this.#makingOffer || this.#connection.signalingState !== "stable";
      this.#ignoreOffer = !this.#polite && collision;
      if (this.#ignoreOffer) {
        return;
      }
    }

    await this.#connection.setRemoteDescription(data);
    for (const candidate of this.#pending.splice(0)) {
      await this.#connection.addIceCandidate(candidate);
    }

    if (kind === SignalKind.OFFER) {
      const answer = await this.#connection.createAnswer();
      answer.sdp = tuneVideoBitrate(answer.sdp ?? "");
      await this.#connection.setLocalDescription(answer);
      this.onSignal(SignalKind.ANSWER, JSON.stringify(this.#connection.localDescription));
    }
    await this.#applyEncoding();
  }

  get screen(): MediaStream | null {
    return this.#screen;
  }

  async setScreen(stream: MediaStream | null, quality: ScreenQuality | null) {
    this.#screenQuality = stream ? quality : null;
    if (!stream || !quality) {
      await Promise.all(this.#screenSenders.map((sender) => sender.replaceTrack(null).catch(() => undefined)));
      return;
    }
    for (const track of stream.getTracks()) {
      const existing = this.#screenSenders.find((sender) => this.#senderKinds.get(sender) === track.kind);
      if (existing) {
        await existing.replaceTrack(track).catch(() => undefined);
        continue;
      }
      const sender = this.#connection.addTrack(track, stream);
      this.#screenSenders.push(sender);
      this.#senderKinds.set(sender, track.kind);
      const transceiver = this.#connection.getTransceivers().find((item) => item.sender === sender);
      if (transceiver && track.kind === "video") {
        preferScreenCodecs(transceiver);
      }
    }
    await this.#applyEncoding();
  }

  async #applyEncoding() {
    const quality = this.#screenQuality;
    if (!quality) {
      return;
    }
    for (const sender of this.#screenSenders) {
      if (this.#senderKinds.get(sender) === "video") {
        await applyScreenEncoding(sender, quality);
      }
    }
  }

  level(): number {
    this.#analyser.getFloatTimeDomainData(this.#buffer);
    let sum = 0;
    for (const sample of this.#buffer) {
      sum += sample * sample;
    }
    return Math.sqrt(sum / this.#buffer.length);
  }

  setDeafened(deafened: boolean) {
    this.#deafened = deafened;
    this.#applyVolume();
  }

  setOutputVolume(percent: number) {
    this.#outputVolume = percent / 100;
    this.#applyVolume();
  }

  setPeerVolume(percent: number) {
    this.#peerVolume = percent / 100;
    this.#applyVolume();
  }

  async setOutputDevice(deviceId: string) {
    await this.#remote.setSinkId?.(deviceId).catch(() => undefined);
    await this.#context.setSinkId?.(deviceId).catch(() => undefined);
  }

  close() {
    window.clearInterval(this.#stats);
    this.#connection.close();
    this.#remote.pause();
    this.#remote.srcObject = null;
    this.#context.close();
    if (this.#screen) {
      this.#screen = null;
      this.onScreen(null);
    }
  }

  async #renegotiate() {
    try {
      this.#makingOffer = true;
      const offer = await this.#connection.createOffer();
      offer.sdp = tuneVideoBitrate(offer.sdp ?? "");
      await this.#connection.setLocalDescription(offer);
      this.onSignal(SignalKind.OFFER, JSON.stringify(this.#connection.localDescription));
    } catch {
      return;
    } finally {
      this.#makingOffer = false;
    }
  }

  #applyVolume() {
    const volume = this.#deafened ? 0 : this.#outputVolume * this.#peerVolume;
    const boosted = volume > 1;
    this.#remote.volume = Math.min(1, volume);
    this.#remote.muted = this.#deafened || boosted;
    this.#boost.gain.value = boosted ? volume : 0;
  }

  #track(stream: MediaStream, track: MediaStreamTrack) {
    if (!this.#voice && track.kind === "audio") {
      this.#voice = stream;
      this.#play(stream);
      return;
    }
    if (stream.id === this.#voice?.id) {
      return;
    }

    this.#screen = stream;
    if (track.kind === "video") {
      this.onScreen(stream);
    }
  }

  #play(stream: MediaStream) {
    this.#remote.srcObject = stream;
    this.#remote.play().catch(() => undefined);
    const source = this.#context.createMediaStreamSource(stream);
    source.connect(this.#analyser);
    source.connect(this.#boost).connect(this.#context.destination);
    this.#applyVolume();
  }

  #watchLatency() {
    window.clearInterval(this.#stats);
    const measure = async () => {
      const stats = await this.#connection.getStats().catch(() => null);
      stats?.forEach((report) => {
        if (report.type === "candidate-pair" && report.nominated && report.currentRoundTripTime !== undefined) {
          this.onLatency(Math.round(report.currentRoundTripTime * 1000));
        }
      });
    };
    measure();
    this.#stats = window.setInterval(measure, 2000);
  }
}
