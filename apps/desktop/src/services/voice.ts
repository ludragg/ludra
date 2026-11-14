import type { IceServer } from "@/protocol/ludra/v1/models_pb";
import { SignalKind } from "@/protocol/ludra/v1/models_pb";
import { Microphone } from "@/services/microphone";

type SinkElement = HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> };
type SinkContext = AudioContext & { setSinkId?: (id: string) => Promise<void> };

const speakingThreshold = 0.004;
const speakingHold = 400;

export class VoiceSession {
  onSignal: (kind: SignalKind, payload: string) => void = () => {};
  onSpeaking: (self: boolean, peer: boolean) => void = () => {};
  onConnected: () => void = () => {};
  onFailed: () => void = () => {};
  onLatency: (milliseconds: number) => void = () => {};

  #connection: RTCPeerConnection;
  #microphone: Microphone | null = null;
  #peerContext = new AudioContext() as SinkContext;
  #peerAnalyser = this.#peerContext.createAnalyser();
  #peerBoost = this.#peerContext.createGain();
  #outputVolume = 1;
  #peerVolume = 1;
  #deafened = false;
  #remote = new Audio() as SinkElement;
  #pending: RTCIceCandidateInit[] = [];
  #meter: number | undefined;
  #stats: number | undefined;
  #muted = false;

  constructor(iceServers: IceServer[]) {
    this.#connection = new RTCPeerConnection({
      iceServers: iceServers.map(({ urls, username, credential }) => ({ urls, username, credential })),
      iceTransportPolicy: "relay",
    });

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
    this.#connection.ontrack = ({ streams, track }) => this.#playRemote(streams[0] ?? new MediaStream([track]));
  }

  async start(outputDevice: string, outputVolume: number) {
    this.#microphone = await Microphone.open();
    const track = this.#microphone.track;
    this.#connection.addTrack(track, new MediaStream([track]));
    this.setOutputVolume(outputVolume);
    await this.setOutputDevice(outputDevice);
    this.#watchSpeaking();
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

  get microphone(): Microphone | null {
    return this.#microphone;
  }

  setMuted(muted: boolean) {
    this.#muted = muted;
    this.#microphone?.setEnabled(!muted);
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
    await this.#peerContext.setSinkId?.(deviceId).catch(() => undefined);
  }

  #applyVolume() {
    const volume = this.#deafened ? 0 : this.#outputVolume * this.#peerVolume;
    const boosted = volume > 1;
    this.#remote.volume = Math.min(1, volume);
    this.#remote.muted = this.#deafened || boosted;
    this.#peerBoost.gain.value = boosted ? volume : 0;
  }

  close() {
    window.clearInterval(this.#meter);
    window.clearInterval(this.#stats);
    this.#connection.close();
    this.#microphone?.close();
    this.#remote.pause();
    this.#remote.srcObject = null;
    this.#peerContext.close();
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

  #playRemote(stream: MediaStream) {
    this.#remote.srcObject = stream;
    this.#remote.play().catch(() => undefined);
    const source = this.#peerContext.createMediaStreamSource(stream);
    source.connect(this.#peerAnalyser);
    source.connect(this.#peerBoost).connect(this.#peerContext.destination);
    this.#applyVolume();
  }

  #watchSpeaking() {
    const buffer = new Float32Array(this.#peerAnalyser.fftSize);
    let selfUntil = 0;
    let peerUntil = 0;
    let previous = "";

    this.#meter = window.setInterval(() => {
      const now = performance.now();
      const microphone = this.#microphone;
      if (microphone && !this.#muted && microphone.transmitting && microphone.level() > speakingThreshold) {
        selfUntil = now + speakingHold;
      }

      this.#peerAnalyser.getFloatTimeDomainData(buffer);
      let sum = 0;
      for (const sample of buffer) {
        sum += sample * sample;
      }
      if (Math.sqrt(sum / buffer.length) > speakingThreshold) {
        peerUntil = now + speakingHold;
      }

      const self = now < selfUntil;
      const peer = now < peerUntil;
      if (`${self}${peer}` !== previous) {
        previous = `${self}${peer}`;
        this.onSpeaking(self, peer);
      }
    }, 100);
  }
}
