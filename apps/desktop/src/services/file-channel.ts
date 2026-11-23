import type { IceServer } from "@/protocol/ludra/v1/models_pb";
import { describe } from "@/services/peer-link";

const gatherTimeout = 4000;
const relayGrace = 200;
const openTimeout = 30_000;

export class FileChannel {
  #connection: RTCPeerConnection;
  #configuration: RTCConfiguration;
  #channel: Promise<RTCDataChannel>;
  #resolve: (channel: RTCDataChannel) => void = () => {};

  constructor(iceServers: IceServer[], direct: boolean, warm = false) {
    this.#configuration = {
      iceServers: iceServers.map(({ urls, username, credential }) => ({ urls, username, credential })),
      iceTransportPolicy: direct ? "all" : "relay",
      iceCandidatePoolSize: warm ? 1 : 0,
    };
    this.#connection = new RTCPeerConnection(this.#configuration);
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

  allowDirect() {
    this.#configuration = { ...this.#configuration, iceTransportPolicy: "all" };
    this.#connection.setConfiguration(this.#configuration);
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
    const connection = this.#connection;
    if (connection.iceGatheringState === "complete") {
      return Promise.resolve();
    }
    const relayOnly = this.#configuration.iceTransportPolicy === "relay";
    return new Promise((resolve) => {
      let grace = 0;
      const finish = () => {
        window.clearTimeout(grace);
        window.clearTimeout(limit);
        connection.removeEventListener("icegatheringstatechange", state);
        connection.removeEventListener("icecandidate", candidate);
        resolve();
      };
      const state = () => {
        if (connection.iceGatheringState === "complete") {
          finish();
        }
      };
      const candidate = ({ candidate }: RTCPeerConnectionIceEvent) => {
        if (relayOnly && candidate?.type === "relay" && !grace) {
          grace = window.setTimeout(finish, relayGrace);
        }
      };
      const limit = window.setTimeout(finish, gatherTimeout);
      connection.addEventListener("icegatheringstatechange", state);
      connection.addEventListener("icecandidate", candidate);
    });
  }
}
