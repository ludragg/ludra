import type { IceServer } from "@/protocol/ludra/v1/models_pb";
import { describe } from "@/services/peer-link";

const gatherTimeout = 6000;
const openTimeout = 30_000;

export class FileChannel {
  #connection: RTCPeerConnection;
  #channel: Promise<RTCDataChannel>;
  #resolve: (channel: RTCDataChannel) => void = () => {};

  constructor(iceServers: IceServer[], direct: boolean) {
    this.#connection = new RTCPeerConnection({
      iceServers: iceServers.map(({ urls, username, credential }) => ({ urls, username, credential })),
      iceTransportPolicy: direct ? "all" : "relay",
    });
    this.#channel = new Promise((resolve, reject) => {
      this.#resolve = resolve;
      window.setTimeout(() => reject(new Error("channel timeout")), openTimeout);
    });
    this.#connection.ondatachannel = ({ channel }) => this.#ready(channel);
  }

  async offer(): Promise<string> {
    this.#ready(this.#connection.createDataChannel("file", { ordered: true }));
    await this.#connection.setLocalDescription();
    await this.#gathered();
    return describe(this.#connection.localDescription);
  }

  async answer(offer: string): Promise<string> {
    await this.#connection.setRemoteDescription(JSON.parse(offer));
    await this.#connection.setLocalDescription();
    await this.#gathered();
    return describe(this.#connection.localDescription);
  }

  async accept(answer: string) {
    await this.#connection.setRemoteDescription(JSON.parse(answer));
  }

  open(): Promise<RTCDataChannel> {
    return this.#channel;
  }

  close() {
    this.#connection.close();
  }

  #ready(channel: RTCDataChannel) {
    channel.binaryType = "arraybuffer";
    if (channel.readyState === "open") {
      this.#resolve(channel);
    } else {
      channel.addEventListener("open", () => this.#resolve(channel), { once: true });
    }
  }

  #gathered(): Promise<void> {
    if (this.#connection.iceGatheringState === "complete") {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const done = () => {
        if (this.#connection.iceGatheringState === "complete") {
          this.#connection.removeEventListener("icegatheringstatechange", done);
          resolve();
        }
      };
      this.#connection.addEventListener("icegatheringstatechange", done);
      window.setTimeout(resolve, gatherTimeout);
    });
  }
}
