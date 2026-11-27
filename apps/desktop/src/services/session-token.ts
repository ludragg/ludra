import { invoke, isTauri } from "@tauri-apps/api/core";

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

async function nativeSave(token: string): Promise<boolean> {
  try {
    await invoke("session_token_save", { token });
    return true;
  } catch {
    return false;
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
    } catch {
      return legacy;
    }
    if (legacy === null) {
      return stored;
    }

    if (stored === null && !(await nativeSave(legacy))) {
      return legacy;
    }
    legacyRemove();
    return stored ?? legacy;
  });
}

export function saveSessionToken(token: string): Promise<void> {
  return serial(async () => {
    if (isTauri() && (await nativeSave(token))) {
      legacyRemove();
    } else {
      legacyWrite(token);
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
    } catch {
      return;
    }
  });
}
