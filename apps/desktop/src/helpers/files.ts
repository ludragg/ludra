import { localeTag } from "@/i18n";
import type { FileRef, Message } from "@/protocol/ludra/v1/models_pb";

export type Picked = { path: string; name: string; size: number };

export type FileCategory = "image" | "video" | "audio" | "archive" | "document" | "code" | "other";

export const maxDirectBytes = 2 * 1024 * 1024 * 1024;
export const voiceMime = "audio/webm";

export function isVoice(mime: string): boolean {
  return mime === voiceMime;
}

export function voiceName(seconds: number): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  const day = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `voz-${day}-${time}-${Math.max(1, Math.round(seconds))}s.webm`;
}

export function voiceSeconds(name: string): number | null {
  const match = /-(\d+)s(?: \(\d+\))?\.webm$/.exec(name);
  return match ? Number(match[1]) : null;
}

export const maxMessageFiles = 5;

export function fileKey(messageId: string, index: number): string {
  return index === 0 ? messageId : `${messageId}:${index}`;
}

export function splitKey(key: string): { messageId: string; index: number } {
  const [messageId, index = "0"] = key.split(":");
  return { messageId, index: Number(index) };
}

export function fileMessages(message: Message): Message[] {
  const list = message.files.length > 0 ? message.files : message.file ? [message.file] : [];
  return list.map((file, index) => ({ ...message, id: fileKey(message.id, index), file, files: [] }));
}

export function isMediaFile(file: FileRef): boolean {
  return viewableTypes.has(file.mime) || playableTypes.has(file.mime);
}

export const autoDownloadLimits = [
  1024 * 1024,
  5 * 1024 * 1024,
  10 * 1024 * 1024,
  20 * 1024 * 1024,
  50 * 1024 * 1024,
  100 * 1024 * 1024,
  500 * 1024 * 1024,
  1024 * 1024 * 1024,
  maxDirectBytes,
];

export const viewableTypes = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "image/bmp"]);
export const playableTypes = new Set(["video/mp4", "video/webm", "video/quicktime"]);
export const listenableTypes = new Set(["audio/mpeg", "audio/wav", "audio/ogg", "audio/flac", "audio/mp4"]);

const types: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  bmp: "image/bmp",
  gif: "image/gif",
  mp4: "video/mp4",
  mkv: "video/x-matroska",
  mov: "video/quicktime",
  webm: "video/webm",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  flac: "audio/flac",
  m4a: "audio/mp4",
  zip: "application/zip",
  rar: "application/vnd.rar",
  "7z": "application/x-7z-compressed",
  pdf: "application/pdf",
  txt: "text/plain",
  json: "application/json",
};

const archives = new Set(["application/zip", "application/vnd.rar", "application/x-7z-compressed", "application/gzip"]);
const code = new Set(["application/json", "text/html", "text/css", "text/javascript", "application/javascript"]);

export function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

export function extensionFor(mime: string): string {
  return Object.entries(types).find(([, type]) => type === mime)?.[0] ?? "png";
}

export function mimeFor(name: string): string {
  return types[extensionOf(name)] ?? "application/octet-stream";
}

export function autoDownloads(name: string, mime: string, size: number, limit: number): boolean {
  return (
    size <= limit &&
    (viewableTypes.has(mime) || playableTypes.has(mime)) &&
    (viewableTypes.has(mimeFor(name)) || playableTypes.has(mimeFor(name)))
  );
}

export function categoryOf(mime: string): FileCategory {
  if (mime.startsWith("image/")) {
    return "image";
  }
  if (mime.startsWith("video/")) {
    return "video";
  }
  if (mime.startsWith("audio/")) {
    return "audio";
  }
  if (archives.has(mime)) {
    return "archive";
  }
  if (code.has(mime)) {
    return "code";
  }
  if (mime.startsWith("text/") || mime === "application/pdf") {
    return "document";
  }
  return "other";
}

export function formatSize(bytes: number): string {
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  const digits = unit === 0 || value >= 100 ? 0 : 1;
  return `${new Intl.NumberFormat(localeTag(), { maximumFractionDigits: digits }).format(value)}${units[unit]}`;
}
