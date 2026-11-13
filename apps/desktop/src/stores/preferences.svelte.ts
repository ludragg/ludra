export type Locale = "pt" | "en";

export type Preferences = {
  language: Locale;
  autostart: boolean;
  startMinimized: boolean;
  tray: boolean;
  notifyMessages: boolean;
  notifyRequests: boolean;
  sound: boolean;
};

const storageKey = "ludra.preferences";

const defaults: Preferences = {
  language: "pt",
  autostart: true,
  startMinimized: false,
  tray: true,
  notifyMessages: true,
  notifyRequests: true,
  sound: true,
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
    return { ...defaults, ...saved };
  } catch {
    return { ...defaults };
  }
}

export const preferences = new PreferencesStore();
