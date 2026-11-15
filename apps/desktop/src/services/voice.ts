import type { IceServer, SignalKind } from "@/protocol/ludra/v1/models_pb";
import { Microphone } from "@/services/microphone";
import { PeerLink } from "@/services/peer-link";
import type { ScreenQuality } from "@/services/screen";

export const speakingThreshold = 0.004;
export const speakingHold = 400;

export function selfSpeaking(microphone: Microphone | null, muted: boolean): boolean {
  return !!microphone && !muted && microphone.transmitting && microphone.level() > speakingThreshold;
}

export class VoiceSession {
  onSignal: (kind: SignalKind, payload: string) => void = () => {};
  onSpeaking: (self: boolean, peer: boolean) => void = () => {};
  onConnected: () => void = () => {};
  onFailed: () => void = () => {};
  onLatency: (milliseconds: number) => void = () => {};
  onScreen: (stream: MediaStream | null) => void = () => {};

  #iceServers: IceServer[];
  #polite: boolean;
  #microphone: Microphone | null = null;
  #link: PeerLink | null = null;
  #meter: number | undefined;
  #muted = false;
  #closed = false;

  constructor(iceServers: IceServer[], polite: boolean) {
    this.#iceServers = iceServers;
    this.#polite = polite;
  }

  async start(outputDevice: string, outputVolume: number) {
    const microphone = await Microphone.open();
    if (this.#closed) {
      microphone.close();
      throw new Error("closed");
    }
    this.#microphone = microphone;
    const link = new PeerLink(this.#iceServers, this.#microphone.track, this.#polite);
    link.onScreen = (stream) => this.onScreen(stream);
    link.onSignal = (kind, payload) => this.onSignal(kind, payload);
    link.onConnected = () => this.onConnected();
    link.onFailed = () => this.onFailed();
    link.onLatency = (milliseconds) => this.onLatency(milliseconds);
    link.setOutputVolume(outputVolume);
    this.#link = link;
    await link.setOutputDevice(outputDevice);
    this.#watchSpeaking();
  }

  async offer() {
    await this.#link?.offer();
  }

  async receive(kind: SignalKind, payload: string) {
    await this.#link?.receive(kind, payload);
  }

  async setScreen(stream: MediaStream | null, quality: ScreenQuality | null) {
    await this.#link?.setScreen(stream, quality);
  }

  get screen(): MediaStream | null {
    return this.#link?.screen ?? null;
  }

  get microphone(): Microphone | null {
    return this.#microphone;
  }

  setMuted(muted: boolean) {
    this.#muted = muted;
    this.#microphone?.setEnabled(!muted);
  }

  setDeafened(deafened: boolean) {
    this.#link?.setDeafened(deafened);
  }

  setOutputVolume(percent: number) {
    this.#link?.setOutputVolume(percent);
  }

  setPeerVolume(percent: number) {
    this.#link?.setPeerVolume(percent);
  }

  async setOutputDevice(deviceId: string) {
    await this.#link?.setOutputDevice(deviceId);
  }

  close() {
    this.#closed = true;
    window.clearInterval(this.#meter);
    this.#link?.close();
    this.#microphone?.close();
  }

  #watchSpeaking() {
    let selfUntil = 0;
    let peerUntil = 0;
    let previous = "";

    this.#meter = window.setInterval(() => {
      const now = performance.now();
      if (selfSpeaking(this.#microphone, this.#muted)) {
        selfUntil = now + speakingHold;
      }
      if ((this.#link?.level() ?? 0) > speakingThreshold) {
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
