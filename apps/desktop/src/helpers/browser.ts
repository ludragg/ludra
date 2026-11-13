const blockedKeys = new Set(["F3", "F5", "F7", "F12", "BrowserBack", "BrowserForward", "BrowserRefresh"]);
const blockedShortcuts = new Set(["f", "g", "j", "p", "r", "u"]);
const blockedShiftShortcuts = new Set(["c", "i", "j", "r"]);

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

export function disableBrowserBehavior() {
  window.addEventListener("contextmenu", (event) => event.preventDefault(), { capture: true });
  window.addEventListener(
    "keydown",
    (event) => {
      if (blocked(event)) {
        event.preventDefault();
        event.stopPropagation();
      }
    },
    { capture: true },
  );
}
