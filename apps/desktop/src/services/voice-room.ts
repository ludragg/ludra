import { SignalKind, type IceServer } from "@/protocol/ludra/v1/models_pb";
import { Microphone } from "@/services/microphone";
import { PeerLink } from "@/services/peer-link";
import type { ScreenQuality } from "@/services/screen";
import { selfSpeaking, speakingHold, speakingThreshold } from "@/services/voice";
import { preferences } from "@/stores/preferences.svelte";

export class VoiceRoom {
  onSignal: (peerId: string, kind: SignalKind, payload: string) => void = () => {};
  onSpeaking: (speaking: Set<string>) => void = () => {};
  onLatency: (milliseconds: number) => void = () => {};
  onPeerLatency: (peerId: string, milliseconds: number | null) => void = () => {};
  onPeerFailed: (peerId: string) => void = () => {};
  onPeerConnected: (peerId: string) => void = () => {};
  onScreen: (peerId: string, stream: MediaStream | null) => void = () => {};
  onCamera: (peerId: string, stream: MediaStream | null) => void = () => {};
  onConnecting: (connecting: boolean) => void = () => {};
  directWith: (peerId: string) => boolean = () => false;

  #iceServers: IceServer[];
  #selfId: string;
  #microphone: Microphone | null = null;
  #links = new Map<string, PeerLink>();
  #latencies = new Map<string, number>();
  #connecting = new Set<string>();
  #camera: MediaStreamTrack | null = null;
  #remoteCameras = new Map<string, string>();
  #meter: number | undefined;
  #muted = false;
  #deafened = false;
  #closed = false;

  constructor(iceServers: IceServer[], selfId: string) {
    this.#iceServers = iceServers;
    this.#selfId = selfId;
  }

  async start() {
    const microphone = await Microphone.open();
    if (this.#closed) {
      microphone.close();
      throw new Error("closed");
    }
    this.#microphone = microphone;
    this.#watchSpeaking();
  }

  get microphone(): Microphone | null {
    return this.#microphone;
  }

  async connect(peerId: string) {
    await this.#link(peerId)?.offer();
  }

  async receive(peerId: string, kind: SignalKind, payload: string) {
    if (kind === SignalKind.OFFER && this.#links.get(peerId)?.replacedBy(payload)) {
      this.onPeerFailed(peerId);
    }
    await this.#link(peerId)?.receive(kind, payload);
  }

  remove(peerId: string) {
    this.#links.get(peerId)?.close();
    this.#links.delete(peerId);
    this.#remoteCameras.delete(peerId);
    this.#latencies.delete(peerId);
    this.#setConnecting(peerId, false);
    this.onPeerLatency(peerId, null);
    this.onLatency(this.#latencies.size ? Math.min(...this.#latencies.values()) : 0);
  }

  refreshDirect(peerId: string, restart: boolean) {
    this.#links.get(peerId)?.setDirect(this.directWith(peerId), restart);
  }

  screen(peerId: string): MediaStream | null {
    return this.#links.get(peerId)?.screen ?? null;
  }

  async setScreen(peerId: string, stream: MediaStream | null, quality: ScreenQuality | null) {
    await this.#links.get(peerId)?.setScreen(stream, quality);
  }

  async setCamera(track: MediaStreamTrack | null) {
    this.#camera = track;
    await Promise.all([...this.#links.values()].map((link) => link.setCamera(track)));
  }

  setRemoteCamera(peerId: string, streamId: string) {
    this.#remoteCameras.set(peerId, streamId);
    this.#links.get(peerId)?.setRemoteCamera(streamId);
  }

  peers(): string[] {
    return [...this.#links.keys()];
  }

  setMuted(muted: boolean) {
    this.#muted = muted;
    this.#microphone?.setEnabled(!muted);
  }

  setDeafened(deafened: boolean) {
    this.#deafened = deafened;
    for (const link of this.#links.values()) {
      link.setDeafened(deafened);
    }
  }

  setOutputVolume(percent: number) {
    for (const link of this.#links.values()) {
      link.setOutputVolume(percent);
    }
  }

  setPeerVolume(peerId: string, percent: number) {
    this.#links.get(peerId)?.setPeerVolume(percent);
  }

  async setOutputDevice(deviceId: string) {
    await Promise.all([...this.#links.values()].map((link) => link.setOutputDevice(deviceId)));
  }

  close() {
    this.#closed = true;
    window.clearInterval(this.#meter);
    for (const link of this.#links.values()) {
      link.close();
    }
    this.#links.clear();
    this.#microphone?.close();
  }

  #link(peerId: string): PeerLink | null {
    const existing = this.#links.get(peerId);
    if (existing) {
      return existing;
    }
    if (this.#closed || !this.#microphone) {
      return null;
    }

    const link = new PeerLink(this.#iceServers, this.#microphone.track, this.#selfId > peerId, this.directWith(peerId));
    link.onScreen = (stream) => this.onScreen(peerId, stream);
    link.onCamera = (stream) => this.onCamera(peerId, stream);
    link.setRemoteCamera(this.#remoteCameras.get(peerId) ?? "");
    if (this.#camera) {
      link.setCamera(this.#camera);
    }
    link.onStatus = (connecting) => this.#setConnecting(peerId, connecting);
    link.onSignal = (kind, payload) => this.onSignal(peerId, kind, payload);
    link.onFailed = () => this.onPeerFailed(peerId);
    link.onConnected = () => this.onPeerConnected(peerId);
    link.onLatency = (milliseconds) => {
      this.#latencies.set(peerId, milliseconds);
      this.onPeerLatency(peerId, milliseconds);
      this.onLatency(Math.min(...this.#latencies.values()));
    };
    link.setOutputVolume(preferences.values.outputVolume);
    link.setPeerVolume(preferences.values.userVolumes[peerId] ?? 100);
    link.setDeafened(this.#deafened);
    link.setOutputDevice(preferences.values.outputDevice);
    this.#links.set(peerId, link);
    this.#setConnecting(peerId, true);
    return link;
  }

  #setConnecting(peerId: string, connecting: boolean) {
    const before = this.#connecting.size > 0;
    if (connecting) {
      this.#connecting.add(peerId);
    } else {
      this.#connecting.delete(peerId);
    }
    const after = this.#connecting.size > 0;
    if (before !== after) {
      this.onConnecting(after);
    }
  }

  #watchSpeaking() {
    const until = new Map<string, number>();
    let previous = "";

    this.#meter = window.setInterval(() => {
      const now = performance.now();
      if (selfSpeaking(this.#microphone, this.#muted)) {
        until.set(this.#selfId, now + speakingHold);
      }
      for (const [peerId, link] of this.#links) {
        if (link.level() > speakingThreshold) {
          until.set(peerId, now + speakingHold);
        }
      }

      const speaking = new Set([...until].filter(([, end]) => now < end).map(([id]) => id));
      const key = [...speaking].sort().join(",");
      if (key !== previous) {
        previous = key;
        this.onSpeaking(speaking);
      }
    }, 100);
  }
}
