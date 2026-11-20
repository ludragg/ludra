import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { copyFile, rename, stat } from "node:fs/promises";
import { join } from "node:path";
import { changed, log } from "./hub.mjs";
import {
  appExe,
  builtExe,
  composeFile,
  desktopDir,
  envFile,
  interfacePort,
  repoDir,
  serverDir,
  serverExe,
  serverPort,
  stagedExe,
  tauriDir,
} from "./paths.mjs";
import { killTree, listening, output, pidOnPort, run, succeeds, waitFor } from "./process.mjs";
import { saveSettings, settings } from "./settings.mjs";

const devConfig = JSON.stringify({ identifier: "app.ludra.dev", productName: "Ludra Dev" });
const dockerDesktop = join(process.env.ProgramFiles ?? "C:\\Program Files", "Docker", "Docker", "Docker Desktop.exe");

const busy = { database: null, server: null, interface: null, app: null };
const inflight = {};
const live = { database: false, docker: false, server: false, interface: false };
const app = { builtAt: null, lastBuild: null, failed: false, staged: existsSync(stagedExe) };

let serverProcess = null;
let serverSince = null;
let interfaceProcess = null;

export function servicesState() {
  return {
    services: {
      database: { state: busy.database ?? (live.database ? "running" : "stopped"), docker: live.docker },
      server: {
        state: busy.server ?? (live.server ? "running" : "stopped"),
        since: live.server && serverProcess ? serverSince : null,
        external: live.server && !serverProcess,
      },
      interface: {
        state: busy.interface ?? (live.interface ? "running" : "stopped"),
        external: live.interface && !interfaceProcess,
      },
      app: {
        state: busy.app ?? (app.failed ? "failed" : app.builtAt ? "ready" : "missing"),
        builtAt: app.builtAt && Math.max(app.builtAt, app.lastBuild ?? 0),
        staged: app.staged,
      },
    },
    smtp: { enabled: settings.smtp, available: Boolean(readEnv().LUDRA_SMTP_HOST) },
  };
}

export async function poll({ docker = false } = {}) {
  const [server, ui] = await Promise.all([listening(serverPort), listening(interfacePort)]);
  live.server = server;
  live.interface = ui;
  app.builtAt = await stat(appExe).then(
    (info) => info.mtimeMs,
    () => null,
  );
  if (docker) {
    const database = await databaseStatus();
    live.docker = database !== null;
    live.database = database === "running";
  }
  changed();
}

async function databaseStatus() {
  const text = await output("docker", ["compose", "-f", composeFile, "ps", "--format", "json", "postgres"]);
  if (text === null) {
    return null;
  }
  const rows = text
    .split(/\r?\n/)
    .filter((line) => line.trim().startsWith("{"))
    .map((line) => JSON.parse(line));
  return rows.some((row) => row.State === "running" && row.Health !== "unhealthy") ? "running" : "stopped";
}

async function task(name, state, work) {
  while (inflight[name]) {
    const current = inflight[name];
    if (busy[name] === state) {
      return current;
    }
    await current.catch(() => undefined);
  }
  busy[name] = state;
  changed();
  const promise = (async () => {
    try {
      return await work();
    } finally {
      busy[name] = null;
      delete inflight[name];
      await poll({ docker: name === "database" });
    }
  })();
  inflight[name] = promise;
  return promise;
}

export function startDatabase() {
  return task("database", "starting", async () => {
    if ((await databaseStatus()) === "running") {
      return;
    }
    if (!(await dockerReady())) {
      log("server", "Starting Docker Desktop...");
      if (existsSync(dockerDesktop)) {
        spawn(dockerDesktop, [], { detached: true, stdio: "ignore" }).unref();
      }
      if (!(await waitFor(dockerReady, 180000, 2000))) {
        throw new Error("dockerOff");
      }
    }
    log("server", "> docker compose up -d --wait");
    if (!(await succeeds("docker", ["compose", "-f", composeFile, "up", "-d", "--wait"], { channel: "server" }))) {
      throw new Error("databaseStart");
    }
  });
}

export function stopDatabase() {
  return task("database", "stopping", async () => {
    log("server", "> docker compose stop");
    await succeeds("docker", ["compose", "-f", composeFile, "stop"], { channel: "server" });
  });
}

async function dockerReady() {
  return (await output("docker", ["info", "--format", "{{.ServerVersion}}"])) !== null;
}

export async function startServer() {
  if (await listening(serverPort)) {
    return;
  }
  if ((await databaseStatus()) !== "running") {
    await startDatabase();
  }
  await task("server", "starting", async () => {
    log("server", "> go build ./cmd/ludra");
    if (!(await succeeds("go", ["build", "-o", serverExe, "./cmd/ludra"], { cwd: serverDir, channel: "server" }))) {
      throw new Error("serverBuild");
    }
    const started = run(serverExe, [], { cwd: repoDir, env: serverEnv(), channel: "server" });
    serverProcess = started;
    serverSince = Date.now();
    started.done.then((code) => {
      if (serverProcess === started) {
        serverProcess = null;
        log("server", `Server exited (${code}).`);
        void poll();
      }
    });
    if (!(await waitFor(() => listening(serverPort), 30000))) {
      throw new Error("serverStart");
    }
  });
}

export function stopServer() {
  return task("server", "stopping", async () => {
    const current = serverProcess;
    serverProcess = null;
    await killTree(current?.child.pid ?? (await pidOnPort(serverPort)));
    await current?.done;
    await waitFor(async () => !(await listening(serverPort)), 5000, 250);
  });
}

export async function restartServer() {
  await stopServer();
  await startServer();
}

export async function setSmtp({ enabled }) {
  settings.smtp = Boolean(enabled);
  saveSettings();
  changed();
  if (serverProcess) {
    await restartServer();
  }
}

function serverEnv() {
  const env = { ...process.env, ...readEnv() };
  if (!settings.smtp) {
    env.LUDRA_SMTP_HOST = "";
  }
  return env;
}

function readEnv() {
  if (!existsSync(envFile)) {
    return {};
  }
  const entries = readFileSync(envFile, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => [line.slice(0, line.indexOf("=")).trim(), line.slice(line.indexOf("=") + 1).trim()]);
  return Object.fromEntries(entries);
}

export async function startInterface() {
  if (await listening(interfacePort)) {
    return;
  }
  await task("interface", "starting", async () => {
    if (!existsSync(join(desktopDir, "node_modules", "vite"))) {
      log("interface", "> npm install");
      await succeeds("npm", ["install"], { cwd: desktopDir, channel: "interface", shell: true });
    }
    const vite = join(desktopDir, "node_modules", "vite", "bin", "vite.js");
    const started = run(process.execPath, [vite], {
      cwd: desktopDir,
      env: { ...process.env, NO_COLOR: "1" },
      channel: "interface",
    });
    interfaceProcess = started;
    started.done.then(() => {
      if (interfaceProcess === started) {
        interfaceProcess = null;
        void poll();
      }
    });
    if (!(await waitFor(() => listening(interfacePort), 60000))) {
      throw new Error("interfaceStart");
    }
  });
}

export function stopInterface() {
  return task("interface", "stopping", async () => {
    const current = interfaceProcess;
    interfaceProcess = null;
    await killTree(current?.child.pid ?? (await pidOnPort(interfacePort)));
    await current?.done;
  });
}

export function buildApp() {
  return task("app", "building", async () => {
    log("app", "> cargo build");
    const env = { ...process.env, TAURI_CONFIG: devConfig };
    app.failed = !(await succeeds("cargo", ["build", "--color", "never"], { cwd: tauriDir, env, channel: "app" }));
    if (app.failed) {
      throw new Error("appBuild");
    }
    app.lastBuild = Date.now();
    await install();
  });
}

async function install() {
  try {
    await copyFile(builtExe, appExe);
    app.staged = false;
    log("app", "ludradev.exe updated.");
  } catch {
    await copyFile(builtExe, stagedExe);
    app.staged = true;
    log("app", "ludradev.exe is in use. Reopen the accounts to use the new build.");
  }
}

export async function applyStaged() {
  if (!app.staged) {
    return;
  }
  await rename(stagedExe, appExe);
  app.staged = false;
  log("app", "ludradev.exe updated.");
}

export async function ensureApp() {
  if (!existsSync(appExe) && !app.staged) {
    await buildApp();
  }
}

export async function startAll() {
  await startDatabase();
  await Promise.all([startServer(), startInterface(), buildApp()]);
}

export async function stopOwned() {
  await Promise.all([serverProcess && stopServer(), interfaceProcess && stopInterface()]);
}

export async function stopServices() {
  await Promise.all([stopServer(), stopInterface()]);
  await stopDatabase();
}
