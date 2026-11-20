<script lang="ts">
  import Slider from "@/components/slider/slider.svelte";
  import { t } from "@/i18n";

  let {
    id,
    label,
    value,
    latency,
    x,
    y,
    onchange,
    onclose,
  }: {
    id: string;
    label: string;
    value: number;
    latency?: number | null;
    x: number;
    y: number;
    onchange: (percent: number) => void;
    onclose: () => void;
  } = $props();

  let menu = $state<HTMLElement>();

  const width = 240;
  const left = $derived(Math.min(x, window.innerWidth - width - 8));
  const top = $derived(Math.min(y, window.innerHeight - (latency === undefined ? 96 : 128)));

  function onpointerdown(event: PointerEvent) {
    if (!menu?.contains(event.target as Node)) {
      onclose();
    }
  }

  function onkeydown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      onclose();
    }
  }
</script>

<svelte:window {onpointerdown} {onkeydown} />

<div
  class="volume-menu"
  role="dialog"
  aria-label={label}
  style:left="{left}px"
  style:top="{top}px"
  style:width="{width}px"
  bind:this={menu}
>
  {#if latency !== undefined}
    <div class="volume-menu__latency">
      <span>{t("call.latency")}</span>
      <span class="volume-menu__ping">{latency === null ? "-" : `${latency} ms`}</span>
    </div>
  {/if}
  <Slider {id} {label} {value} {onchange} />
</div>

<style>
  .volume-menu__latency {
    margin-bottom: 10px;
    display: flex;
    justify-content: space-between;
    font-size: var(--small-font-size);
    color: var(--subtle-color);
  }

  .volume-menu__ping {
    font-variant-numeric: tabular-nums;
    color: var(--muted-color);
  }

  .volume-menu {
    position: fixed;
    z-index: 20;
    padding: 12px 14px;
    border-radius: 8px;
    background: var(--background-color);
    border: 1px solid var(--border-color);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
  }
</style>
