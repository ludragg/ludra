<script lang="ts">
  import { PRESENCE_STATUSES, type PresenceStatus } from "@/constants/presence";

  let {
    status = "online",
    size = "medium",
    ringColor = "#111118",
    bordered = true,
    labelOverride = "",
  }: {
    status?: PresenceStatus;
    size?: "small" | "medium" | "large";
    ringColor?: string;
    bordered?: boolean;
    labelOverride?: string;
  } = $props();

  const meta = $derived(PRESENCE_STATUSES[status]);
  const ariaLabel = $derived(labelOverride || meta.label);
</script>

<span
  class="status-dot status-dot--{status} status-dot--{size}"
  class:status-dot--bordered={bordered}
  style:--dot-color={meta.color}
  style:--ring-color={ringColor}
  role="img"
  aria-label={ariaLabel}
  title={ariaLabel}
>
  {#if status === "away"}
    <!-- Lua crescente própria do Ludra para o status Ausente -->
    <svg class="status-dot__moon" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M10.8 1.8a6.2 6.2 0 1 0 3.4 10.9A5.1 5.1 0 0 1 10.8 1.8Z" />
    </svg>
  {/if}
</span>

<style>
  .status-dot {
    display: inline-grid;
    place-items: center;
    flex: none;
    border-radius: 50%;
    background: var(--dot-color);
    box-sizing: content-box;
  }

  .status-dot--bordered {
    border: 3px solid var(--ring-color, #111118);
  }

  .status-dot--small {
    width: 10px;
    height: 10px;
  }

  .status-dot--small.status-dot--bordered {
    border-width: 2px;
  }

  .status-dot--medium {
    width: 12px;
    height: 12px;
  }

  .status-dot--medium.status-dot--bordered {
    border-width: 3px;
  }

  .status-dot--large {
    width: 16px;
    height: 16px;
  }

  .status-dot--large.status-dot--bordered {
    border-width: 4px;
  }

  .status-dot--away {
    background: var(--ring-color, #111118);
    color: var(--dot-color);
  }

  .status-dot__moon {
    width: 100%;
    height: 100%;
    display: block;
  }

  /* Invisível: anel cinza com centro vazio */
  .status-dot--invisible {
    background: var(--ring-color, #111118);
    box-shadow: inset 0 0 0 2.5px var(--dot-color);
  }

  .status-dot--small.status-dot--invisible {
    box-shadow: inset 0 0 0 2px var(--dot-color);
  }
</style>
