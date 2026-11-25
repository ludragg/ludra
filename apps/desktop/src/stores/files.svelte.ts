import { report } from "@/services/diagnostics";
import { invoke } from "@tauri-apps/api/core";
import { autoDownloads, fileKey, isVoice } from "@/helpers/files";
import { FileSignalKind, SignalKind, type FileSignal, type Message } from "@/protocol/ludra/v1/models_pb";
import { ErrorCode } from "@/protocol/ludra/v1/server_pb";
import { ServerError, type Client } from "@/services/client";
import { FileChannel } from "@/services/file-channel";
import { preferences } from "@/stores/preferences.svelte";
import { trust } from "@/stores/trust.svelte";

export type TransferState =
  "waiting" | "receiving" | "done" | "offline" | "friendsOnly" | "unavailable" | "expired" | "failed" | "canceled";

export type Transfer = { state: TransferState; received: number; total: number; speed: number; path: string };

type Shared = { name: string; size: number; available: boolean };

const sendSize = 256 * 1024;
const readSize = 1024 * 1024;
const flushSize = 1024 * 1024;
const offerTimeout = 20_000;
const answerTimeout = 30_000;
const closeTimeout = 60_000;
const highWater = 2 * 1024 * 1024;
const lowWater = 512 * 1024;
const maxServing = 8;
const parallelFrom = 4 * 1024 * 1024;
const largeFile = 32 * 1024 * 1024;
const maxConnections = 4;
const segmentAttempts = 2;
const progressEvery = 100;
const maxAutomatic = 2;
const automaticBudget = 8;
const automaticWindow = 10 * 60_000;

class TimeoutError extends Error {}
class ExpiredError extends Error {}
class CanceledError extends Error {}
class AbandonedError extends Error {}

type Segment = { offset: number; length: number };

type Run = {
  canceled: boolean;
  byUser: boolean;
  channels: Set<FileChannel>;
  transferIds: Set<string>;
  received: number[];
  started: number | null;
};

function signed(transferId: string): string {
  return `file:${transferId}`;
}

function direct(): boolean {
  return preferences.values.directCalls && preferences.values.directDownloads;
}

function agreed(description: string): boolean {
  return description.includes(" typ srflx");
}

function write(download: number, data: Uint8Array, offset: number) {
  return invoke("write_download", data, { headers: { "x-download": String(download), "x-offset": String(offset) } });
}

function segmentsOf(total: number): Segment[] {
  const count = total < parallelFrom ? 1 : total < largeFile ? 2 : maxConnections;
  const size = Math.ceil(total / count / readSize) * readSize;
  const segments: Segment[] = [];
  for (let offset = 0; offset < total; offset += size) {
    segments.push({ offset, length: Math.min(size, total - offset) });
  }
  return segments;
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
  segment: Segment,
  onProgress: (received: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let received = 0;
    let flushed = 0;
    let parts: Uint8Array[] = [];
    let pending = 0;
    let writing: Promise<unknown> = Promise.resolve();

    const flush = () => {
      if (pending === 0) {
        return;
      }
      const data = join(parts, pending);
      const at = segment.offset + flushed;
      parts = [];
      flushed += pending;
      pending = 0;
      writing = writing.then(() => write(download, data, at));
      writing.catch(reject);
    };

    channel.onmessage = ({ data }) => {
      if (typeof data === "string") {
        if (data === "done" && received === segment.length) {
          flush();
          writing.then(() => resolve(), reject);
        } else {
          reject(new Error("unexpected end"));
        }
        return;
      }
      const chunk = new Uint8Array(data as ArrayBuffer);
      received += chunk.length;
      if (received > segment.length) {
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
  #queue: Message[] = [];
  #automatic = 0;
  #started: number[] = [];

  attach(client: Client) {
    this.#client = client;
    client.onFileSignal = (signal) => this.#signal(signal);
  }

  detach() {
    for (const cancel of this.#cancels.values()) {
      cancel();
    }
    this.#client = null;
    this.#queue = [];
    this.#started = [];
    this.transfers = {};
  }

  cancel(messageId: string) {
    this.#cancels.get(messageId)?.();
  }

  reveal(messageId: string) {
    void invoke("reveal_file", { id: messageId }).catch(() => undefined);
  }

  mediaPath(message: Message): Promise<string | null> {
    const size = Number(message.file?.size ?? 0);
    return invoke<string | null>("media_path", { id: message.id, size }).catch(() => null);
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
      await write(download, data, 0);
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
    if (preferences.values.askDownloadLocation) {
      const path = await invoke<string | null>("save_target", { name: file.name });
      if (path) {
        await this.#downloadDirect(message, path);
      }
      return;
    }
    this.#start(message.id, "waiting", Number(file.size));
    try {
      await this.#downloadDirect(message, await invoke<string>("folder_target", { name: file.name }));
    } catch {
      this.#cancels.delete(message.id);
      this.#fail(message.id, "failed");
    }
  }

  async listen(message: Message) {
    const file = message.file;
    if (!file?.direct || !this.#client || this.#busy(message.id)) {
      return;
    }
    this.#start(message.id, "waiting", Number(file.size));
    try {
      const target = isVoice(file.mime) ? "voice_target" : "auto_target";
      const path = await invoke<string>(target, { name: file.name });
      await this.#downloadDirect(message, path);
    } catch {
      this.#cancels.delete(message.id);
      this.#fail(message.id, "failed");
    }
  }

  autoDownload(message: Message) {
    const file = message.file;
    const size = Number(file?.size ?? 0);
    if (
      !preferences.values.autoDownload ||
      !file?.direct ||
      !this.#client ||
      this.#busy(message.id) ||
      !autoDownloads(file.name, file.mime, size, preferences.values.autoDownloadLimit)
    ) {
      return;
    }
    const now = Date.now();
    this.#started = this.#started.filter((time) => now - time < automaticWindow);
    if (this.#started.length >= automaticBudget) {
      return;
    }
    this.#started.push(now);
    this.#start(message.id, "waiting", size);
    this.#cancels.set(message.id, () => {
      this.#queue = this.#queue.filter(({ id }) => id !== message.id);
      this.#cancels.delete(message.id);
      this.#fail(message.id, "canceled");
    });
    this.#queue.push(message);
    this.#pump();
  }

  #pump() {
    while (this.#automatic < maxAutomatic && this.#queue.length > 0) {
      const message = this.#queue.shift()!;
      this.#automatic++;
      void this.#downloadAutomatic(message).finally(() => {
        this.#automatic--;
        this.#pump();
      });
    }
  }

  async #downloadAutomatic(message: Message) {
    try {
      const path = await invoke<string>("auto_target", { name: message.file!.name });
      await this.#downloadDirect(message, path);
    } catch {
      this.#cancels.delete(message.id);
      this.#fail(message.id, "failed");
    }
  }

  #busy(messageId: string): boolean {
    const state = this.transfers[messageId]?.state;
    return state === "waiting" || state === "receiving";
  }

  async #downloadDirect(message: Message, path: string) {
    const client = this.#client!;
    const total = Number(message.file!.size);
    const segments = segmentsOf(total);
    const run: Run = {
      canceled: false,
      byUser: false,
      channels: new Set(),
      transferIds: new Set(),
      received: segments.map(() => 0),
      started: null,
    };
    let download: number | null = null;

    this.#cancels.set(message.id, () => {
      run.canceled = true;
      run.byUser = true;
      for (const channel of run.channels) {
        channel.close();
      }
      for (const transferId of run.transferIds) {
        this.#waiting.get(transferId)?.reject(new CanceledError("canceled"));
        void client.fileSignal(message.id, transferId, message.senderId, FileSignalKind.CANCEL).catch(() => undefined);
      }
    });
    this.#start(message.id, "waiting", total);
    void trust.prepare([message.senderId]).catch(() => undefined);

    try {
      download = await invoke<number>("begin_download", { path, key: message.id });
      const id = download;
      await Promise.all(segments.map((_, index) => this.#fetchSegment(message, run, id, segments, index)));
      this.#done(message.id, await invoke<string>("finish_download", { id }));
    } catch (cause) {
      if (!run.byUser && !(cause instanceof ExpiredError)) {
        report("warning", "files", "download failed", cause);
      }
      run.canceled = true;
      for (const channel of run.channels) {
        channel.close();
      }
      if (download !== null) {
        await invoke("abort_download", { id: download });
      }
      this.#fail(
        message.id,
        run.byUser
          ? "canceled"
          : cause instanceof ExpiredError
            ? "expired"
            : cause instanceof ServerError && cause.code === ErrorCode.UNAVAILABLE
              ? "offline"
              : cause instanceof ServerError && cause.code === ErrorCode.FORBIDDEN
                ? "friendsOnly"
                : cause instanceof TimeoutError
                  ? "unavailable"
                  : "failed",
      );
    } finally {
      this.#cancels.delete(message.id);
    }
  }

  async #fetchSegment(message: Message, run: Run, download: number, segments: Segment[], index: number) {
    let failure: unknown = null;
    for (let attempt = 0; attempt < segmentAttempts; attempt++) {
      try {
        run.received[index] = 0;
        await this.#attemptSegment(message, run, download, segments, index);
        return;
      } catch (cause) {
        if (cause instanceof AbandonedError) {
          return;
        }
        failure = cause;
        if (run.canceled || cause instanceof CanceledError || cause instanceof ExpiredError || index === 0) {
          break;
        }
      }
    }
    throw failure;
  }

  async #attemptSegment(message: Message, run: Run, download: number, segments: Segment[], index: number) {
    const client = this.#client!;
    const senderId = message.senderId;
    const transferId = crypto.randomUUID();
    const total = Number(message.file!.size);
    const wantsDirect = direct();
    const requested = segments[index];
    const ranged = segments.length > 1;
    let channel: FileChannel | null = null;

    run.transferIds.add(transferId);
    try {
      const offered = this.#await(transferId, offerTimeout);
      offered.catch(() => undefined);
      const { iceServers } = await client.requestFile(
        message.id,
        transferId,
        wantsDirect,
        ranged ? requested.offset : 0,
        ranged ? requested.length : 0,
      );
      channel = new FileChannel(iceServers, false, true);
      run.channels.add(channel);
      if (run.canceled) {
        throw new CanceledError("canceled");
      }
      const offer = await offered;
      if (offer.kind === FileSignalKind.UNAVAILABLE) {
        throw new ExpiredError("expired");
      }

      const description = await trust.open(signed(transferId), senderId, SignalKind.OFFER, offer.payload);
      if (wantsDirect && agreed(description)) {
        channel.allowDirect();
      }
      if (!offer.ranged) {
        if (index > 0) {
          void client.fileSignal(message.id, transferId, senderId, FileSignalKind.CANCEL).catch(() => undefined);
          throw new AbandonedError("abandoned");
        }
        segments.splice(0, segments.length, { offset: 0, length: total });
      }
      const segment = segments[index];
      const answer = await channel.answer(description);
      await client.fileSignal(
        message.id,
        transferId,
        senderId,
        FileSignalKind.ANSWER,
        await trust.seal(signed(transferId), senderId, SignalKind.ANSWER, answer),
      );
      const open = await channel.open();
      if (this.transfers[message.id]?.state === "waiting") {
        this.#start(message.id, "receiving", total);
      }
      run.started ??= performance.now();
      const started = run.started;
      await receive(open, download, segment, (received) => {
        run.received[index] = received;
        this.#progress(
          message.id,
          run.received.reduce((sum, value) => sum + value, 0),
          started,
        );
      });
      open.close();
    } finally {
      channel?.close();
      if (channel) {
        run.channels.delete(channel);
      }
      run.transferIds.delete(transferId);
      this.#waiting.delete(transferId);
    }
  }

  async #serve(signal: FileSignal) {
    const client = this.#client;
    const messageId = fileKey(signal.messageId, signal.fileIndex);
    const shared = await this.shared(messageId);
    if (!client || !shared) {
      return;
    }
    if (!shared.available) {
      await client
        .fileSignal(messageId, signal.transferId, signal.peerId, FileSignalKind.UNAVAILABLE)
        .catch(() => undefined);
      return;
    }
    if (this.#serving >= maxServing) {
      return;
    }
    this.#serving++;
    const { transferId, peerId } = signal;
    void trust.prepare([peerId]).catch(() => undefined);
    const start = Number(signal.offset);
    const end = signal.length > 0n ? Math.min(shared.size, start + Number(signal.length)) : shared.size;
    if (start >= end) {
      this.#serving--;
      return;
    }
    const channel = new FileChannel(signal.iceServers, signal.direct && direct());

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
        true,
      );
      const answer = await answered;
      if (answer.kind !== FileSignalKind.ANSWER) {
        return;
      }
      await channel.accept(await trust.open(signed(transferId), peerId, SignalKind.ANSWER, answer.payload));
      const open = await channel.open();
      open.bufferedAmountLowThreshold = lowWater;

      const read = (offset: number) =>
        offset < end
          ? invoke<ArrayBuffer>("read_shared", { id: messageId, offset, length: Math.min(readSize, end - offset) })
          : null;

      let pending = read(start);
      for (let offset = start; pending;) {
        if (this.#canceled.has(transferId) || open.readyState !== "open") {
          return;
        }
        const buffer = await pending;
        if (buffer.byteLength === 0) {
          return;
        }
        offset += buffer.byteLength;
        pending = read(offset);
        pending?.catch(() => undefined);
        for (let start = 0; start < buffer.byteLength; start += sendSize) {
          if (open.bufferedAmount > highWater) {
            await drained(open);
          }
          open.send(buffer.slice(start, start + sendSize));
        }
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
