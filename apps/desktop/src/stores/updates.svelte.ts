import { getVersion } from "@tauri-apps/api/app";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { releases, type Release } from "@/changelog";

type Phase = "idle" | "available" | "downloading" | "installing" | "failed";

const seenKey = "ludra.version";
const attemptKey = "ludra.updating";
const checkEvery = 5 * 60 * 1000;

class UpdateStore {
  phase = $state<Phase>("idle");
  version = $state("");
  progress = $state(0);
  release = $state<Release | null>(null);
  stuck = $state(false);
  critical = $state(false);
  readonly resumed = takeAttempt();

  #update: Update | null = null;
  #current = "";
  #started = false;
  #checking: Promise<void> | null = null;

  async start() {
    if (this.#started) {
      return;
    }
    this.#started = true;
    await this.#announce();
    if (import.meta.env.PROD) {
      await this.check();
      setInterval(() => this.check(), checkEvery);
    }
  }

  check(): Promise<void> {
    if (!import.meta.env.PROD || this.phase !== "idle") {
      return Promise.resolve();
    }
    this.#checking ??= this.#fetch().finally(() => (this.#checking = null));
    return this.#checking;
  }

  async #fetch() {
    try {
      const update = await check();
      if (update) {
        this.#update = update;
        this.version = update.version;
        this.#current ||= await getVersion().catch(() => "");
        this.critical = breaksCalls(this.#current, update.version);
        this.phase = "available";
      }
    } catch {
      this.phase = this.#update ? "failed" : "idle";
    }
  }

  async install() {
    const update = this.#update;
    if (!update || this.phase === "downloading" || this.phase === "installing") {
      return;
    }
    this.phase = "downloading";
    this.progress = 0;
    let total = 0;
    let received = 0;
    try {
      await update.downloadAndInstall((event) => {
        if (event.event === "Started") {
          total = event.data.contentLength ?? 0;
        } else if (event.event === "Progress") {
          received += event.data.chunkLength;
          this.progress = total ? Math.min(100, Math.round((received / total) * 100)) : 0;
        } else {
          this.phase = "installing";
          rememberAttempt(update.version);
        }
      });
      await relaunch();
    } catch {
      forgetAttempt();
      this.phase = "failed";
    }
  }

  dismissNotes() {
    this.release = null;
  }

  async #announce() {
    const current = await getVersion().catch(() => "");
    if (!current) {
      return;
    }
    this.#current = current;
    this.stuck = this.resumed !== null && this.resumed !== current;
    let previous: string | null = null;
    try {
      previous = localStorage.getItem(seenKey);
      localStorage.setItem(seenKey, current);
    } catch {
      return;
    }
    if (previous && previous !== current) {
      this.release = releases.find(({ version }) => version === current) ?? null;
    }
  }
}

function breaksCalls(current: string, target: string): boolean {
  const a = parseVersion(current);
  const b = parseVersion(target);
  if (!a || !b) {
    return false;
  }
  return b[0] > a[0] || (b[0] === a[0] && b[1] > a[1]);
}

function parseVersion(value: string): [number, number, number] | null {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(value.trim());
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

function rememberAttempt(version: string) {
  try {
    localStorage.setItem(attemptKey, version);
  } catch {
    return;
  }
}

function forgetAttempt() {
  try {
    localStorage.removeItem(attemptKey);
  } catch {
    return;
  }
}

function takeAttempt(): string | null {
  try {
    const attempted = localStorage.getItem(attemptKey);
    localStorage.removeItem(attemptKey);
    return attempted;
  } catch {
    return null;
  }
}

export const updates = new UpdateStore();
