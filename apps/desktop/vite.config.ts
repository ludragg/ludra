import { fileURLToPath } from "node:url";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig, type Plugin } from "vite";

function reloadLiveState(): Plugin {
  const live = /\/src\/(stores|services)\//;
  return {
    name: "ludra:reload-live-state",
    hotUpdate({ file }) {
      if (live.test(file)) {
        this.environment.hot.send({ type: "full-reload" });
        return [];
      }
    },
  };
}

export default defineConfig({
  plugins: [svelte(), reloadLiveState()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  clearScreen: false,
  server: {
    port: 6767,
    strictPort: true,
  },
  build: {
    target: "es2022",
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL("./index.html", import.meta.url)),
        toast: fileURLToPath(new URL("./toast.html", import.meta.url)),
        tray: fileURLToPath(new URL("./tray.html", import.meta.url)),
      },
    },
  },
});
