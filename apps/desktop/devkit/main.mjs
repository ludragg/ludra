import { spawn } from "node:child_process";
import { mkdirSync, openSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  accountsState,
  addAccount,
  clearProfile,
  closeAll,
  closeProfile,
  openProfile,
  removeAccount,
  reopenAll,
  updateAccount,
} from "./accounts.mjs";
import { checksState, fixFormatting, runChecks } from "./checks.mjs";
import { changed, clearCodes, clearLog, clientCount, connect, setStateSource } from "./hub.mjs";
import { dataDir, desktopDir, logFile, panelPort, srcDir, uiDir } from "./paths.mjs";
import { waitFor } from "./process.mjs";
import {
  buildApp,
  poll,
  restartServer,
  servicesState,
  setSmtp,
  startAll,
  startDatabase,
  startInterface,
  startServer,
  stopDatabase,
  stopInterface,
  stopOwned,
  stopServer,
  stopServices,
} from "./services.mjs";
import { buildWindow, openWindow, panelUrl } from "./window.mjs";

const actions = {
  "all/start": startAll,
  "all/stop": async () => {
    await closeAll();
    await stopServices();
  },
  "database/start": startDatabase,
  "database/stop": stopDatabase,
  "server/start": startServer,
  "server/stop": stopServer,
  "server/restart": restartServer,
  "interface/start": startInterface,
  "interface/stop": stopInterface,
  "app/build": buildApp,
  "app/reopen": reopenAll,
  smtp: setSmtp,
  "accounts/add": addAccount,
  "accounts/update": updateAccount,
  "accounts/remove": removeAccount,
  "profiles/open": openProfile,
  "profiles/close": closeProfile,
  "profiles/clear": clearProfile,
  "checks/run": runChecks,
  "checks/fix": fixFormatting,
  "logs/clear": ({ channel }) => clearLog(channel),
  "codes/clear": clearCodes,
};

const trustedHosts = new Set([`127.0.0.1:${panelPort}`, `localhost:${panelPort}`]);

if (process.argv.includes("--detach")) {
  await launch();
} else {
  await serve();
}

async function launch() {
  if (await ping()) {
    openWindow();
    return;
  }
  buildWindow();
  mkdirSync(dataDir, { recursive: true });
  const out = openSync(logFile, "w");
  spawn(process.execPath, [fileURLToPath(import.meta.url)], {
    cwd: desktopDir,
    detached: true,
    windowsHide: true,
    stdio: ["ignore", out, out],
  }).unref();
  if (!(await waitFor(ping, 30000))) {
    console.error(`Ludra Dev did not start. See ${logFile}`);
    process.exitCode = 1;
  }
}

async function ping() {
  try {
    const response = await fetch(`${panelUrl}api/ping`, { signal: AbortSignal.timeout(1000) });
    return (await response.json()).app === "ludra-dev";
  } catch {
    return false;
  }
}

async function serve() {
  const { version } = JSON.parse(readFileSync(join(desktopDir, "package.json"), "utf8"));
  setStateSource(() => ({ version, ...servicesState(), ...accountsState(), ...checksState() }));

  const http = createServer();
  const vite = await createVite(http);

  http.on("request", (request, response) => {
    if (!trusted(request)) {
      response.writeHead(403).end();
    } else if (request.url.startsWith("/api/")) {
      void handle(request, response);
    } else {
      vite.middlewares(request, response);
    }
  });

  await new Promise((resolve) => http.listen(panelPort, "127.0.0.1", resolve));
  console.log(`Ludra Dev listening on ${panelUrl}`);

  let tick = 0;
  let polling = false;
  setInterval(async () => {
    if (!polling) {
      polling = true;
      await poll({ docker: tick++ % 3 === 0 }).catch(() => undefined);
      polling = false;
    }
  }, 2000);
  await poll({ docker: true });

  watchWindow();
  openWindow();
}

async function createVite(http) {
  const [{ createServer: createViteServer }, { svelte }] = await Promise.all([
    import("vite"),
    import("@sveltejs/vite-plugin-svelte"),
  ]);
  return createViteServer({
    configFile: false,
    root: uiDir,
    cacheDir: join(desktopDir, "node_modules", ".vite-devkit"),
    appType: "spa",
    logLevel: "warn",
    clearScreen: false,
    plugins: [svelte()],
    resolve: { alias: { "@": srcDir } },
    server: { middlewareMode: true, hmr: { server: http }, fs: { allow: [desktopDir] } },
  });
}

function trusted(request) {
  const host = request.headers.host;
  if (!trustedHosts.has(host)) {
    return false;
  }
  return request.method === "GET" || request.headers.origin === `http://${host}`;
}

async function handle(request, response) {
  const path = new URL(request.url, panelUrl).pathname.slice("/api/".length);
  if (path === "ping") {
    return reply(response, 200, { app: "ludra-dev" });
  }
  if (path === "events") {
    const disconnect = connect(response);
    windowSeen();
    request.on("close", () => {
      disconnect();
      windowGone();
    });
    return;
  }
  const action = actions[path];
  if (request.method !== "POST" || !action) {
    return reply(response, 404, { error: "notFound" });
  }
  try {
    await action(await readBody(request));
    reply(response, 200, {});
  } catch (error) {
    reply(response, 400, { error: error instanceof Error ? error.message : String(error) });
  } finally {
    changed();
  }
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 65536) {
        request.destroy();
        reject(new Error("invalid"));
      }
    });
    request.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("invalid"));
      }
    });
  });
}

function reply(response, status, data) {
  response.writeHead(status, { "Content-Type": "application/json" }).end(JSON.stringify(data));
}

let seen = false;
let idle = null;

function watchWindow() {
  setTimeout(() => {
    if (!seen) {
      void shutdown();
    }
  }, 120000);
}

function windowSeen() {
  seen = true;
  clearTimeout(idle);
}

function windowGone() {
  if (clientCount() === 0) {
    clearTimeout(idle);
    idle = setTimeout(shutdown, 5000);
  }
}

async function shutdown() {
  await closeAll().catch(() => undefined);
  await stopOwned().catch(() => undefined);
  process.exit(0);
}
