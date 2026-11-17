import { getVersion } from "@tauri-apps/api/app";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { releases, type Release } from "@/changelog";

type Phase = "idle" | "available" | "downloading" | "installing" | "failed";

const seenKey = "ludra.version";
const attemptKey = "ludra.updating";
const checkEvery = 15 * 60 * 1000;

class UpdateStore {
  phase = $state<Phase>("idle");
  version = $state("");
  progress = $state(0);
  release = $state<Release | null>(null);
  stuck = $state(false);
  readonly resumed = takeAttempt();

  #update: Update | null = null;
  #started = false;

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

  async check() {
    if (!import.meta.env.PROD || this.phase !== "idle") {
      return;
    }
    try {
      const update = await check();
      if (update) {
        this.#update = update;
        this.version = update.version;
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
