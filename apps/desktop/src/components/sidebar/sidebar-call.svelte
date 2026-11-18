<script lang="ts">
  import CallIcon from "@/components/call-icon/call-icon.svelte";
  import { t } from "@/i18n";
  import { setDirectCalls } from "@/stores/direct-calls";
  import { preferences } from "@/stores/preferences.svelte";

  type Quality = "unknown" | "good" | "fair" | "poor";

  let {
    label,
    ringing,
    connecting,
    latency,
    onopen,
    onhangup,
  }: {
    label: string;
    ringing: boolean;
    connecting: boolean;
    latency: number | null;
    onopen: () => void;
    onhangup: () => void;
  } = $props();

  const bars = ["M5 20v-4", "M12 20v-9", "M19 20V6"];
  const filled: Record<Quality, number> = { unknown: 3, good: 3, fair: 2, poor: 1 };

  let dismissed = $state(false);

  const quality = $derived<Quality>(
    latency === null ? "unknown" : latency < 100 ? "good" : latency <= 250 ? "fair" : "poor",
  );
  const signal = $derived(ringing ? "ringing" : connecting ? "connecting" : quality);
  const weak = $derived(
    !ringing && !connecting && (quality === "fair" || quality === "poor") && !preferences.values.directCalls,
  );
  const tip = $derived(weak && !dismissed);

  function toggleTip() {
    if (weak) {
      dismissed = tip;
    } else {
      onopen();
    }
  }
</script>

<div class="sidebar-call">
  {#if tip}
    <div class="sidebar-call__tip" role="status">
      <strong class="sidebar-call__tip-title">{t("directTip.title")}</strong>
      <span class="sidebar-call__tip-body">{t("directTip.body", { latency: latency ?? 0 })}</span>
      <span class="sidebar-call__tip-actions">
        <button class="sidebar-call__tip-button" onclick={() => (dismissed = true)}>
          {t("directTip.dismiss")}
        </button>
        <button class="sidebar-call__tip-button sidebar-call__tip-button--primary" onclick={() => setDirectCalls(true)}>
          {t("directTip.enable")}
        </button>
      </span>
    </div>
  {/if}
  <button
    class="sidebar-call__signal sidebar-call__signal--{signal}"
    aria-label={t("call.connectionQuality")}
    aria-expanded={weak ? tip : undefined}
    onclick={toggleTip}
  >
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
        <path d={bar} class:sidebar-call__bar--empty={!connecting && index >= filled[quality]} />
      {/each}
    </svg>
    {#if latency !== null && !ringing && !tip}
      <span class="sidebar-call__latency" role="tooltip">{latency} ms</span>
    {/if}
  </button>
  <button
    class="sidebar-call__info"
    class:sidebar-call__info--ringing={ringing}
    class:sidebar-call__info--connecting={connecting && !ringing}
    onclick={onopen}
  >
    {label}
  </button>
  <button class="sidebar-call__hang-up" aria-label={t("call.hangUp")} title={t("call.hangUp")} onclick={onhangup}>
    <CallIcon name="hangUp" />
  </button>
</div>

<style>
  .sidebar-call {
    position: relative;
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

  .sidebar-call__info--connecting {
    color: var(--warning-color);
  }

  .sidebar-call__signal {
    position: relative;
    width: 20px;
    height: 20px;
    margin: -3px -5px -3px -3px;
    padding: 3px;
    flex: none;
    display: flex;
    border: 0;
    border-radius: 4px;
    background: transparent;
    color: var(--success-color);
    transform: translateY(-1px);
  }

  .sidebar-call__signal--ringing {
    color: var(--subtle-color);
  }

  .sidebar-call__signal--connecting {
    color: var(--warning-color);
    animation: sidebar-call__pulse 1.2s ease-in-out infinite;
  }

  @keyframes sidebar-call__pulse {
    50% {
      opacity: 0.4;
    }
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
    bottom: calc(100% + 5px);
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

  .sidebar-call__tip {
    position: absolute;
    left: 0;
    right: 0;
    bottom: calc(100% + 10px);
    z-index: 2;
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    border-radius: 8px;
    background: var(--background-color);
    border: 1px solid var(--border-color);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
    animation: sidebar-call__tip-in 0.18s ease-out;
  }

  .sidebar-call__tip::after {
    content: "";
    position: absolute;
    left: 14px;
    top: 100%;
    width: 10px;
    height: 10px;
    transform: translateY(-5px) rotate(45deg);
    background: var(--background-color);
    border-right: 1px solid var(--border-color);
    border-bottom: 1px solid var(--border-color);
  }

  .sidebar-call__tip-title {
    color: var(--muted-color);
    font-size: var(--small-font-size);
    font-weight: 600;
  }

  .sidebar-call__tip-body {
    color: var(--subtle-color);
    font-size: var(--small-font-size);
    line-height: 1.4;
  }

  .sidebar-call__tip-actions {
    margin-top: 6px;
    display: flex;
    justify-content: flex-end;
    gap: 6px;
  }

  .sidebar-call__tip-button {
    padding: 4px 10px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--subtle-color);
    font-size: var(--small-font-size);
    font-weight: 600;
    transition: all ease 0.1s;
  }

  .sidebar-call__tip-button:hover {
    background: var(--active-color);
    color: var(--muted-color);
  }

  .sidebar-call__tip-button--primary,
  .sidebar-call__tip-button--primary:hover {
    background: var(--brand-color);
    color: var(--on-brand-color);
  }

  .sidebar-call__tip-button--primary:hover {
    filter: brightness(1.1);
  }

  @keyframes sidebar-call__tip-in {
    from {
      opacity: 0;
      transform: translateY(4px);
    }
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
