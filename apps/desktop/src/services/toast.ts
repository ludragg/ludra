import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export type Toast = {
  title: string;
  body: string;
  kind: "user" | "group";
  id: string;
  name: string;
  avatar: string;
  target: string;
};

export const friendsTarget = "friends";
export const callTarget = "call";

export function showToast(toast: Toast) {
  if (isTauri()) {
    invoke("toast_push", { toast }).catch(() => undefined);
  }
}

export function onToastOpen(handler: (target: string) => void) {
  if (isTauri()) {
    listen<string>("toast-open", ({ payload }) => handler(payload)).catch(() => undefined);
  }
}
