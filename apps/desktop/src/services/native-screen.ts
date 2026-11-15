import { Channel, invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export type ScreenSource = {
  id: string;
  kind: "screen" | "window";
  name: string;
  thumbnail: string | null;
};

type FrameInfo = {
  kind: "ludra-screen";
  session: number;
  slot: number;
  width: number;
  height: number;
  timestamp: number;
};

type SharedBufferEvent = Event & {
  getBuffer(): ArrayBuffer;
  additionalData: FrameInfo | null;
};

type WebviewHost = {
  addEventListener(type: "sharedbufferreceived", listener: (event: SharedBufferEvent) => void): void;
  removeEventListener(type: "sharedbufferreceived", listener: (event: SharedBufferEvent) => void): void;
  releaseBuffer(buffer: ArrayBuffer): void;
};

type TrackGenerator<T> = MediaStreamTrack & { writable: WritableStream<T> };

declare const MediaStreamTrackGenerator: {
  new (init: { kind: "video" }): TrackGenerator<VideoFrame>;
  new (init: { kind: "audio" }): TrackGenerator<AudioData>;
};

const sampleRate = 48_000;
const channels = 2;

function host(): WebviewHost | null {
  return (window as unknown as { chrome?: { webview?: WebviewHost } }).chrome?.webview ?? null;
}

export function listScreenSources(): Promise<ScreenSource[]> {
  return invoke<ScreenSource[]>("screen_sources");
}

const previewWidth = 192;
const previewHeight = 108;
const previewEvery = 5000;
const maxPreviewLength = 14_000;

export class NativeScreen {
  onEnded: () => void = () => {};
  onPreview: (image: string) => void = () => {};

  #video: TrackGenerator<VideoFrame>;
  #writer: WritableStreamDefaultWriter<VideoFrame>;
  #audio: TrackGenerator<AudioData>;
  #audioWriter: WritableStreamDefaultWriter<AudioData>;
  #audioFrames = 0;
  #host: WebviewHost;
  #stopped = false;
  #unlisten: Promise<UnlistenFn> | null = null;
  #listener = (event: SharedBufferEvent) => this.#frame(event);
  #previewAt = -Infinity;
  #session = -1;

  private constructor(webview: WebviewHost) {
    this.#host = webview;
    this.#video = new MediaStreamTrackGenerator({ kind: "video" });
    this.#writer = this.#video.writable.getWriter();
    this.#audio = new MediaStreamTrackGenerator({ kind: "audio" });
    this.#audioWriter = this.#audio.writable.getWriter();
  }

  static async start(sourceId: string, width: number, height: number, fps: number): Promise<NativeScreen> {
    const webview = host();
    if (!webview) {
      throw new Error("native screen capture unavailable");
    }
    const screen = new NativeScreen(webview);
    webview.addEventListener("sharedbufferreceived", screen.#listener);
    screen.#unlisten = listen("screen-ended", () => screen.#ended());
    const audio = new Channel<ArrayBuffer>();
    audio.onmessage = (chunk) => screen.#sound(chunk);
    try {
      screen.#session = await invoke<number>("screen_start", {
        options: { source: sourceId, width, height, fps },
        audio,
      });
    } catch (cause) {
      screen.stop();
      throw cause;
    }
    return screen;
  }

  get stream(): MediaStream {
    return new MediaStream([this.#video, this.#audio]);
  }

  stop(native = true) {
    if (this.#stopped) {
      return;
    }
    this.#stopped = true;
    this.#host.removeEventListener("sharedbufferreceived", this.#listener);
    this.#unlisten?.then((unlisten) => unlisten()).catch(() => undefined);
    if (native) {
      invoke("screen_stop").catch(() => undefined);
    }
    this.#writer.close().catch(() => undefined);
    this.#audioWriter.close().catch(() => undefined);
    this.#video.stop();
    this.#audio.stop();
  }

  #ended() {
    if (!this.#stopped) {
      this.stop();
      this.onEnded();
    }
  }

  async #snapshot(frame: VideoFrame) {
    try {
      const scale = Math.min(previewWidth / frame.displayWidth, previewHeight / frame.displayHeight);
      const width = Math.max(1, Math.round(frame.displayWidth * scale));
      const height = Math.max(1, Math.round(frame.displayHeight * scale));
      const canvas = new OffscreenCanvas(width, height);
      canvas.getContext("2d")!.drawImage(frame, 0, 0, width, height);
      frame.close();
      for (const quality of [0.6, 0.4, 0.25]) {
        const blob = await canvas.convertToBlob({ type: "image/jpeg", quality });
        const bytes = new Uint8Array(await blob.arrayBuffer());
        let binary = "";
        for (const byte of bytes) {
          binary += String.fromCharCode(byte);
        }
        const image = `data:image/jpeg;base64,${btoa(binary)}`;
        if (image.length <= maxPreviewLength) {
          if (!this.#stopped) {
            this.onPreview(image);
          }
          return;
        }
      }
    } catch {
      frame.close();
    }
  }

  #sound(chunk: ArrayBuffer) {
    if (this.#stopped || !(chunk instanceof ArrayBuffer) || chunk.byteLength === 0) {
      return;
    }
    const frames = chunk.byteLength / (channels * 4);
    const data = new AudioData({
      format: "f32",
      sampleRate,
      numberOfChannels: channels,
      numberOfFrames: frames,
      timestamp: Math.round((this.#audioFrames / sampleRate) * 1_000_000),
      data: chunk,
    });
    this.#audioFrames += frames;
    this.#audioWriter.write(data).catch(() => data.close());
  }

  #frame(event: SharedBufferEvent) {
    const info = event.additionalData;
    if (info?.kind !== "ludra-screen") {
      return;
    }
    if (info.session !== this.#session) {
      this.#host.releaseBuffer(event.getBuffer());
      return;
    }
    const buffer = event.getBuffer();
    try {
      if (!this.#stopped && (this.#writer.desiredSize ?? 1) > 0) {
        const frame = new VideoFrame(new Uint8Array(buffer, 0, info.width * info.height * 4), {
          format: "BGRA",
          codedWidth: info.width,
          codedHeight: info.height,
          timestamp: info.timestamp,
        });
        if (performance.now() - this.#previewAt >= previewEvery) {
          this.#previewAt = performance.now();
          this.#snapshot(frame.clone());
        }
        this.#writer.write(frame).catch(() => frame.close());
      }
    } finally {
      this.#host.releaseBuffer(buffer);
      invoke("screen_release", { session: info.session, slot: info.slot }).catch(() => undefined);
    }
  }
}
