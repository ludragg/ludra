import { defaultWindowIcon } from "@tauri-apps/api/app";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { TrayIcon } from "@tauri-apps/api/tray";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { preferences } from "@/stores/preferences.svelte";
import { updates } from "@/stores/updates.svelte";

const desktop = isTauri();
const appWindow = desktop ? getCurrentWindow() : null;

const trayId = "ludra";

let tray: TrayIcon | null = null;
let audio: AudioContext | null = null;

export async function startDesktop() {
  if (!appWindow) {
    return;
  }

  syncAutostart().catch(() => undefined);
  const trayReady = await syncTray().then(
    () => tray !== null,
    () => false,
  );
  const autostarted = await invoke<boolean>("launched_by_autostart").catch(() => false);

  if (!autostarted || !preferences.values.startMinimized || updates.resumed !== null) {
    await appWindow.show();
  } else if (!trayReady) {
    await appWindow.show();
    await appWindow.minimize();
  }
}

export async function closeWindow() {
  if (!appWindow) {
    return;
  }
  if (preferences.values.tray && tray) {
    await appWindow.hide();
  } else {
    await appWindow.close();
  }
}

export async function syncAutostart() {
  if (!desktop || !import.meta.env.PROD) {
    return;
  }

  const wanted = preferences.values.autostart;
  if ((await isEnabled()) !== wanted) {
    await (wanted ? enable() : disable());
  }
}

export async function syncTray() {
  if (!appWindow) {
    return;
  }

  await tray?.close();
  await (await TrayIcon.getById(trayId))?.close();
  tray = null;
  if (!preferences.values.tray) {
    return;
  }

  tray = await TrayIcon.new({
    id: trayId,
    icon: (await defaultWindowIcon()) ?? undefined,
    tooltip: "Ludra",
    action: (event) => {
      if (event.type !== "Click" || event.buttonState !== "Up") {
        return;
      }
      if (event.button === "Left") {
        showWindow();
      } else if (event.button === "Right") {
        invoke("tray_menu", { x: event.position.x, y: event.position.y }).catch(() => undefined);
      }
    },
  });
}

export function windowFocused(): boolean {
  return !document.hidden && document.hasFocus();
}

export function playMessageSound() {
  audio ??= new AudioContext();
  const now = audio.currentTime;
  const gain = audio.createGain();
  gain.connect(audio.destination);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.15, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);

  for (const [frequency, delay] of [
    [880, 0],
    [1320, 0.09],
  ]) {
    const tone = audio.createOscillator();
    tone.type = "sine";
    tone.frequency.setValueAtTime(frequency, now + delay);
    tone.connect(gain);
    tone.start(now + delay);
    tone.stop(now + 0.35);
  }
}

async function showWindow() {
  if (!appWindow) {
    return;
  }
  await appWindow.show();
  await appWindow.unminimize();
  await appWindow.setFocus();
}
