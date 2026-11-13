<script lang="ts">
  import { t } from "@/i18n";
  import { chat } from "@/stores/chat.svelte";
  import SidebarConversation from "./sidebar-conversation.svelte";
  import SidebarProfile from "./sidebar-profile.svelte";

  let expanded = $state(true);
</script>

<nav class="sidebar" aria-label={t("sidebar.navigation")}>
  <div class="sidebar__top">
    <button
      class="sidebar__friends"
      class:sidebar__friends--active={chat.activeId === null && chat.view === "friends"}
      aria-current={chat.activeId === null && chat.view === "friends" ? "page" : undefined}
      onclick={() => chat.showFriends()}
    >
      <svg
        class="sidebar__friends-icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
      {t("sidebar.friends")}
      {#if chat.incoming > 0}
        <span class="sidebar__badge" aria-label={t("sidebar.pendingRequests", { count: chat.incoming })}>
          {chat.incoming}
        </span>
      {/if}
    </button>
  </div>

  <section class="sidebar__section">
    <button class="sidebar__section-toggle" aria-expanded={expanded} onclick={() => (expanded = !expanded)}>
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
      {t("sidebar.directMessages")}
    </button>

    {#if expanded}
      <ul class="sidebar__list">
        {#each chat.conversations as conversation (conversation.id)}
          <li>
            <SidebarConversation {conversation} active={conversation.id === chat.activeId} />
          </li>
        {:else}
          <li class="sidebar__empty">{t("sidebar.noConversations")}</li>
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

  .sidebar__top {
    padding: 0 16px;
  }

  .sidebar__friends {
    width: 100%;
    padding: 9px 8px;
    display: flex;
    align-items: center;
    gap: 10px;
    border: 0;
    border-radius: 4px;
    background: transparent;
    font-weight: 600;
    text-align: left;
    transition: all ease 0.1s;
  }

  .sidebar__friends:hover {
    background: var(--hover-color);
  }

  .sidebar__friends--active,
  .sidebar__friends--active:hover {
    background: var(--active-color);
  }

  .sidebar__friends-icon {
    width: 18px;
    flex: none;
  }

  .sidebar__badge {
    min-width: 18px;
    height: 18px;
    margin-left: auto;
    padding: 0 5px 1px;
    display: grid;
    place-items: center;
    border-radius: 6px;
    background: var(--brand-color);
    color: var(--dark-background-color);
    font-size: var(--tiny-font-size);
    font-weight: 700;
  }

  .sidebar__section {
    min-height: 0;
    padding: 0 16px;
    flex-grow: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .sidebar__section-toggle {
    align-self: flex-start;
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
