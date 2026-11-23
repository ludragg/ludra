import { Microphone } from "@/services/microphone";

const bitrate = 32_000;
const timeslice = 250;
const mimeTypes = ["audio/webm;codecs=opus", "audio/webm"];

export const maxRecordingSeconds = 600;

export type Recording = { blob: Blob; seconds: number };

export class VoiceRecorder {
  #microphone: Microphone;
  #recorder: MediaRecorder;
  #chunks: Blob[] = [];
  #started = performance.now();
  #finished: Recording | null = null;

  private constructor(microphone: Microphone, recorder: MediaRecorder) {
    this.#microphone = microphone;
    this.#recorder = recorder;
  }

  static async start(): Promise<VoiceRecorder> {
    const mimeType = mimeTypes.find((type) => MediaRecorder.isTypeSupported(type));
    if (!mimeType) {
      throw new Error("recording unsupported");
    }
    const microphone = await Microphone.open();
    microphone.setSensitivity(0);
    const recorder = new MediaRecorder(new MediaStream([microphone.track]), { mimeType, audioBitsPerSecond: bitrate });
    const voice = new VoiceRecorder(microphone, recorder);
    recorder.ondataavailable = ({ data }) => {
      if (data.size > 0) {
        voice.#chunks.push(data);
      }
    };
    recorder.start(timeslice);
    voice.#started = performance.now();
    return voice;
  }

  get elapsed(): number {
    return this.#finished?.seconds ?? (performance.now() - this.#started) / 1000;
  }

  level(): number {
    return this.#microphone.level();
  }

  stop(): Promise<Recording> {
    if (this.#finished) {
      return Promise.resolve(this.#finished);
    }
    const seconds = this.elapsed;
    return new Promise((resolve) => {
      this.#recorder.onstop = () => {
        this.#finished = { blob: new Blob(this.#chunks, { type: "audio/webm" }), seconds };
        this.#microphone.close();
        resolve(this.#finished);
      };
      if (this.#recorder.state === "inactive") {
        this.#recorder.onstop(new Event("stop"));
      } else {
        this.#recorder.stop();
      }
    });
  }

  cancel() {
    if (this.#recorder.state !== "inactive") {
      this.#recorder.onstop = null;
      this.#recorder.stop();
    }
    if (!this.#finished) {
      this.#microphone.close();
    }
  }
}
