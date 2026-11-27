import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

import { SignalKind, type IceServer } from "@/protocol/ludra/v1/models_pb";
import { describe } from "@/services/peer-link";
import type { ScreenQuality } from "@/services/screen";
import { hardwareEncoders } from "@/services/stream-encoders";
import { streamClosed } from "@/services/stream-signal";

const connectLimit = 20_000;

type PeerEvent = { viewer: string; connected: boolean };

type Viewer = { timer: number; direct: boolean };

export class StreamSender {
  onSignal: (viewerId: string, kind: SignalKind, payload: string) => void = () => {};
  onFallback: (viewerId: string) => void = () => {};
  onBroken: () => void = () => {};

  #viewers = new Map<string, Viewer>();
  #listeners: Promise<UnlistenFn>[];
  #broken = false;
  #compatibility = false;
  #profile = "";
  #stopped = false;

  constructor() {
    this.#listeners = [
      listen<PeerEvent>("stream-peer", ({ payload }) => this.#peerChanged(payload)),
      listen("stream-broken", () => this.#break()),
    ];
  }

  async prepare() {
    this.#broken = false;
    await Promise.all(this.#listeners);
  }

  apply({ resolution, fps, mode, encoder }: ScreenQuality) {
    const profile = `${resolution} ${fps} ${mode} ${encoder}`;
    const changed = !!this.#profile && profile !== this.#profile;
    this.#profile = profile;
    this.#compatibility = encoder === "compatibility";
    if (!changed) {
      return;
    }
    for (const viewerId of [...this.#viewers.keys()]) {
      if (this.#compatibility) {
        this.#fallback(viewerId);
      } else {
        this.remove(viewerId);
      }
    }
  }

  has(viewerId: string): boolean {
    return this.#viewers.has(viewerId);
  }

  async add(viewerId: string, iceServers: IceServer[], direct: boolean): Promise<boolean> {
    if (this.#compatibility || !(await hardwareEncoders()).length || this.#broken || this.#stopped) {
      return false;
    }
    this.remove(viewerId);
    const viewer = {
      timer: window.setTimeout(() => this.#fallback(viewerId), connectLimit),
      direct,
    };
    this.#viewers.set(viewerId, viewer);
    try {
      await Promise.all(this.#listeners);
      const sdp = await invoke<string>("stream_offer", {
        viewer: viewerId,
        servers: iceServers.map(({ urls, username, credential }) => ({ urls, username, credential })),
        direct,
      });
      if (this.#viewers.get(viewerId) !== viewer) {
        if (!this.#viewers.has(viewerId)) {
          invoke("stream_close", { viewer: viewerId }).catch(() => undefined);
        }
        return this.#viewers.has(viewerId);
      }
      this.onSignal(viewerId, SignalKind.STREAM_OFFER, describe({ type: "offer", sdp }));
      return true;
    } catch {
      this.#drop(viewerId);
      return false;
    }
  }

  async redirect(viewerId: string, iceServers: IceServer[], direct: boolean) {
    const viewer = this.#viewers.get(viewerId);
    if (!viewer || viewer.direct === direct) {
      return;
    }
    if (!(await this.add(viewerId, iceServers, direct)) && !this.#stopped) {
      this.onSignal(viewerId, SignalKind.STREAM_OFFER, streamClosed);
      this.onFallback(viewerId);
    }
  }

  async answer(viewerId: string, payload: string) {
    if (!this.#viewers.has(viewerId)) {
      return;
    }
    const { sdp } = JSON.parse(payload) as RTCSessionDescriptionInit;
    await invoke("stream_answer", { viewer: viewerId, sdp }).catch(() => this.#fallback(viewerId));
  }

  remove(viewerId: string) {
    if (this.#drop(viewerId)) {
      invoke("stream_close", { viewer: viewerId }).catch(() => undefined);
    }
  }

  stop() {
    this.#stopped = true;
    for (const viewerId of [...this.#viewers.keys()]) {
      this.remove(viewerId);
    }
    for (const listener of this.#listeners) {
      listener.then((unlisten) => unlisten()).catch(() => undefined);
    }
  }

  #drop(viewerId: string): boolean {
    window.clearTimeout(this.#viewers.get(viewerId)?.timer);
    return this.#viewers.delete(viewerId);
  }

  #peerChanged({ viewer, connected }: PeerEvent) {
    const entry = this.#viewers.get(viewer);
    if (!entry) {
      return;
    }
    if (!connected) {
      this.#fallback(viewer);
      return;
    }
    window.clearTimeout(entry.timer);
  }

  #fallback(viewerId: string) {
    if (!this.#viewers.has(viewerId)) {
      return;
    }
    this.remove(viewerId);
    this.onSignal(viewerId, SignalKind.STREAM_OFFER, streamClosed);
    this.onFallback(viewerId);
  }

  #break() {
    if (!this.#broken) {
      this.#broken = true;
      this.onBroken();
    }
    for (const viewerId of [...this.#viewers.keys()]) {
      this.#fallback(viewerId);
    }
  }
}
