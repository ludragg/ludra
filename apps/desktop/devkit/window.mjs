import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { browserDir, panelExe, panelPort, windowCrateDir } from "./paths.mjs";

export const panelUrl = `http://127.0.0.1:${panelPort}/`;

const edgeCandidates = [process.env["ProgramFiles(x86)"], process.env.ProgramFiles, process.env.LOCALAPPDATA]
  .filter(Boolean)
  .map((base) => join(base, "Microsoft", "Edge", "Application", "msedge.exe"));

const quietPreferences = {
  credentials_enable_service: false,
  credentials_enable_autosignin: false,
  profile: { password_manager_enabled: false, exit_type: "Normal", exited_cleanly: true },
  autofill: { enabled: false, profile_enabled: false, credit_card_enabled: false },
  translate: { enabled: false },
  edge_shopping_assistant_enabled: false,
  browser: { show_hub_apps_tower: false, show_toolbar_collections_button: false },
  sync: { requested: false },
  edge_quick_search: { show_mini_menu: false, PDF_show_mini_menu: false },
};

const edgeFlags = [
  "--window-size=1240,820",
  "--no-first-run",
  "--no-default-browser-check",
  "--disable-sync",
  "--disable-features=Translate,AutofillServerCommunication,MiniMenu,msEdgeComposeInlineMiniMenu",
];

const windowSources = ["src", "capabilities", "Cargo.toml", "Cargo.lock", "build.rs", "tauri.conf.json"];

export function buildWindow() {
  if (existsSync(panelExe) && newest(windowSources.map((name) => join(windowCrateDir, name))) <= mtime(panelExe)) {
    return;
  }
  console.log("Building the Ludra Dev window. The first time takes a minute or two...");
  spawnSync("cargo", ["build", "--color", "never"], { cwd: windowCrateDir, stdio: "inherit", windowsHide: true });
}

export function openWindow() {
  if (existsSync(panelExe)) {
    spawn(panelExe, [], { detached: true, stdio: "ignore" }).unref();
    return;
  }
  const edge = edgeCandidates.find((path) => existsSync(path));
  if (edge) {
    quietProfile();
  }
  const [command, args] = edge
    ? [edge, [`--app=${panelUrl}`, `--user-data-dir=${browserDir}`, ...edgeFlags]]
    : ["cmd", ["/c", "start", "", panelUrl]];
  spawn(command, args, { detached: true, stdio: "ignore", windowsHide: !edge }).unref();
}

function mtime(path) {
  try {
    return statSync(path).mtimeMs;
  } catch {
    return 0;
  }
}

function newest(paths) {
  return Math.max(
    ...paths.map((path) => {
      try {
        const info = statSync(path);
        return info.isDirectory() ? newest(readdirSync(path).map((name) => join(path, name))) : info.mtimeMs;
      } catch {
        return 0;
      }
    }),
    0,
  );
}

function quietProfile() {
  const profileDir = join(browserDir, "Default");
  const file = join(profileDir, "Preferences");
  let current = {};
  try {
    current = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    mkdirSync(profileDir, { recursive: true });
  }
  writeFileSync(file, JSON.stringify(merge(current, quietPreferences)));
}

function merge(target, source) {
  for (const [key, value] of Object.entries(source)) {
    const plain = value && typeof value === "object" && !Array.isArray(value);
    target[key] = plain ? merge(target[key] && typeof target[key] === "object" ? target[key] : {}, value) : value;
  }
  return target;
}
