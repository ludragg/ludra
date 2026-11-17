<script lang="ts">
  import { t } from "@/i18n";

  let { names }: { names: string[] } = $props();
</script>

<span class="viewer-badge">
  <button type="button" class="viewer-badge__count" aria-label={t("screen.viewers", { count: names.length })}>
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
    {names.length}
  </button>
  {#if names.length}
    <span class="viewer-badge__list" role="tooltip">
      <span class="viewer-badge__title">{t("screen.watchingNow")}</span>
      {#each names as name, index (index)}
        <span class="viewer-badge__name">{name}</span>
      {/each}
    </span>
  {/if}
</span>

<style>
  .viewer-badge {
    position: relative;
    flex: none;
    display: flex;
  }

  .viewer-badge__count {
    padding: 2px 7px;
    display: flex;
    align-items: center;
    gap: 4px;
    border: 0;
    border-radius: 4px;
    background: rgba(0, 0, 0, 0.55);
    color: var(--muted-color);
    font-size: var(--small-font-size);
    font-variant-numeric: tabular-nums;
    cursor: default;
  }

  .viewer-badge__count svg {
    width: 14px;
    height: 14px;
  }

  .viewer-badge__list {
    position: absolute;
    top: calc(100% + 6px);
    left: 0;
    z-index: 5;
    min-width: 140px;
    max-width: 220px;
    padding: 8px 10px;
    display: none;
    flex-direction: column;
    gap: 4px;
    border-radius: 6px;
    background: var(--background-color);
    border: 1px solid var(--border-color);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
  }

  .viewer-badge:hover .viewer-badge__list,
  .viewer-badge:has(:focus-visible) .viewer-badge__list {
    display: flex;
  }

  .viewer-badge__title {
    color: var(--subtle-color);
    font-size: var(--tiny-font-size);
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .viewer-badge__name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--muted-color);
    font-size: var(--small-font-size);
  }
</style>
