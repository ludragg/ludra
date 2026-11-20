import { writeFileSync } from "node:fs";

const server = process.env.LUDRA_SERVER;
if (!server) {
  console.error("Set LUDRA_SERVER (e.g. wss://ludra.example.com/ws)");
  process.exit(1);
}

const socket = new URL(server);
const web = `${socket.protocol === "wss:" ? "https:" : "http:"}//${socket.host}`;
const ws = `${socket.protocol}//${socket.host}`;

const csp = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  `connect-src 'self' ipc: http://ipc.localhost ${ws}`,
  "style-src 'self'",
  "font-src 'self'",
  `img-src 'self' data: blob: http://asset.localhost ${web}`,
  "media-src 'self' blob: http://asset.localhost",
  "frame-src https://www.youtube-nocookie.com",
].join("; ");

writeFileSync(
  new URL("../src-tauri/tauri.release.conf.json", import.meta.url),
  JSON.stringify({
    app: { security: { csp } },
    plugins: { updater: { endpoints: [`${web}/update`] } },
  }),
);
