import type { IceServer } from "@/protocol/ludra/v1/models_pb";
import { describe } from "@/services/peer-link";

const gatherLimit = 8000;
const relayGrace = 150;
const directGrace = 1000;

type LowLatencyReceiver = RTCRtpReceiver & { jitterBufferTarget?: number | null };

function gathered(connection: RTCPeerConnection, grace: number): Promise<void> {
  return new Promise((resolve) => {
    let soon: number | undefined;
    const done = () => {
      window.clearTimeout(limit);
      window.clearTimeout(soon);
      resolve();
    };
    const limit = window.setTimeout(done, gatherLimit);
    connection.addEventListener("icegatheringstatechange", () => {
      if (connection.iceGatheringState === "complete") {
        done();
      }
    });
    connection.addEventListener("icecandidate", ({ candidate }) => {
      if (candidate?.type === "relay") {
        soon ??= window.setTimeout(done, grace);
      }
    });
  });
}

export class StreamReceiver {
  onStream: () => void = () => {};
  onFailed: () => void = () => {};
  stream: MediaStream | null = null;

  #connection: RTCPeerConnection;
  #grace: number;
  #closed = false;

  constructor(iceServers: IceServer[], direct: boolean) {
    this.#grace = direct ? directGrace : relayGrace;
    this.#connection = new RTCPeerConnection({
      iceServers: iceServers.map(({ urls, username, credential }) => ({ urls, username, credential })),
      iceTransportPolicy: direct ? "all" : "relay",
    });
    this.#connection.ontrack = ({ receiver, track }) => {
      (receiver as LowLatencyReceiver).jitterBufferTarget = 0;
      const show = () => {
        if (!this.#closed) {
          this.stream = new MediaStream([track]);
          this.onStream();
        }
      };
      if (track.muted) {
        track.addEventListener("unmute", show, { once: true });
      } else {
        show();
      }
    };
    this.#connection.onconnectionstatechange = () => {
      if (this.#connection.connectionState === "failed" && !this.#closed) {
        this.onFailed();
      }
    };
  }

  async answer(offerPayload: string): Promise<string> {
    await this.#connection.setRemoteDescription(JSON.parse(offerPayload));
    const answer = await this.#connection.createAnswer();
    const ready = gathered(this.#connection, this.#grace);
    await this.#connection.setLocalDescription(answer);
    await ready;
    return describe(this.#connection.localDescription);
  }

  close() {
    this.#closed = true;
    this.#connection.close();
    this.stream = null;
  }
}
