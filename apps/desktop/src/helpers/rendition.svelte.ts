import { convertFileSrc, invoke } from "@tauri-apps/api/core";

export async function rendition(path: string, view = false): Promise<string> {
  const reduced = await invoke<string>("image_rendition", { path, view }).catch(() => path);
  return convertFileSrc(reduced);
}

export class Thumbnail {
  url = $state<string | null>(null);

  constructor(path: () => string | null) {
    $effect(() => {
      const current = path();
      this.url = null;
      if (current) {
        void rendition(current).then((url) => {
          if (current === path()) {
            this.url = url;
          }
        });
      }
    });
  }
}
