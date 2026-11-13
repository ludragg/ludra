<script lang="ts">
  import { chat } from "@/stores/chat.svelte";
  import SidebarConversation from "./sidebar-conversation.svelte";
  import SidebarNewConversation from "./sidebar-new-conversation.svelte";
  import SidebarProfile from "./sidebar-profile.svelte";

  let expanded = $state(true);
  let composing = $state(false);

  function toggle() {
    expanded = !expanded;
    composing = false;
  }

  function compose() {
    composing = !composing;
    expanded = true;
  }
</script>

<nav class="sidebar" aria-label="Mensagens diretas">
  <section class="sidebar__section">
    <div class="sidebar__section-header">
      <button class="sidebar__section-toggle" aria-expanded={expanded} onclick={toggle}>
        <svg
          class="sidebar__chevron"
          class:sidebar__chevron--collapsed={!expanded}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.6"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
        Mensagens diretas
      </button>
      <button class="sidebar__icon-button" aria-label="Nova conversa" title="Nova conversa" onclick={compose}>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.4"
          stroke-linecap="round"
          aria-hidden="true"
        >
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>
    </div>

    {#if composing}
      <SidebarNewConversation onclose={() => (composing = false)} />
    {/if}

    {#if expanded}
      <ul class="sidebar__list">
        {#each chat.conversations as conversation (conversation.id)}
          <li>
            <SidebarConversation {conversation} active={conversation.id === chat.activeId} />
          </li>
        {:else}
          {#if !composing}
            <li class="sidebar__empty">Nenhuma conversa ainda.</li>
          {/if}
        {/each}
      </ul>
    {/if}
  </section>

  <SidebarProfile />
</nav>

<style>
  .sidebar {
    width: 250px;
    flex: none;
    padding-top: 16px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    background: var(--dark-background-color);
    border-right: 1px solid var(--border-color);
    color: var(--muted-color);
  }

  .sidebar__section {
    min-height: 0;
    padding: 0 16px;
    flex-grow: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .sidebar__section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .sidebar__section-toggle {
    padding: 4px 0;
    display: flex;
    align-items: center;
    gap: 6px;
    border: 0;
    background: transparent;
    color: var(--subtle-color);
    font-size: var(--small-font-size);
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .sidebar__section-toggle:hover {
    color: var(--muted-color);
  }

  .sidebar__chevron {
    width: 12px;
    transition: transform ease 0.15s;
  }

  .sidebar__chevron--collapsed {
    transform: rotate(-90deg);
  }

  .sidebar__icon-button {
    width: 24px;
    height: 24px;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: 4px;
    background: transparent;
    color: var(--subtle-color);
    transition: all ease 0.1s;
  }

  .sidebar__icon-button:hover {
    background: var(--active-color);
    color: var(--muted-color);
  }

  .sidebar__icon-button svg {
    width: 14px;
  }

  .sidebar__list {
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
    overflow-y: auto;
    list-style: none;
  }

  .sidebar__empty {
    padding: 8px 0;
    font-size: var(--small-font-size);
    color: var(--subtle-color);
  }
</style>
