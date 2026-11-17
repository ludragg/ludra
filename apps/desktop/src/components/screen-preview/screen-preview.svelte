<script lang="ts">
  import ViewerBadge from "@/components/viewer-badge/viewer-badge.svelte";
  import { t } from "@/i18n";

  let {
    image,
    name,
    width,
    own = false,
    viewers = [],
    onwatch,
  }: {
    image: string | null;
    name: string;
    width: number;
    own?: boolean;
    viewers?: string[];
    onwatch?: () => void;
  } = $props();
</script>

{#if own}
  <div class="screen-preview screen-preview--own" style:width="{width}px" title={t("screen.yourScreen")}>
    {#if image}
      <img class="screen-preview__image" src={image} alt="" />
    {/if}
    <span class="screen-preview__label">{t("screen.watchShort")}</span>
    {#if viewers.length}
      <span class="screen-preview__viewers">
        <ViewerBadge names={viewers} />
      </span>
    {/if}
  </div>
{:else if onwatch}
  <button
    class="screen-preview screen-preview--watchable"
    style:width="{width}px"
    aria-label={t("screen.watch", { name })}
    title={t("screen.watch", { name })}
    onclick={() => onwatch?.()}
  >
    {#if image}
      <img class="screen-preview__image" src={image} alt="" />
    {/if}
    <span class="screen-preview__label">{t("screen.watchShort")}</span>
  </button>
{/if}

<style>
  .screen-preview {
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
    top: 4px;
    left: 4px;
    display: flex;
  }

  .screen-preview--watchable:hover .screen-preview__image {
    filter: brightness(0.75);
  }

  .screen-preview__label {
    position: relative;
    padding: 3px 10px;
    border-radius: 6px;
    background: rgba(0, 0, 0, 0.55);
    color: #ffffff;
    font-size: var(--small-font-size);
    font-weight: 600;
  }
</style>
