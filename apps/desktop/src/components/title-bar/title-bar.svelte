<script lang="ts">
  import { isTauri } from "@tauri-apps/api/core";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import Logo from "@/components/logo/logo.svelte";

  const appWindow = isTauri() ? getCurrentWindow() : null;

  let maximized = $state(false);

  $effect(() => {
    if (!appWindow) {
      return;
    }

    const sync = async () => {
      maximized = await appWindow.isMaximized();
    };
    sync();

    const unlisten = appWindow.onResized(sync);
    return () => {
      unlisten.then((stop) => stop());
    };
  });
</script>

<header class="title-bar" data-tauri-drag-region>
  <div class="title-bar__brand" data-tauri-drag-region>
    <Logo size="tiny" />
    <span class="title-bar__name" data-tauri-drag-region>Ludra</span>
  </div>

  <div class="title-bar__controls">
    <button class="title-bar__button" aria-label="Minimizar" onclick={() => appWindow?.minimize()}>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        aria-hidden="true"
      >
        <path d="M5 12h14" />
      </svg>
    </button>
    <button
      class="title-bar__button"
      aria-label={maximized ? "Restaurar" : "Maximizar"}
      onclick={() => appWindow?.toggleMaximize()}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
        {#if maximized}
          <rect x="5" y="8" width="11" height="11" rx="1.5" />
          <path d="M8 8V6.5A1.5 1.5 0 0 1 9.5 5H17.5A1.5 1.5 0 0 1 19 6.5V14.5A1.5 1.5 0 0 1 17.5 16H16" />
        {:else}
          <rect x="5" y="5" width="14" height="14" rx="1.5" />
        {/if}
      </svg>
    </button>
    <button class="title-bar__button title-bar__button--close" aria-label="Fechar" onclick={() => appWindow?.close()}>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        aria-hidden="true"
      >
        <path d="M6 6l12 12M18 6L6 18" />
      </svg>
    </button>
  </div>
</header>

<style>
  .title-bar {
    height: 32px;
    flex: none;
    display: flex;
    align-items: center;
    background: var(--dark-background-color);
    border-bottom: 1px solid var(--border-color);
    user-select: none;
  }

  .title-bar__brand {
    height: 100%;
    padding: 0 12px;
    flex-grow: 1;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .title-bar__name {
    font-family: var(--font-display);
    font-size: var(--hint-font-size);
    font-weight: 600;
    line-height: 1;
    color: var(--body-color);
    transform: translateY(1px);
  }

  .title-bar__controls {
    height: 100%;
    display: flex;
  }

  .title-bar__button {
    width: 46px;
    height: 100%;
    padding: 0;
    display: grid;
    place-items: center;
    border: 0;
    background: transparent;
    color: var(--subtle-color);
    transition: all ease 0.1s;
  }

  .title-bar__button:hover {
    background: var(--border-color);
    color: var(--muted-color);
  }

  .title-bar__button--close:hover {
    background: var(--error-color);
    color: #ffffff;
  }

  .title-bar__button svg {
    width: 14px;
  }
</style>
