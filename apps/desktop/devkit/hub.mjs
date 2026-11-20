const channels = ["server", "interface", "app", "checks"];
const maxLines = 1500;
const maxCodes = 6;

const logs = Object.fromEntries(channels.map((channel) => [channel, []]));
const clients = new Set();
const codes = [];
let stateSource = () => ({});
let pendingState = null;
let lastState = "";

export function setStateSource(source) {
  stateSource = source;
}

export function connect(response) {
  response.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  clients.add(response);
  send(response, "logs", logs);
  send(response, "state", snapshot());
  return () => clients.delete(response);
}

export function clientCount() {
  return clients.size;
}

export function changed() {
  pendingState ??= setTimeout(() => {
    pendingState = null;
    const state = snapshot();
    const text = JSON.stringify(state);
    if (text !== lastState) {
      lastState = text;
      broadcast("state", state);
    }
  }, 50);
}

export function log(channel, text) {
  const lines = String(text)
    .replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "")
    .replace(/\r/g, "")
    .split("\n");
  if (lines.at(-1) === "") {
    lines.pop();
  }
  const buffer = logs[channel];
  for (const line of lines) {
    buffer.push(line);
    if (channel === "server") {
      readCode(line);
    }
  }
  buffer.splice(0, buffer.length - maxLines);
  broadcast("log", { channel, lines });
}

export function clearLog(channel) {
  if (logs[channel]) {
    logs[channel].length = 0;
    broadcast("logs", logs);
  }
}

export function clearCodes() {
  codes.length = 0;
  changed();
}

function snapshot() {
  return { ...stateSource(), codes };
}

function readCode(line) {
  if (!line.includes("email not sent")) {
    return;
  }
  const code = line.match(/subject="[^"]*?(\d{6})"/)?.[1];
  if (!code) {
    return;
  }
  const user = line.match(/(?:Olá|Hi), (.+?)!/)?.[1] ?? line.match(/to=(\S+)/)?.[1] ?? "";
  codes.unshift({ id: `${Date.now()}-${code}`, user, purpose: purposeOf(line), code });
  codes.splice(maxCodes);
  changed();
}

function purposeOf(line) {
  if (/confirmar o e-mail|confirm your email/.test(line)) {
    return "verify";
  }
  if (/redefinir a senha|reset your password/.test(line)) {
    return "reset";
  }
  return "twoFactor";
}

function broadcast(event, data) {
  for (const client of clients) {
    send(client, event, data);
  }
}

function send(response, event, data) {
  response.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}
