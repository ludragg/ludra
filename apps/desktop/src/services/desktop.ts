import { defaultWindowIcon } from "@tauri-apps/api/app";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { Menu } from "@tauri-apps/api/menu";
import { TrayIcon } from "@tauri-apps/api/tray";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";
import { t } from "@/i18n";
import { preferences } from "@/stores/preferences.svelte";

const desktop = isTauri();
const appWindow = desktop ? getCurrentWindow() : null;

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

  if (!autostarted || !preferences.values.startMinimized) {
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
  tray = null;
  if (!preferences.values.tray) {
    return;
  }

  const menu = await Menu.new({
    items: [
      { id: "open", text: t("tray.open"), action: showWindow },
      { id: "quit", text: t("tray.quit"), action: () => appWindow.destroy() },
    ],
  });

  tray = await TrayIcon.new({
    icon: (await defaultWindowIcon()) ?? undefined,
    tooltip: "Ludra",
    menu,
    showMenuOnLeftClick: false,
    action: (event) => {
      if (event.type === "Click" && event.button === "Left" && event.buttonState === "Up") {
        showWindow();
      }
    },
  });
}

export function windowFocused(): boolean {
  return !document.hidden && document.hasFocus();
}

export async function notify(title: string, body: string) {
  if (!desktop) {
    return;
  }

  let granted = await isPermissionGranted();
  if (!granted) {
    granted = (await requestPermission()) === "granted";
  }
  if (granted) {
    sendNotification({ title, body });
  }
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
