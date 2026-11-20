import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dataDir, settingsFile } from "./paths.mjs";

const defaults = { smtp: false, accounts: [] };

export const settings = load();

function load() {
  try {
    return { ...defaults, ...JSON.parse(readFileSync(settingsFile, "utf8")) };
  } catch {
    return structuredClone(defaults);
  }
}

export function saveSettings() {
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(settingsFile, `${JSON.stringify(settings, null, 2)}\n`);
}
