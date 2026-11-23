import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { changed, log } from "./hub.mjs";
import { appExe, profilesDir, serverPort } from "./paths.mjs";
import { killTree, listening, releaseBrowsers, run } from "./process.mjs";
import { applyStaged, ensureApp, startInterface, startServer } from "./services.mjs";
import { saveSettings, settings } from "./settings.mjs";

const guestId = "guest";
const startupWindow = 15_000;
const startupRetries = 3;
const running = new Map();
const opening = new Set();

export function accountsState() {
  return {
    accounts: settings.accounts.map(({ id, login }) => ({ id, login, state: stateOf(id) })),
    guest: stateOf(guestId),
  };
}

function stateOf(id) {
  return running.has(id) ? "open" : opening.has(id) ? "opening" : "closed";
}

export function addAccount({ login, password }) {
  required(password);
  const account = { id: randomUUID(), login: required(login), password };
  settings.accounts.push(account);
  saveSettings();
  changed();
}

export function updateAccount({ id, login, password }) {
  const account = find(id);
  account.login = required(login);
  if (password) {
    account.password = password;
  }
  saveSettings();
  changed();
}

export async function removeAccount({ id }) {
  await closeProfile({ id });
  settings.accounts = settings.accounts.filter((account) => account.id !== id);
  saveSettings();
  await rm(join(profilesDir, id), { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
  changed();
}

export async function clearProfile({ id }) {
  if (running.has(id) || opening.has(id)) {
    throw new Error("closeFirst");
  }
  await rm(join(profilesDir, id), { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
  log("app", `Cleared the data of ${id === guestId ? "the guest profile" : find(id).login}.`);
}

export async function openProfile({ id }) {
  if (running.has(id) || opening.has(id)) {
    return;
  }
  const account = id === guestId ? { login: "", password: "" } : find(id);
  opening.add(id);
  changed();
  try {
    await Promise.all([ensureApp(), startInterface(), (await listening(serverPort)) || startServer()]);
    if (running.size === 0) {
      await applyStaged();
    }
    await releaseBrowsers(join(profilesDir, id));
    launch(id, account);
  } finally {
    opening.delete(id);
    changed();
  }
}

function launch(id, account, attempt = 0) {
  const started = run(appExe, [], {
    channel: "app",
    env: {
      ...process.env,
      LUDRA_DEV_PROFILE: account.login || "guest",
      LUDRA_DEV_LOGIN: account.login,
      LUDRA_DEV_PASSWORD: account.password,
      WEBVIEW2_USER_DATA_FOLDER: join(profilesDir, id),
    },
  });
  const began = Date.now();
  running.set(id, started);
  started.done.then(async (code) => {
    if (running.get(id) !== started) {
      return;
    }
    running.delete(id);
    if (code !== 0 && Date.now() - began < startupWindow && attempt < startupRetries) {
      log("app", "The app closed right after opening, so its profile may still be in use. Trying again.");
      await releaseBrowsers(join(profilesDir, id));
      launch(id, account, attempt + 1);
    }
    changed();
  });
}

export async function closeProfile({ id }) {
  const current = running.get(id);
  if (!current) {
    return;
  }
  running.delete(id);
  await killTree(current.child.pid);
  await current.done;
  await releaseBrowsers(join(profilesDir, id));
  changed();
}

export async function reopenAll() {
  const open = [...running.keys()];
  await closeAll();
  await applyStaged();
  await Promise.all(open.map((id) => openProfile({ id })));
}

export async function closeAll() {
  await Promise.all([...running.keys()].map((id) => closeProfile({ id })));
}

function find(id) {
  const account = settings.accounts.find((entry) => entry.id === id);
  if (!account) {
    throw new Error("notFound");
  }
  return account;
}

function required(value) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("required");
  }
  return value.trim();
}
