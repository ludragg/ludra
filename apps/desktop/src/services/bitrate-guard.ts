import { screenBitrate, setScreenBitrate, type ScreenQuality } from "@/services/screen";

const tickEvery = 1000;
const historySize = 30;
const minSamples = 5;
const calmTicks = 5;
const cooldownTicks = 2;
const dropFactor = 0.86;
const riseFactor = 1.06;
const startShare = 0.7;
const floorShare = 0.35;
const floorBitrate = 1_500_000;
const rttSlack = 1.14;
const rttMargin = 25;
const lossLimit = 0.04;
const minChange = 0.02;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

export class BitrateGuard {
  #sender: RTCRtpSender;
  #ceiling: number;
  #floor: number;
  #cap: number;
  #applied: number;
  #history: number[] = [];
  #calm = 0;
  #cooldown = 0;
  #timer = 0;
  #stopped = false;

  constructor(sender: RTCRtpSender, quality: ScreenQuality) {
    this.#sender = sender;
    this.#ceiling = screenBitrate(quality);
    this.#floor = Math.min(this.#ceiling, Math.max(floorBitrate, this.#ceiling * floorShare));
    this.#cap = Math.round(this.#ceiling * startShare);
    this.#applied = this.#cap;
  }

  get cap(): number {
    return this.#cap;
  }

  start() {
    window.clearInterval(this.#timer);
    this.#timer = window.setInterval(() => void this.#tick(), tickEvery);
  }

  stop() {
    this.#stopped = true;
    window.clearInterval(this.#timer);
  }

  async #tick() {
    const stats = await this.#sender.getStats().catch(() => null);
    if (!stats || this.#stopped) {
      return;
    }
    let rtt: number | null = null;
    let lost = 0;
    stats.forEach((report) => {
      if (report.type === "remote-inbound-rtp" && report.kind === "video" && report.roundTripTime !== undefined) {
        rtt = report.roundTripTime * 1000;
        lost = report.fractionLost ?? 0;
      }
    });
    if (rtt === null) {
      return;
    }
    this.#history.push(rtt);
    if (this.#history.length > historySize) {
      this.#history.shift();
    }
    if (this.#history.length < minSamples) {
      return;
    }
    const current = median(this.#history.slice(-3));
    const base = Math.min(...this.#history);
    const congested = current > base * rttSlack + rttMargin || lost > lossLimit;

    if (this.#cooldown > 0) {
      this.#cooldown--;
    }
    if (congested) {
      this.#calm = 0;
      if (this.#cooldown === 0) {
        this.#cap = Math.max(this.#floor, Math.round(this.#cap * dropFactor));
        this.#cooldown = cooldownTicks;
      }
    } else if (++this.#calm >= calmTicks) {
      this.#calm = 0;
      this.#cap = Math.min(this.#ceiling, Math.round(this.#cap * riseFactor));
    }
    await this.#apply();
  }

  async #apply() {
    const change = Math.abs(this.#cap - this.#applied) / this.#applied;
    if (this.#cap === this.#applied || (this.#cap !== this.#ceiling && change < minChange)) {
      return;
    }
    this.#applied = this.#cap;
    await setScreenBitrate(this.#sender, this.#cap);
  }
}
