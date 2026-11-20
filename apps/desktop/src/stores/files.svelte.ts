import { invoke } from "@tauri-apps/api/core";
import { FileSignalKind, SignalKind, type FileSignal, type Message } from "@/protocol/ludra/v1/models_pb";
import { ErrorCode } from "@/protocol/ludra/v1/server_pb";
import { ServerError, type Client } from "@/services/client";
import { FileChannel } from "@/services/file-channel";
import { trust } from "@/stores/trust.svelte";

export type TransferState =
  | "waiting"
  | "connecting"
  | "receiving"
  | "done"
  | "offline"
  | "friendsOnly"
  | "unavailable"
  | "expired"
  | "failed"
  | "canceled";

export type Transfer = { state: TransferState; received: number; total: number; speed: number; path: string };

type Shared = { name: string; size: number; available: boolean };

const sendSize = 64 * 1024;
const readSize = 1024 * 1024;
const flushSize = 1024 * 1024;
const offerTimeout = 20_000;
const answerTimeout = 30_000;
const closeTimeout = 60_000;
const highWater = 8 * 1024 * 1024;
const lowWater = 1024 * 1024;
const maxServing = 3;
const progressEvery = 100;

class TimeoutError extends Error {}

function signed(transferId: string): string {
  return `file:${transferId}`;
}

function write(download: number, data: Uint8Array) {
  return invoke("write_download", data, { headers: { "x-download": String(download) } });
}

function join(parts: Uint8Array[], size: number): Uint8Array {
  const data = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    data.set(part, offset);
    offset += part.length;
  }
  return data;
}

function drained(channel: RTCDataChannel): Promise<void> {
  return new Promise((resolve) => channel.addEventListener("bufferedamountlow", () => resolve(), { once: true }));
}

function closed(channel: RTCDataChannel): Promise<void> {
  return new Promise((resolve) => {
    if (channel.readyState === "closed") {
      resolve();
      return;
    }
    channel.addEventListener("close", () => resolve(), { once: true });
    window.setTimeout(resolve, closeTimeout);
  });
}

function receive(
  channel: RTCDataChannel,
  download: number,
  total: number,
  onProgress: (received: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let received = 0;
    let parts: Uint8Array[] = [];
    let pending = 0;
    let writing: Promise<unknown> = Promise.resolve();

    const flush = () => {
      if (pending === 0) {
        return;
      }
      const data = join(parts, pending);
      parts = [];
      pending = 0;
      writing = writing.then(() => write(download, data));
      writing.catch(reject);
    };

    channel.onmessage = ({ data }) => {
      if (typeof data === "string") {
        if (data === "done" && received === total) {
          flush();
          writing.then(() => resolve(), reject);
        } else {
          reject(new Error("unexpected end"));
        }
        return;
      }
      const chunk = new Uint8Array(data as ArrayBuffer);
      received += chunk.length;
      if (received > total) {
        reject(new Error("too much data"));
        channel.close();
        return;
      }
      parts.push(chunk);
      pending += chunk.length;
      if (pending >= flushSize) {
        flush();
      }
      onProgress(received);
    };
    channel.onclose = () => reject(new Error("channel closed"));
    channel.onerror = () => reject(new Error("channel failed"));
  });
}

class FileStore {
  transfers = $state<Record<string, Transfer>>({});

  #client: Client | null = null;
  #waiting = new Map<string, { resolve: (signal: FileSignal) => void; reject: (error: Error) => void }>();
  #cancels = new Map<string, () => void>();
  #canceled = new Set<string>();
  #serving = 0;
  #updated = new Map<string, number>();

  attach(client: Client) {
    this.#client = client;
    client.onFileSignal = (signal) => this.#signal(signal);
  }

  detach() {
    for (const cancel of this.#cancels.values()) {
      cancel();
    }
    this.#client = null;
    this.transfers = {};
  }

  cancel(messageId: string) {
    this.#cancels.get(messageId)?.();
  }

  reveal(messageId: string) {
    void invoke("reveal_file", { id: messageId }).catch(() => undefined);
  }

  mediaPath(messageId: string): Promise<string | null> {
    return invoke<string | null>("media_path", { id: messageId }).catch(() => null);
  }

  shared(messageId: string): Promise<Shared | null> {
    return invoke<Shared | null>("shared_file", { id: messageId }).catch(() => null);
  }

  async saveBytes(name: string, data: Uint8Array): Promise<string | null> {
    const path = await invoke<string | null>("save_target", { name });
    if (!path) {
      return null;
    }
    const download = await invoke<number>("begin_download", { path });
    try {
      await write(download, data);
      return await invoke<string>("finish_download", { id: download });
    } catch (cause) {
      await invoke("abort_download", { id: download });
      throw cause;
    }
  }

  async download(message: Message) {
    const file = message.file;
    if (!file?.direct || !this.#client || this.#busy(message.id)) {
      return;
    }
    const path = await invoke<string | null>("save_target", { name: file.name });
    if (!path) {
      return;
    }
    await this.#downloadDirect(message, path);
  }

  #busy(messageId: string): boolean {
    const state = this.transfers[messageId]?.state;
    return state === "waiting" || state === "connecting" || state === "receiving";
  }

  async #downloadDirect(message: Message, path: string) {
    const client = this.#client!;
    const total = Number(message.file!.size);
    const senderId = message.senderId;
    const transferId = crypto.randomUUID();
    let channel: FileChannel | null = null;
    let download: number | null = null;
    let canceled = false;

    this.#cancels.set(message.id, () => {
      canceled = true;
      channel?.close();
      this.#waiting.get(transferId)?.reject(new Error("canceled"));
      void client.fileSignal(message.id, transferId, senderId, FileSignalKind.CANCEL).catch(() => undefined);
    });
    this.#start(message.id, "waiting", total);

    try {
      const offered = this.#await(transferId, offerTimeout);
      offered.catch(() => undefined);
      const { iceServers } = await client.requestFile(message.id, transferId);
      const offer = await offered;
      if (offer.kind === FileSignalKind.UNAVAILABLE) {
        this.#fail(message.id, "expired");
        return;
      }

      this.#start(message.id, "connecting", total);
      channel = new FileChannel(iceServers);
      const answer = await channel.answer(
        await trust.open(signed(transferId), senderId, SignalKind.OFFER, offer.payload),
      );
      await client.fileSignal(
        message.id,
        transferId,
        senderId,
        FileSignalKind.ANSWER,
        await trust.seal(signed(transferId), senderId, SignalKind.ANSWER, answer),
      );
      const open = await channel.open();
      download = await invoke<number>("begin_download", { path, key: message.id });
      this.#start(message.id, "receiving", total);
      const started = performance.now();
      await receive(open, download, total, (received) => this.#progress(message.id, received, started));
      this.#done(message.id, await invoke<string>("finish_download", { id: download }));
      open.close();
    } catch (cause) {
      if (download !== null) {
        await invoke("abort_download", { id: download });
      }
      this.#fail(
        message.id,
        canceled
          ? "canceled"
          : cause instanceof ServerError && cause.code === ErrorCode.UNAVAILABLE
            ? "offline"
            : cause instanceof ServerError && cause.code === ErrorCode.FORBIDDEN
              ? "friendsOnly"
              : cause instanceof TimeoutError
                ? "unavailable"
                : "failed",
      );
    } finally {
      channel?.close();
      this.#waiting.delete(transferId);
      this.#cancels.delete(message.id);
    }
  }

  async #serve(signal: FileSignal) {
    const client = this.#client;
    const shared = await this.shared(signal.messageId);
    if (!client || !shared) {
      return;
    }
    if (!shared.available) {
      await client
        .fileSignal(signal.messageId, signal.transferId, signal.peerId, FileSignalKind.UNAVAILABLE)
        .catch(() => undefined);
      return;
    }
    if (this.#serving >= maxServing) {
      return;
    }
    this.#serving++;
    const { messageId, transferId, peerId } = signal;
    const channel = new FileChannel(signal.iceServers);

    try {
      const answered = this.#await(transferId, answerTimeout);
      answered.catch(() => undefined);
      const offer = await channel.offer();
      await client.fileSignal(
        messageId,
        transferId,
        peerId,
        FileSignalKind.OFFER,
        await trust.seal(signed(transferId), peerId, SignalKind.OFFER, offer),
      );
      const answer = await answered;
      if (answer.kind !== FileSignalKind.ANSWER) {
        return;
      }
      await channel.accept(await trust.open(signed(transferId), peerId, SignalKind.ANSWER, answer.payload));
      const open = await channel.open();
      open.bufferedAmountLowThreshold = lowWater;

      for (let offset = 0; offset < shared.size;) {
        if (this.#canceled.has(transferId) || open.readyState !== "open") {
          return;
        }
        const buffer = await invoke<ArrayBuffer>("read_shared", { id: messageId, offset, length: readSize });
        if (buffer.byteLength === 0) {
          return;
        }
        for (let start = 0; start < buffer.byteLength; start += sendSize) {
          if (open.bufferedAmount > highWater) {
            await drained(open);
          }
          open.send(buffer.slice(start, start + sendSize));
        }
        offset += buffer.byteLength;
      }
      open.send("done");
      await closed(open);
    } catch {
      return;
    } finally {
      channel.close();
      this.#waiting.delete(transferId);
      this.#canceled.delete(transferId);
      this.#serving--;
    }
  }

  #signal(signal: FileSignal) {
    switch (signal.kind) {
      case FileSignalKind.REQUEST:
        void this.#serve(signal);
        break;
      case FileSignalKind.CANCEL:
        this.#canceled.add(signal.transferId);
        this.#waiting.get(signal.transferId)?.reject(new Error("canceled"));
        break;
      default:
        this.#waiting.get(signal.transferId)?.resolve(signal);
    }
  }

  #await(transferId: string, timeout: number): Promise<FileSignal> {
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new TimeoutError("timeout")), timeout);
      this.#waiting.set(transferId, {
        resolve: (signal) => {
          window.clearTimeout(timer);
          resolve(signal);
        },
        reject: (error) => {
          window.clearTimeout(timer);
          reject(error);
        },
      });
    });
  }

  #start(messageId: string, state: TransferState, total: number) {
    const current = this.transfers[messageId];
    this.transfers[messageId] = { state, received: current?.received ?? 0, total, speed: 0, path: "" };
  }

  #progress(messageId: string, received: number, started: number) {
    const transfer = this.transfers[messageId];
    const now = performance.now();
    if (!transfer || (received < transfer.total && now - (this.#updated.get(messageId) ?? 0) < progressEvery)) {
      return;
    }
    this.#updated.set(messageId, now);
    transfer.received = received;
    transfer.speed = received / Math.max(0.001, (now - started) / 1000);
  }

  #done(messageId: string, path: string) {
    const transfer = this.transfers[messageId];
    if (transfer) {
      transfer.state = "done";
      transfer.received = transfer.total;
      transfer.path = path;
    }
  }

  #fail(messageId: string, state: TransferState) {
    const transfer = this.transfers[messageId];
    if (transfer) {
      transfer.state = state;
    }
  }
}

export const files = new FileStore();
