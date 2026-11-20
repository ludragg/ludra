import { execFile, spawn } from "node:child_process";
import { connect } from "node:net";
import { log } from "./hub.mjs";

export function run(command, args, { cwd, env, channel, shell = false } = {}) {
  const child = spawn(command, args, {
    cwd,
    env: env ?? process.env,
    windowsHide: true,
    shell,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (channel) {
    pipe(child.stdout, channel);
    pipe(child.stderr, channel);
  }
  const done = new Promise((resolve) => {
    child.on("error", (error) => {
      if (channel) {
        log(channel, error.message);
      }
      resolve(-1);
    });
    child.on("close", (code) => resolve(code ?? -1));
  });
  return { child, done };
}

function pipe(stream, channel) {
  let rest = "";
  stream.setEncoding("utf8");
  stream.on("data", (chunk) => {
    const text = rest + chunk;
    const end = text.lastIndexOf("\n");
    if (end < 0) {
      rest = text;
      return;
    }
    log(channel, text.slice(0, end));
    rest = text.slice(end + 1);
  });
  stream.on("end", () => {
    if (rest) {
      log(channel, rest);
    }
  });
}

export async function succeeds(command, args, options) {
  return (await run(command, args, options).done) === 0;
}

export function output(command, args, options = {}) {
  return new Promise((resolve) => {
    execFile(command, args, { windowsHide: true, timeout: 15000, ...options }, (error, stdout) =>
      resolve(error ? null : stdout),
    );
  });
}

export async function listening(port) {
  const hosts = ["127.0.0.1", "::1"];
  const results = await Promise.all(hosts.map((host) => probe(host, port)));
  return results.some(Boolean);
}

function probe(host, port) {
  return new Promise((resolve) => {
    const socket = connect({ host, port });
    const finish = (open) => {
      socket.destroy();
      resolve(open);
    };
    socket.setTimeout(400, () => finish(false));
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
  });
}

export async function pidOnPort(port) {
  const text = await output("netstat", ["-ano", "-p", "TCP"]);
  const textV6 = await output("netstat", ["-ano", "-p", "TCPv6"]);
  for (const line of `${text ?? ""}\n${textV6 ?? ""}`.split(/\r?\n/)) {
    const parts = line.trim().split(/\s+/);
    if (parts[3] === "LISTENING" && parts[1]?.endsWith(`:${port}`)) {
      return Number(parts[4]);
    }
  }
  return null;
}

export async function killTree(pid) {
  if (pid) {
    await output("taskkill", ["/PID", String(pid), "/T", "/F"]);
  }
}

export async function waitFor(check, timeout, interval = 500) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await check()) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
  return false;
}
