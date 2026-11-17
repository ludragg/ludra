import { preferences } from "@/stores/preferences.svelte";

type Pattern = { tones: [frequency: number, start: number, length: number][]; every: number };

const patterns: Record<"incoming" | "outgoing", Pattern> = {
  incoming: {
    tones: [
      [660, 0, 0.18],
      [880, 0.22, 0.18],
      [660, 0.6, 0.18],
      [880, 0.82, 0.18],
    ],
    every: 2500,
  },
  outgoing: {
    tones: [[440, 0, 1]],
    every: 3000,
  },
};

type Tone = "incoming" | "outgoing";

const wanted = new Map<"direct" | "group", Tone>();
let playing: Tone | null = null;
let context: AudioContext | null = null;
let timer: number | undefined;

export function setRingtone(source: "direct" | "group", tone: Tone | null) {
  if (tone) {
    wanted.set(source, tone);
  } else {
    wanted.delete(source);
  }
  const tones = [...wanted.values()];
  const next = tones.includes("incoming") ? "incoming" : tones.length ? "outgoing" : null;
  if (next === playing) {
    return;
  }
  stop();
  playing = next;
  if (next) {
    play(next);
  }
}

function play(kind: Tone) {
  if (!preferences.values.callSounds) {
    return;
  }
  context = new AudioContext();
  const pattern = patterns[kind];
  const ring = () => {
    if (!context) {
      return;
    }
    const now = context.currentTime;
    for (const [frequency, start, length] of pattern.tones) {
      const tone = context.createOscillator();
      const gain = context.createGain();
      tone.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, now + start);
      gain.gain.exponentialRampToValueAtTime(0.12, now + start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + start + length);
      tone.connect(gain).connect(context.destination);
      tone.start(now + start);
      tone.stop(now + start + length + 0.05);
    }
  };

  ring();
  timer = window.setInterval(ring, pattern.every);
}

function stop() {
  window.clearInterval(timer);
  timer = undefined;
  context?.close();
  context = null;
}

type Cue = "connected" | "ended" | "off" | "on" | "streamStart" | "streamEnd";

const cues: Record<Cue, [frequency: number, start: number, length: number][]> = {
  off: [
    [880, 0, 0.06],
    [587, 0.07, 0.08],
  ],
  on: [
    [587, 0, 0.06],
    [880, 0.07, 0.08],
  ],
  connected: [
    [523, 0, 0.12],
    [784, 0.12, 0.2],
  ],
  ended: [
    [784, 0, 0.12],
    [523, 0.12, 0.22],
  ],
  streamStart: [
    [659, 0, 0.07],
    [988, 0.08, 0.07],
    [1319, 0.16, 0.16],
  ],
  streamEnd: [
    [1319, 0, 0.07],
    [988, 0.08, 0.07],
    [659, 0.16, 0.16],
  ],
};

export function playCue(cue: Cue) {
  if (!preferences.values.callSounds) {
    return;
  }
  const cueContext = new AudioContext();
  const now = cueContext.currentTime;
  for (const [frequency, start, length] of cues[cue]) {
    const tone = cueContext.createOscillator();
    const gain = cueContext.createGain();
    tone.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, now + start);
    gain.gain.exponentialRampToValueAtTime(0.12, now + start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + start + length);
    tone.connect(gain).connect(cueContext.destination);
    tone.start(now + start);
    tone.stop(now + start + length + 0.05);
  }
  window.setTimeout(() => cueContext.close(), 800);
}
