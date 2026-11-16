import { invoke, isTauri } from "@tauri-apps/api/core";

const blockedKeys = new Set(["F3", "F7", "F12", "BrowserBack", "BrowserForward"]);
const blockedShortcuts = new Set(["f", "g", "j", "p", "u"]);
const blockedShiftShortcuts = new Set(["c", "i", "j"]);

function reloading(event: KeyboardEvent): boolean {
  if (event.key === "F5" || event.key === "BrowserRefresh") {
    return true;
  }
  return (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "r";
}

function blocked(event: KeyboardEvent): boolean {
  if (blockedKeys.has(event.key)) {
    return true;
  }
  if (event.altKey && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
    return true;
  }
  if (!event.ctrlKey && !event.metaKey) {
    return false;
  }

  const key = event.key.toLowerCase();
  return (event.shiftKey ? blockedShiftShortcuts : blockedShortcuts).has(key);
}

function reload() {
  if (!isTauri()) {
    location.reload();
    return;
  }
  invoke("reload_app").catch(() => location.reload());
}

export function disableBrowserBehavior() {
  window.addEventListener("contextmenu", (event) => event.preventDefault(), { capture: true });
  window.addEventListener(
    "keydown",
    (event) => {
      if (reloading(event)) {
        event.preventDefault();
        event.stopPropagation();
        if (!event.repeat) {
          reload();
        }
        return;
      }
      if (blocked(event)) {
        event.preventDefault();
        event.stopPropagation();
      }
    },
    { capture: true },
  );
}
