<script lang="ts">
  import ViewerBadge from "@/components/viewer-badge/viewer-badge.svelte";
  import { t } from "@/i18n";

  let {
    image,
    name,
    width,
    own = false,
    disabled = false,
    locked = false,
    viewers = [],
    onwatch,
  }: {
    image: string | null;
    name: string;
    width: number;
    own?: boolean;
    disabled?: boolean;
    locked?: boolean;
    viewers?: string[];
    onwatch?: () => void;
  } = $props();
</script>

{#if own}
  <div
    class="screen-preview screen-preview--own"
    style:width="{width}px"
    role="group"
    aria-label={t("screen.yourScreen")}
  >
    {#if image}
      <img class="screen-preview__image" src={image} alt="" />
    {/if}
    <span class="screen-preview__label">
      <span class="screen-preview__idle">{t("screen.watchShort")}</span>
      <span class="screen-preview__hover">{t("screen.yourScreen")}</span>
    </span>
    {#if viewers.length}
      <span class="screen-preview__viewers">
        <ViewerBadge names={viewers} />
      </span>
    {/if}
  </div>
{:else if onwatch}
  <button
    class="screen-preview screen-preview--watchable"
    class:screen-preview--locked={locked}
    style:width="{width}px"
    aria-label={locked ? t("screen.locked", { name }) : t("screen.watch", { name })}
    aria-disabled={locked}
    data-tooltip={locked ? t("screen.locked", { name }) : undefined}
    {disabled}
    onclick={() => {
      if (!locked) {
        onwatch?.();
      }
    }}
  >
    {#if image}
      <img class="screen-preview__image" src={image} alt="" />
    {/if}
    <span class="screen-preview__label">
      {#if locked}
        <svg
          class="screen-preview__lock"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <rect x="4" y="11" width="16" height="10" rx="2" />
          <path d="M8 11V7a4 4 0 0 1 8 0v4" />
        </svg>
      {/if}
      {locked ? t("screen.lockedShort") : t("screen.watchShort")}
    </span>
  </button>
{/if}

<style>
  .screen-preview {
    container-type: inline-size;
    position: relative;
    padding: 0;
    flex: none;
    aspect-ratio: 16 / 9;
    display: grid;
    place-items: center;
    overflow: hidden;
    border: 1px solid var(--border-color);
    border-radius: 8px;
    background: #000000;
    transition: width ease 0.15s;
  }

  .screen-preview__image {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    filter: brightness(0.55);
    transition: filter ease 0.15s;
  }

  .screen-preview--own {
    overflow: visible;
    cursor: not-allowed;
  }

  .screen-preview--own .screen-preview__image {
    border-radius: 7px;
  }

  .screen-preview__viewers {
    position: absolute;
    top: clamp(2px, 2.8cqw, 4px);
    left: clamp(2px, 2.8cqw, 4px);
    display: flex;
  }

  .screen-preview__viewers :global(.viewer-badge__count) {
    padding: clamp(1px, 1.4cqw, 2px) clamp(4px, 4.9cqw, 7px);
    gap: clamp(2px, 2.8cqw, 4px);
    font-size: clamp(9px, 8.4cqw, 12px);
    line-height: 1.2;
  }

  .screen-preview__viewers :global(.viewer-badge__count svg) {
    width: clamp(10px, 9.7cqw, 14px);
    height: clamp(10px, 9.7cqw, 14px);
  }

  .screen-preview--locked {
    cursor: default;
  }

  .screen-preview__lock {
    width: clamp(10px, 8.4cqw, 12px);
    height: clamp(10px, 8.4cqw, 12px);
    margin-right: 5px;
    vertical-align: -1px;
  }

  .screen-preview--watchable:hover:not(:disabled):not(.screen-preview--locked) .screen-preview__image {
    filter: brightness(0.75);
  }

  .screen-preview--watchable:disabled {
    cursor: progress;
  }

  .screen-preview__hover,
  .screen-preview--own:hover .screen-preview__idle {
    display: none;
  }

  .screen-preview--own:hover .screen-preview__hover {
    display: inline;
  }

  .screen-preview__label {
    position: relative;
    padding: clamp(1.5px, 2.1cqw, 3px) clamp(7px, 7cqw, 10px);
    border-radius: 6px;
    background: rgba(0, 0, 0, 0.55);
    color: #ffffff;
    font-size: clamp(10px, 8.4cqw, 12px);
    line-height: 1.3;
    font-weight: 600;
  }
</style>
