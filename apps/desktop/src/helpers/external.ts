import { isTauri } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";

export const repositoryUrl = "https://github.com/ludragg/ludra";

export function openExternal(event: MouseEvent) {
  if (!isTauri()) {
    return;
  }

  event.preventDefault();
  openUrl((event.currentTarget as HTMLAnchorElement).href);
}
