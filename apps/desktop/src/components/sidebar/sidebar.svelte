<script lang="ts">
  import { t } from "@/i18n";
  import { calls } from "@/stores/call.svelte";
  import { chat } from "@/stores/chat.svelte";
  import { groupCall } from "@/stores/group-call.svelte";
  import GroupDialog from "@/pages/group/group-dialog.svelte";
  import SidebarCall from "./sidebar-call.svelte";
  import SidebarConversation from "./sidebar-conversation.svelte";
  import SidebarProfile from "./sidebar-profile.svelte";

  let creating = $state(false);
  let query = $state("");

  const needle = $derived(query.trim().toLocaleLowerCase());
  const directs = $derived(
    needle ? chat.directs.filter(({ peer }) => peer?.username.toLocaleLowerCase().includes(needle)) : chat.directs,
  );

  function onsearchkeydown(event: KeyboardEvent) {
    if (event.key === "Escape" && query) {
      event.stopPropagation();
      query = "";
    }
  }

  function openGroup(conversationId: string) {
    chat.sidebarTab = "group";
    chat.select(conversationId).catch(() => undefined);
  }
</script>

<nav class="sidebar" aria-label={t("sidebar.navigation")}>
  <div class="sidebar__top">
    <input
      class="sidebar__search"
      type="text"
      autocomplete="off"
      spellcheck="false"
      placeholder={t("sidebar.search")}
      aria-label={t("sidebar.search")}
      bind:value={query}
      onkeydown={onsearchkeydown}
    />
  </div>

  <div class="sidebar__nav">
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
        <span class="sidebar__badge" aria-label={t("sidebar.pendingRequests", { count: chat.incoming })}
          >{chat.incoming}</span
        >
      {/if}
    </button>
  </div>

  <section class="sidebar__section">
    <div class="sidebar__heading">
      <h2 class="sidebar__title">{t("sidebar.directMessages")}</h2>
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
    </div>

    <ul class="sidebar__list">
      {#each directs as conversation (conversation.id)}
        <li>
          <SidebarConversation {conversation} active={conversation.id === chat.activeId} />
        </li>
      {:else}
        <li class="sidebar__empty">{needle ? t("sidebar.noResults") : t("sidebar.noConversations")}</li>
      {/each}
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
    width: 240px;
    flex: none;
    display: flex;
    flex-direction: column;
    --avatar-ring: var(--sidebar-color);
    background: var(--sidebar-color);
    color: var(--muted-color);
  }

  .sidebar__top {
    height: 48px;
    padding: 0 10px;
    flex: none;
    display: flex;
    align-items: center;
    border-bottom: 1px solid rgba(0, 0, 0, 0.2);
  }

  .sidebar__search {
    width: 100%;
    height: 28px;
    padding: 0 8px;
    border: 0;
    border-radius: 4px;
    background: var(--rail-color);
    font-size: var(--small-font-size);
    text-overflow: ellipsis;
    text-align: center;
  }

  .sidebar__search:focus-visible {
    outline: 1px solid var(--brand-color);
    outline-offset: 0;
    text-align: left;
  }

  .sidebar__nav {
    padding: 8px 8px 0;
  }

  .sidebar__friends {
    width: 100%;
    height: 42px;
    padding: 0 12px;
    display: flex;
    align-items: center;
    gap: 12px;
    border: 0;
    border-radius: 4px;
    background: transparent;
    color: var(--subtle-color);
    font-weight: 500;
    font-size: 15px;
    text-align: left;
    transition: all ease 0.1s;
  }

  .sidebar__friends:hover {
    background: #35373c;
    color: var(--body-color);
  }

  .sidebar__friends--active,
  .sidebar__friends--active:hover {
    background: var(--active-color);
    color: #ffffff;
  }

  .sidebar__friends-icon {
    width: 22px;
    flex: none;
  }

  .sidebar__badge {
    min-width: 18px;
    height: 18px;
    margin-left: auto;
    padding: 0 5px 1px;
    display: grid;
    place-items: center;
    border-radius: 9px;
    background: var(--error-color);
    color: #ffffff;
    font-size: var(--tiny-font-size);
    font-weight: 700;
  }

  .sidebar__section {
    min-height: 0;
    padding: 0 8px;
    flex-grow: 1;
    display: flex;
    flex-direction: column;
  }

  .sidebar__heading {
    padding: 18px 8px 4px 10px;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .sidebar__title {
    margin: 0;
    font-family: var(--font-body);
    font-size: var(--small-font-size);
    font-weight: 500;
    color: var(--subtle-color);
  }

  .sidebar__create {
    width: 20px;
    height: 20px;
    padding: 2px;
    display: grid;
    place-items: center;
    border: 0;
    background: transparent;
    color: var(--subtle-color);
    transition: color ease 0.1s;
  }

  .sidebar__create:hover {
    color: var(--muted-color);
  }

  .sidebar__list {
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
    overflow-y: auto;
    list-style: none;
  }

  .sidebar__empty {
    padding: 8px 10px;
    font-size: var(--small-font-size);
    color: var(--subtle-color);
  }

  .sidebar__footer {
    padding: 0;
    display: flex;
    flex-direction: column;
    background: #232428;
  }
</style>
