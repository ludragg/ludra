<script lang="ts">
  import { t } from "@/i18n";
  import { calls } from "@/stores/call.svelte";
  import { chat, type SidebarTab } from "@/stores/chat.svelte";
  import { groupCall } from "@/stores/group-call.svelte";
  import GroupDialog from "@/pages/group/group-dialog.svelte";
  import SidebarCall from "./sidebar-call.svelte";
  import SidebarConversation from "./sidebar-conversation.svelte";
  import SidebarGroup from "./sidebar-group.svelte";
  import SidebarProfile from "./sidebar-profile.svelte";

  let creating = $state(false);

  const tabs: { id: SidebarTab; label: string }[] = $derived([
    { id: "direct", label: t("sidebar.direct") },
    { id: "group", label: t("sidebar.groups") },
  ]);

  function unreadIn(tab: SidebarTab): number {
    const list = tab === "direct" ? chat.directs : chat.groups;
    return list.reduce((total, { id }) => total + (chat.unread[id] ?? 0), 0);
  }

  function openGroup(conversationId: string) {
    chat.sidebarTab = "group";
    chat.select(conversationId).catch(() => undefined);
  }
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
    <div class="sidebar__tabs">
      <div class="sidebar__tablist" role="tablist" aria-label={t("sidebar.conversations")}>
        {#each tabs as tab (tab.id)}
          <button
            class="sidebar__tab"
            class:sidebar__tab--active={chat.sidebarTab === tab.id}
            role="tab"
            aria-selected={chat.sidebarTab === tab.id}
            onclick={() => (chat.sidebarTab = tab.id)}
          >
            {tab.label}
            {#if unreadIn(tab.id) > 0 && chat.sidebarTab !== tab.id}
              <span class="sidebar__tab-dot" aria-label={t("sidebar.unread", { count: unreadIn(tab.id) })}></span>
            {/if}
          </button>
        {/each}
      </div>
      {#if chat.sidebarTab === "group"}
        <button
          class="sidebar__create"
          aria-label={t("group.create")}
          data-tooltip={t("group.create")}
          onclick={() => (creating = true)}
        >
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
      {/if}
    </div>

    <ul class="sidebar__list">
      {#if chat.sidebarTab === "direct"}
        {#each chat.directs as conversation (conversation.id)}
          <li>
            <SidebarConversation {conversation} active={conversation.id === chat.activeId} />
          </li>
        {:else}
          <li class="sidebar__empty">{t("sidebar.noConversations")}</li>
        {/each}
      {:else}
        {#each chat.groups as conversation (conversation.id)}
          <li>
            <SidebarGroup {conversation} active={conversation.id === chat.activeId} />
          </li>
        {:else}
          <li class="sidebar__empty">{t("sidebar.noGroups")}</li>
        {/each}
      {/if}
    </ul>
  </section>

  <div class="sidebar__footer">
    {#if calls.current && calls.current.status !== "incoming"}
      {@const call = calls.current}
      {@const connecting = call.status === "connecting" || calls.connecting}
      <SidebarCall
        label={call.status === "outgoing" ? t("call.calling") : connecting ? t("call.connecting") : t("call.inCall")}
        ringing={call.status === "outgoing"}
        {connecting}
        latency={calls.latency}
        onopen={() => chat.start(call.peer.username).catch(() => undefined)}
        onhangup={() => calls.hangUp()}
      />
    {:else if groupCall.current}
      {@const call = groupCall.current}
      <SidebarCall
        label={groupCall.connecting
          ? t("call.connecting")
          : t("group.inCall", { name: chat.conversations.find(({ id }) => id === call.conversationId)?.name ?? "" })}
        ringing={false}
        connecting={groupCall.connecting}
        latency={groupCall.latency}
        onopen={() => openGroup(call.conversationId)}
        onhangup={() => groupCall.leave()}
      />
    {/if}
    <SidebarProfile />
  </div>
</nav>

{#if creating}
  <GroupDialog onclose={() => (creating = false)} />
{/if}

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

  .sidebar__footer {
    padding: 0 16px 16px;
    display: flex;
    flex-direction: column;
    gap: 8px;
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

  .sidebar__tabs {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .sidebar__tablist {
    flex-grow: 1;
    display: flex;
    gap: 16px;
  }

  .sidebar__tab {
    position: relative;
    padding: 4px 0;
    border: 0;
    border-bottom: 2px solid transparent;
    background: transparent;
    color: var(--subtle-color);
    font-size: var(--small-font-size);
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    transition: color ease 0.1s;
  }

  .sidebar__tab:hover {
    color: var(--muted-color);
  }

  .sidebar__tab--active {
    color: var(--muted-color);
    border-bottom-color: var(--brand-color);
  }

  .sidebar__tab-dot {
    position: absolute;
    top: 3px;
    right: -8px;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--brand-color);
  }

  .sidebar__create {
    width: 24px;
    height: 24px;
    padding: 5px;
    flex: none;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: 4px;
    background: transparent;
    color: var(--subtle-color);
    transition: all ease 0.1s;
  }

  .sidebar__create:hover {
    background: var(--active-color);
    color: var(--muted-color);
  }

  .sidebar__list {
    margin: 4px 0 0;
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
