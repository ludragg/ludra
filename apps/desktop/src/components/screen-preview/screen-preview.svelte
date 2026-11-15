<script lang="ts">
  import { t } from "@/i18n";

  let {
    image,
    name,
    width,
    own = false,
    onwatch,
  }: { image: string | null; name: string; width: number; own?: boolean; onwatch?: () => void } = $props();
</script>

{#if onwatch || own}
  <button
    class="screen-preview"
    class:screen-preview--watchable={!own}
    class:screen-preview--own={own}
    disabled={own}
    style:width="{width}px"
    aria-label={own ? t("screen.yourScreen") : t("screen.watch", { name })}
    title={own ? t("screen.yourScreen") : t("screen.watch", { name })}
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
    cursor: not-allowed;
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
