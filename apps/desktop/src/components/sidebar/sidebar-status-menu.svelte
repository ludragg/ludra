<script lang="ts">
  import { Presence } from "@/protocol/ludra/v1/models_pb";
  import { chat } from "@/stores/chat.svelte";

  let { onclose }: { onclose: () => void } = $props();

  const options = [
    { presence: Presence.ONLINE, label: "Online" },
    { presence: Presence.INVISIBLE, label: "Invisível" },
  ];

  async function choose(presence: Presence) {
    onclose();
    if (presence !== chat.user?.presence) {
      await chat.setPresence(presence).catch(() => undefined);
    }
  }
</script>

<div class="sidebar-status-menu" role="menu" aria-label="Status">
  {#each options as option (option.presence)}
    {@const checked = option.presence === chat.user?.presence}
    <button
      class="sidebar-status-menu__option"
      role="menuitemradio"
      aria-checked={checked}
      onclick={() => choose(option.presence)}
    >
      <span
        class="sidebar-status-menu__dot"
        class:sidebar-status-menu__dot--online={option.presence === Presence.ONLINE}
      ></span>
      <span class="sidebar-status-menu__label">{option.label}</span>
      {#if checked}
        <svg
          class="sidebar-status-menu__check"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.4"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M5 12l5 5L20 7" />
        </svg>
      {/if}
    </button>
  {/each}
</div>

<style>
  .sidebar-status-menu {
    position: absolute;
    left: 0;
    right: 0;
    bottom: calc(100% + 8px);
    padding: 6px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    border-radius: 8px;
    background: var(--background-color);
    border: 1px solid var(--border-color);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
    z-index: 1;
  }

  .sidebar-status-menu__option {
    width: 100%;
    padding: 8px 10px;
    display: flex;
    align-items: center;
    gap: 10px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    text-align: left;
    transition: background ease 0.1s;
  }

  .sidebar-status-menu__option:hover {
    background: var(--surface-color);
  }

  .sidebar-status-menu__dot {
    width: 10px;
    height: 10px;
    flex: none;
    border-radius: 50%;
    border: 2.5px solid var(--subtle-color);
  }

  .sidebar-status-menu__dot--online {
    border: 0;
    background: var(--success-color);
  }

  .sidebar-status-menu__label {
    flex-grow: 1;
    font-weight: 600;
    color: var(--muted-color);
  }

  .sidebar-status-menu__check {
    width: 16px;
    color: var(--brand-color);
  }
</style>
