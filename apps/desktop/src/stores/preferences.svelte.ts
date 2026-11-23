export type Locale = "pt" | "en";

export type Preferences = {
  language: Locale;
  autostart: boolean;
  startMinimized: boolean;
  tray: boolean;
  notifyMessages: boolean;
  notifyRequests: boolean;
  callPopup: boolean;
  sound: boolean;
  callSounds: boolean;
  userVolumes: Record<string, number>;
  streamVolumes: Record<string, number>;
  inputDevice: string;
  outputDevice: string;
  inputVolume: number;
  outputVolume: number;
  suppression: boolean;
  suppressionLevel: number;
  sensitivity: number;
  shareResolution: number;
  shareFps: number;
  watchHeight: number;
  callHeight: number;
  directCalls: boolean;
  directDownloads: boolean;
  askDownloadLocation: boolean;
  autoDownload: boolean;
  autoDownloadLimit: number;
};

const storageKey = "ludra.preferences";

const defaults: Preferences = {
  language: "pt",
  autostart: false,
  startMinimized: false,
  tray: true,
  notifyMessages: true,
  notifyRequests: true,
  callPopup: true,
  sound: true,
  callSounds: true,
  userVolumes: {},
  streamVolumes: {},
  inputDevice: "",
  outputDevice: "",
  inputVolume: 100,
  outputVolume: 100,
  suppression: true,
  suppressionLevel: 75,
  sensitivity: 16,
  shareResolution: 1080,
  shareFps: 60,
  watchHeight: 420,
  callHeight: 0,
  directCalls: true,
  directDownloads: true,
  askDownloadLocation: false,
  autoDownload: true,
  autoDownloadLimit: 5 * 1024 * 1024,
};

class PreferencesStore {
  values = $state<Preferences>(load());

  set<K extends keyof Preferences>(key: K, value: Preferences[K]) {
    this.values[key] = value;
    try {
      localStorage.setItem(storageKey, JSON.stringify(this.values));
    } catch {
      return;
    }
  }
}

function load(): Preferences {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) ?? "{}");
    const values = { ...defaults };
    for (const key of Object.keys(defaults) as (keyof Preferences)[]) {
      if (saved[key] !== null && typeof saved[key] === typeof defaults[key]) {
        Object.assign(values, { [key]: saved[key] });
      }
    }
    values.outputVolume = Math.min(values.outputVolume, 100);
    return values;
  } catch {
    return { ...defaults };
  }
}

export const preferences = new PreferencesStore();
