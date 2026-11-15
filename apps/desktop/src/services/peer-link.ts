import type { IceServer } from "@/protocol/ludra/v1/models_pb";
import { SignalKind } from "@/protocol/ludra/v1/models_pb";

type SinkElement = HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> };
type SinkContext = AudioContext & { setSinkId?: (id: string) => Promise<void> };

export class PeerLink {
  onSignal: (kind: SignalKind, payload: string) => void = () => {};
  onConnected: () => void = () => {};
  onFailed: () => void = () => {};
  onLatency: (milliseconds: number) => void = () => {};

  #connection: RTCPeerConnection;
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

  constructor(iceServers: IceServer[], track: MediaStreamTrack) {
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
        this.onConnected();
        this.#watchLatency();
      } else if (state === "failed") {
        this.onFailed();
      }
    };
    this.#connection.ontrack = ({ streams, track: remote }) => this.#play(streams[0] ?? new MediaStream([remote]));
  }

  async offer() {
    const offer = await this.#connection.createOffer();
    await this.#connection.setLocalDescription(offer);
    this.onSignal(SignalKind.OFFER, JSON.stringify(offer));
  }

  async receive(kind: SignalKind, payload: string) {
    const data = JSON.parse(payload);

    if (kind === SignalKind.CANDIDATE) {
      if (this.#connection.remoteDescription) {
        await this.#connection.addIceCandidate(data);
      } else {
        this.#pending.push(data);
      }
      return;
    }

    await this.#connection.setRemoteDescription(data);
    for (const candidate of this.#pending.splice(0)) {
      await this.#connection.addIceCandidate(candidate);
    }

    if (kind === SignalKind.OFFER) {
      const answer = await this.#connection.createAnswer();
      await this.#connection.setLocalDescription(answer);
      this.onSignal(SignalKind.ANSWER, JSON.stringify(answer));
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
  }

  #applyVolume() {
    const volume = this.#deafened ? 0 : this.#outputVolume * this.#peerVolume;
    const boosted = volume > 1;
    this.#remote.volume = Math.min(1, volume);
    this.#remote.muted = this.#deafened || boosted;
    this.#boost.gain.value = boosted ? volume : 0;
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
