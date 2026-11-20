import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const devkitDir = fileURLToPath(new URL(".", import.meta.url));
export const uiDir = join(devkitDir, "ui");
export const desktopDir = join(devkitDir, "..");
export const srcDir = join(desktopDir, "src");
export const tauriDir = join(desktopDir, "src-tauri");
export const windowCrateDir = join(devkitDir, "window");
export const repoDir = join(desktopDir, "..", "..");
export const serverDir = join(repoDir, "server");
export const composeFile = join(repoDir, "compose.yaml");
export const envFile = join(repoDir, ".env");

export const dataDir = join(process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local"), "app.ludra.dev");
export const profilesDir = join(dataDir, "profiles");
export const browserDir = join(dataDir, "devkit-browser");
export const settingsFile = join(dataDir, "devkit.json");
export const logFile = join(dataDir, "devkit.log");

export const serverExe = join(repoDir, "bin", "ludradev-server.exe");
export const builtExe = join(tauriDir, "target", "debug", "ludra.exe");
export const appExe = join(tauriDir, "target", "debug", "ludradev.exe");
export const panelExe = join(tauriDir, "target", "debug", "ludradev-panel.exe");
export const stagedExe = join(tauriDir, "target", "debug", "ludradev.next.exe");

export const panelPort = 6790;
export const serverPort = 8080;
export const interfacePort = 6767;
