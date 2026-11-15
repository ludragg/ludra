<script lang="ts">
  import CallIcon from "@/components/call-icon/call-icon.svelte";
  import { t } from "@/i18n";

  type Quality = "unknown" | "good" | "fair" | "poor";

  let {
    label,
    ringing,
    latency,
    onopen,
    onhangup,
  }: { label: string; ringing: boolean; latency: number | null; onopen: () => void; onhangup: () => void } = $props();

  const bars = ["M5 20v-4", "M12 20v-9", "M19 20V6"];
  const filled: Record<Quality, number> = { unknown: 3, good: 3, fair: 2, poor: 1 };

  const quality = $derived<Quality>(
    latency === null ? "unknown" : latency < 100 ? "good" : latency <= 250 ? "fair" : "poor",
  );
</script>

<div class="sidebar-call">
  <button class="sidebar-call__info" class:sidebar-call__info--ringing={ringing} onclick={onopen}>
    <span class="sidebar-call__signal sidebar-call__signal--{ringing ? 'unknown' : quality}">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.4"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        {#each bars as bar, index (bar)}
          <path d={bar} class:sidebar-call__bar--empty={index >= filled[quality]} />
        {/each}
      </svg>
      {#if latency !== null && !ringing}
        <span class="sidebar-call__latency" role="tooltip">{latency} ms</span>
      {/if}
    </span>
    {label}
  </button>
  <button class="sidebar-call__hang-up" aria-label={t("call.hangUp")} title={t("call.hangUp")} onclick={onhangup}>
    <CallIcon name="hangUp" />
  </button>
</div>

<style>
  .sidebar-call {
    padding: 8px 8px 8px 12px;
    display: flex;
    align-items: center;
    gap: 8px;
    border-radius: 4px;
    background: var(--surface-color);
  }

  .sidebar-call__info {
    min-width: 0;
    padding: 0;
    flex-grow: 1;
    display: flex;
    align-items: center;
    gap: 6px;
    border: 0;
    background: transparent;
    color: var(--success-color);
    font-size: var(--hint-font-size);
    font-weight: 600;
    text-align: left;
  }

  .sidebar-call__info--ringing {
    color: var(--subtle-color);
  }

  .sidebar-call__signal {
    position: relative;
    width: 14px;
    height: 14px;
    flex: none;
    display: flex;
    transform: translateY(-1px);
  }

  .sidebar-call__signal svg {
    width: 100%;
    height: 100%;
  }

  .sidebar-call__signal--good {
    color: var(--success-color);
  }

  .sidebar-call__signal--fair {
    color: var(--warning-color);
  }

  .sidebar-call__signal--poor {
    color: #f6746b;
  }

  .sidebar-call__bar--empty {
    opacity: 0.25;
  }

  .sidebar-call__latency {
    position: absolute;
    bottom: calc(100% + 8px);
    left: 50%;
    padding: 4px 8px;
    display: none;
    transform: translateX(-50%);
    border-radius: 6px;
    background: var(--background-color);
    border: 1px solid var(--border-color);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
    color: var(--muted-color);
    font-size: var(--small-font-size);
    font-weight: 600;
    white-space: nowrap;
    pointer-events: none;
  }

  .sidebar-call__signal:hover .sidebar-call__latency {
    display: block;
  }

  .sidebar-call__hang-up {
    width: 32px;
    height: 32px;
    padding: 7px;
    flex: none;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--subtle-color);
    transition: all ease 0.1s;
  }

  .sidebar-call__hang-up:hover {
    background: rgba(225, 29, 72, 0.15);
    color: #f6746b;
  }
</style>
