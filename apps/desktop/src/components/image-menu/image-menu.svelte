<script lang="ts">
  import { copyImage } from "@/helpers/copy-image";
  import { t } from "@/i18n";
  import { imageMenu } from "@/stores/image-menu.svelte";

  const width = 190;
  let menu = $state<HTMLElement>();

  const current = $derived(imageMenu.current);
  const left = $derived(current ? Math.min(current.x, window.innerWidth - width - 8) : 0);
  const top = $derived(current ? Math.min(current.y, window.innerHeight - 56) : 0);

  async function copy() {
    const source = current?.source;
    imageMenu.close();
    if (source) {
      await copyImage(source).catch(() => undefined);
    }
  }

  function onpointerdown(event: PointerEvent) {
    if (current && !menu?.contains(event.target as Node)) {
      imageMenu.close();
    }
  }

  function onkeydown(event: KeyboardEvent) {
    if (current && event.key === "Escape") {
      event.stopPropagation();
      imageMenu.close();
    }
  }
</script>

<svelte:window {onpointerdown} onkeydowncapture={onkeydown} />

{#if current}
  <div
    class="image-menu"
    role="menu"
    style:left="{left}px"
    style:top="{top}px"
    style:width="{width}px"
    bind:this={menu}
  >
    <button type="button" class="image-menu__item" role="menuitem" onclick={copy} {@attach (button) => button.focus()}>
      <svg
        class="image-menu__icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <rect x="9" y="9" width="13" height="13" rx="2" />
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
      </svg>
      {t("chat.copyImage")}
    </button>
  </div>
{/if}

<style>
  .image-menu {
    position: fixed;
    z-index: 100;
    padding: 6px;
    border-radius: 8px;
    background: var(--background-color);
    border: 1px solid var(--border-color);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
  }

  .image-menu__item {
    width: 100%;
    padding: 8px 10px;
    display: flex;
    align-items: center;
    gap: 10px;
    border: 0;
    border-radius: 4px;
    background: transparent;
    color: var(--muted-color);
    font-size: var(--hint-font-size);
    text-align: left;
    transition: background ease 0.1s;
  }

  .image-menu__item:hover,
  .image-menu__item:focus-visible {
    background: var(--hover-color);
  }

  .image-menu__icon {
    width: 14px;
    flex: none;
  }
</style>
