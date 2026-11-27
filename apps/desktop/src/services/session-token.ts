import { invoke, isTauri } from "@tauri-apps/api/core";
import { report } from "@/services/diagnostics";

const legacyKey = "ludra.session";

let queue: Promise<unknown> = Promise.resolve();

function serial<T>(task: () => Promise<T>): Promise<T> {
  const next = queue.then(task, task);
  queue = next.catch(() => undefined);
  return next;
}

function legacyRead(): string | null {
  try {
    return localStorage.getItem(legacyKey);
  } catch {
    return null;
  }
}

function legacyWrite(token: string) {
  try {
    localStorage.setItem(legacyKey, token);
  } catch {
    return;
  }
}

function legacyRemove() {
  try {
    localStorage.removeItem(legacyKey);
  } catch {
    return;
  }
}

export function readSessionToken(): Promise<string | null> {
  return serial(async () => {
    const legacy = legacyRead();
    if (!isTauri()) {
      return legacy;
    }

    let stored: string | null;
    try {
      stored = await invoke<string | null>("session_token_read");
    } catch (cause) {
      report("warning", "session", "could not read the saved session", cause);
      return legacy;
    }
    if (legacy === null) {
      return stored;
    }

    if (stored === null) {
      try {
        await invoke("session_token_save", { token: legacy });
      } catch (cause) {
        report("warning", "session", "could not move the saved session", cause);
        return legacy;
      }
    }
    legacyRemove();
    return stored ?? legacy;
  });
}

export function saveSessionToken(token: string): Promise<void> {
  return serial(async () => {
    if (!isTauri()) {
      legacyWrite(token);
      return;
    }
    legacyRemove();
    try {
      await invoke("session_token_save", { token });
    } catch (cause) {
      report("warning", "session", "could not save the session", cause);
    }
  });
}

export function clearSessionToken(): Promise<void> {
  return serial(async () => {
    legacyRemove();
    if (!isTauri()) {
      return;
    }
    try {
      await invoke("session_token_clear");
    } catch (cause) {
      report("warning", "session", "could not clear the saved session", cause);
    }
  });
}
