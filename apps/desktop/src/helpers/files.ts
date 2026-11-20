import { localeTag } from "@/i18n";

export type Picked = { path: string; name: string; size: number };

export type FileCategory = "image" | "video" | "audio" | "archive" | "document" | "code" | "other";

export const maxDirectBytes = 2 * 1024 * 1024 * 1024;

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
