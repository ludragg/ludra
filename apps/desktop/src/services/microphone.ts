import { GtcrnWorkletNode, loadGtcrn } from "@sapphi-red/web-noise-suppressor";
import gtcrnWasm from "@sapphi-red/web-noise-suppressor/gtcrn.wasm?url";
import gtcrnWorklet from "@sapphi-red/web-noise-suppressor/gtcrnWorklet.js?url";
import { preferences } from "@/stores/preferences.svelte";

const sampleRate = 48000;
const floorDb = -60;
const gateHold = 250;

const suppressorLatency = 1530 / sampleRate;

let gtcrn: Promise<ArrayBuffer> | null = null;

export function levelPercent(rms: number): number {
  if (rms <= 0) {
    return 0;
  }
  const db = 20 * Math.log10(rms);
  return Math.max(0, Math.min(100, ((db - floorDb) / -floorDb) * 100));
}

function thresholdFor(sensitivity: number): number {
  return sensitivity > 0 ? 10 ** (((sensitivity / 100) * -floorDb + floorDb) / 20) : 0;
}

export function suppressionStrength(): number {
  return preferences.values.suppression ? preferences.values.suppressionLevel : 0;
}

export class Microphone {
  readonly context = new AudioContext({ sampleRate });
  readonly track: MediaStreamTrack;

  #stream: MediaStream;
  #source: MediaStreamAudioSourceNode;
  #dry = this.context.createGain();
  #alignment = this.context.createDelay(0.05);
  #wet = this.context.createGain();
  #volume = this.context.createGain();
  #gate = this.context.createGain();
  #analyser = this.context.createAnalyser();
  #buffer: Float32Array<ArrayBuffer>;
  #suppressor: GtcrnWorkletNode | null = null;
  #threshold = 0;
  #gateTimer: number;
  #open = true;

  private constructor(stream: MediaStream) {
    this.#stream = stream;
    this.#source = this.context.createMediaStreamSource(stream);
    this.#buffer = new Float32Array(this.#analyser.fftSize);

    for (const node of [this.#dry, this.#wet, this.#volume, this.#gate]) {
      node.channelCount = 1;
      node.channelCountMode = "explicit";
      node.channelInterpretation = "discrete";
    }

    const destination = this.context.createMediaStreamDestination();
    destination.channelCount = 1;
    this.#source.connect(this.#alignment).connect(this.#dry).connect(this.#volume);
    this.#wet.connect(this.#volume);
    this.#volume.connect(this.#analyser);
    this.#volume.connect(this.#gate).connect(destination);
    this.track = destination.stream.getAudioTracks()[0];

    let openUntil = 0;
    this.#gateTimer = window.setInterval(() => {
      const now = performance.now();
      if (this.level() > this.#threshold) {
        openUntil = now + gateHold;
      }
      const open = this.#threshold === 0 || now < openUntil;
      if (open !== this.#open) {
        this.#open = open;
        this.#gate.gain.setTargetAtTime(open ? 1 : 0, this.context.currentTime, open ? 0.005 : 0.05);
      }
    }, 20);
  }

  static async open(): Promise<Microphone> {
    const { inputDevice } = preferences.values;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: inputDevice ? { exact: inputDevice } : undefined,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });

    const microphone = new Microphone(stream);
    microphone.setVolume(preferences.values.inputVolume);
    microphone.setSensitivity(preferences.values.sensitivity);
    await microphone.setSuppression(suppressionStrength());
    return microphone;
  }

  get transmitting(): boolean {
    return this.#open;
  }

  get threshold(): number {
    return this.#threshold;
  }

  level(): number {
    this.#analyser.getFloatTimeDomainData(this.#buffer);
    let sum = 0;
    for (const sample of this.#buffer) {
      sum += sample * sample;
    }
    return Math.sqrt(sum / this.#buffer.length);
  }

  setVolume(percent: number) {
    this.#volume.gain.value = percent / 100;
  }

  setSensitivity(percent: number) {
    this.#threshold = thresholdFor(percent);
  }

  async setSuppression(percent: number) {
    const strength = percent / 100;
    if (strength > 0 && !this.#suppressor) {
      this.#suppressor = await this.#createSuppressor();
    }
    this.#wet.gain.value = strength;
    this.#dry.gain.value = 1 - strength;
    this.#alignment.delayTime.value = strength > 0 ? suppressorLatency : 0;
  }

  setEnabled(enabled: boolean) {
    this.track.enabled = enabled;
  }

  close() {
    window.clearInterval(this.#gateTimer);
    this.#suppressor?.destroy();
    for (const track of [...this.#stream.getTracks(), this.track]) {
      track.stop();
    }
    this.context.close();
  }

  async #createSuppressor(): Promise<GtcrnWorkletNode> {
    gtcrn ??= loadGtcrn({ url: gtcrnWasm });
    const wasmBinary = await gtcrn;
    await this.context.audioWorklet.addModule(gtcrnWorklet);

    const node = new GtcrnWorkletNode(this.context, { maxChannels: 1, wasmBinary });
    this.#source.connect(node).connect(this.#wet);
    return node;
  }
}
