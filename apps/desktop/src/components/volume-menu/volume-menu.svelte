<script lang="ts">
  import Slider from "@/components/slider/slider.svelte";

  let {
    id,
    label,
    value,
    x,
    y,
    onchange,
    onclose,
  }: {
    id: string;
    label: string;
    value: number;
    x: number;
    y: number;
    onchange: (percent: number) => void;
    onclose: () => void;
  } = $props();

  let menu = $state<HTMLElement>();

  const width = 240;
  const left = $derived(Math.min(x, window.innerWidth - width - 8));
  const top = $derived(Math.min(y, window.innerHeight - 96));

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
  <Slider {id} {label} {value} {onchange} />
</div>

<style>
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
