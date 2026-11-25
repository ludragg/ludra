import { invoke } from "@tauri-apps/api/core";

export type DetectedEncoder = { id: "amf" | "nvenc" | "windows"; name: string };

let detected: Promise<DetectedEncoder[]> | null = null;

export function hardwareEncoders(): Promise<DetectedEncoder[]> {
  detected ??= invoke<DetectedEncoder[]>("stream_encoders").catch(() => []);
  return detected;
}
