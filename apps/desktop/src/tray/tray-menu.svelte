<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { t } from "@/i18n";

  let width = $state(0);
  let height = $state(0);
  let placed = false;
  let unfocused = false;

  function run(command: "tray_open" | "tray_quit" | "tray_close") {
    invoke(command).catch(() => undefined);
  }

  $effect(() => {
    if (!placed && width > 0 && height > 0) {
      placed = true;
      invoke("tray_layout", { width, height })
        .catch(() => undefined)
        .finally(() => window.setTimeout(() => (unfocused = !document.hasFocus()), 300));
    }
  });
</script>

<svelte:window
  onblur={() => run("tray_close")}
  onkeydown={(event) => {
    if (event.key === "Escape") {
      run("tray_close");
    }
  }}
/>

<div
  class="tray-menu"
  role="menu"
  aria-label="Ludra"
  tabindex="-1"
  bind:clientWidth={width}
  bind:clientHeight={height}
  onpointerleave={() => {
    if (unfocused) {
      run("tray_close");
    }
  }}
>
  <div class="tray-menu__list">
    <button
      class="tray-menu__item"
      role="menuitem"
      onclick={() => run("tray_open")}
      {@attach (button) => button.focus()}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M3 9h18" />
      </svg>
      {t("tray.open")}
    </button>
    <button class="tray-menu__item tray-menu__item--danger" role="menuitem" onclick={() => run("tray_quit")}>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M12 2v10" />
        <path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
      </svg>
      {t("tray.quit")}
    </button>
  </div>
</div>

<style>
  :global(html),
  :global(body) {
    height: auto;
    overflow: hidden;
    background: transparent;
  }

  .tray-menu {
    width: 200px;
    padding: 8px;
  }

  .tray-menu__list {
    padding: 6px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    border-radius: 8px;
    background: var(--background-color);
    border: 1px solid var(--border-color);
    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.45);
  }

  .tray-menu__item {
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

  .tray-menu__item--danger {
    color: #f6746b;
  }

  .tray-menu__item:hover,
  .tray-menu__item:focus-visible {
    background: var(--hover-color);
    outline: none;
  }

  .tray-menu__item svg {
    width: 14px;
    flex: none;
  }
</style>
