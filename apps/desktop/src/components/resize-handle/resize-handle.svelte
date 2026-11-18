<script lang="ts">
  import { t } from "@/i18n";
  import { preferences } from "@/stores/preferences.svelte";

  type Setting = "watchHeight" | "callHeight";

  let { setting, minimum }: { setting: Setting; minimum: number } = $props();

  const reserved = 220;

  let start: { y: number; height: number } | null = null;

  function limit(height: number): number {
    return Math.round(Math.min(Math.max(minimum, height), window.innerHeight - reserved));
  }

  function current(handle: HTMLElement): number {
    return preferences.values[setting] || handle.parentElement?.getBoundingClientRect().height || minimum;
  }

  function onpointerdown(event: PointerEvent) {
    event.preventDefault();
    const handle = event.currentTarget as HTMLElement;
    handle.setPointerCapture(event.pointerId);
    start = { y: event.clientY, height: current(handle) };
  }

  function onpointermove(event: PointerEvent) {
    if (start && !(event.buttons & 1)) {
      onpointerup();
      return;
    }
    if (start) {
      preferences.values[setting] = limit(start.height + event.clientY - start.y);
    }
  }

  function onpointerup() {
    if (start) {
      start = null;
      preferences.set(setting, preferences.values[setting]);
    }
  }

  function onkeydown(event: KeyboardEvent) {
    const step = event.key === "ArrowUp" ? -24 : event.key === "ArrowDown" ? 24 : 0;
    if (step) {
      event.preventDefault();
      preferences.set(setting, limit(current(event.currentTarget as HTMLElement) + step));
    }
  }
</script>

<button
  type="button"
  class="resize-handle"
  aria-label={t("screen.resize")}
  data-tooltip={t("screen.resize")}
  {onpointerdown}
  {onpointermove}
  {onpointerup}
  onpointercancel={onpointerup}
  onlostpointercapture={onpointerup}
  {onkeydown}
>
  <span class="resize-handle__grip"></span>
</button>

<style>
  .resize-handle {
    position: absolute;
    left: 0;
    right: 0;
    bottom: -5px;
    z-index: 5;
    height: 10px;
    padding: 0;
    border: 0;
    background: transparent;
    display: grid;
    place-items: center;
    cursor: row-resize;
    touch-action: none;
  }

  .resize-handle__grip {
    width: 48px;
    height: 4px;
    border-radius: 2px;
    background: var(--border-color);
    transition: background ease 0.1s;
  }

  .resize-handle:hover .resize-handle__grip,
  .resize-handle:focus-visible .resize-handle__grip {
    background: var(--subtle-color);
  }
</style>
