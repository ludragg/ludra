<script lang="ts">
  import { Logo } from "@/components";
  import { t, type Key } from "@/i18n";
  import { FriendState, Presence, type Friend } from "@/protocol/ludra/v1/models_pb";
  import { chat } from "@/stores/chat.svelte";
  import FriendAction from "./friend-action.svelte";
  import FriendRow from "./friend-row.svelte";
  import FriendsAdd from "./friends-add.svelte";

  type Tab = "online" | "all" | "pending" | "blocked" | "add";

  const tabs: { id: Exclude<Tab, "add">; label: Key }[] = [
    { id: "online", label: "friends.online" },
    { id: "all", label: "friends.all" },
    { id: "pending", label: "friends.pending" },
    { id: "blocked", label: "friends.blocked" },
  ];

  let tab = $state<Tab>("online");
  let query = $state("");

  const accepted = $derived(chat.friends.filter(({ state }) => state === FriendState.ACCEPTED));
  const online = $derived(
    accepted.filter(({ user }) => user?.presence === Presence.ONLINE || user?.presence === Presence.BUSY),
  );
  const incoming = $derived(chat.friends.filter(({ state }) => state === FriendState.INCOMING));
  const outgoing = $derived(chat.friends.filter(({ state }) => state === FriendState.OUTGOING));

  const search = $derived(query.trim().toLowerCase());
  const filteredOnline = $derived(
    search ? online.filter(({ user }) => user?.username.toLowerCase().includes(search)) : online,
  );
  const filteredAccepted = $derived(
    search ? accepted.filter(({ user }) => user?.username.toLowerCase().includes(search)) : accepted,
  );
  const filteredIncoming = $derived(
    search ? incoming.filter(({ user }) => user?.username.toLowerCase().includes(search)) : incoming,
  );
  const filteredOutgoing = $derived(
    search ? outgoing.filter(({ user }) => user?.username.toLowerCase().includes(search)) : outgoing,
  );
  const filteredBlocked = $derived(
    search ? chat.blocked.filter((user) => user.username.toLowerCase().includes(search)) : chat.blocked,
  );

  let arming = $state<string | null>(null);
  let disarm: number | undefined;

  function block(userId: string) {
    window.clearTimeout(disarm);
    if (arming !== userId) {
      arming = userId;
      disarm = window.setTimeout(() => (arming = null), 3000);
      return;
    }
    arming = null;
    run(chat.block(userId));
  }

  function run(action: Promise<unknown>) {
    action.catch(() => undefined);
  }
</script>

{#snippet emptyState(message: string)}
  <div class="friends__empty">
    <div class="friends__empty-brand">
      <Logo size="large" />
    </div>
    <p class="friends__empty-text">{message}</p>
  </div>
{/snippet}

{#snippet friendList(title: string, list: Friend[], empty: string)}
  <div class="friends__group">
    <span class="friends__label">{title} — {list.length}</span>
    {#if list.length > 0}
      <ul class="friends__list">
        {#each list as friend (friend.user!.id)}
          <FriendRow {friend}>
            <FriendAction
              icon="message"
              label={t("friends.messageTo", { name: friend.user!.username })}
              onclick={() => run(chat.start(friend.user!.username))}
            />
            <FriendAction
              icon="remove"
              label={t("friends.remove", { name: friend.user!.username })}
              onclick={() => run(chat.removeFriend(friend.user!.id))}
            />
            <FriendAction
              icon="block"
              armed={arming === friend.user!.id}
              label={arming === friend.user!.id
                ? t("friends.confirmBlock", { name: friend.user!.username })
                : t("friends.block", { name: friend.user!.username })}
              onclick={() => block(friend.user!.id)}
            />
          </FriendRow>
        {/each}
      </ul>
    {/if}
  </div>
  {#if list.length === 0}
    {@render emptyState(search ? t("friends.searchEmpty") : empty)}
  {/if}
{/snippet}

<header class="friends__header">
  <div class="friends__title">
    <svg
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
    <h1 class="friends__heading">{t("friends.title")}</h1>
  </div>
  <span class="friends__divider" aria-hidden="true"></span>
  <div class="friends__tabs" role="tablist" aria-label={t("friends.filter")}>
    {#each tabs as item (item.id)}
      <button
        class="friends__tab"
        class:friends__tab--active={tab === item.id}
        role="tab"
        aria-selected={tab === item.id}
        onclick={() => (tab = item.id)}
      >
        {t(item.label)}
        {#if item.id === "pending" && incoming.length > 0}
          <span class="friends__badge">{incoming.length}</span>
        {/if}
      </button>
    {/each}
    <button
      class="friends__tab friends__tab--add"
      class:friends__tab--add-active={tab === "add"}
      role="tab"
      aria-selected={tab === "add"}
      onclick={() => (tab = "add")}
    >
      {t("friends.add")}
    </button>
  </div>
</header>

<section class="friends__content" aria-label={t("friends.title")}>
  {#if tab !== "add"}
    <div class="friends__search">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.3-4.3" />
      </svg>
      <input
        class="friends__search-input"
        type="text"
        placeholder={t("friends.search")}
        aria-label={t("friends.search")}
        bind:value={query}
      />
      {#if query}
        <button
          class="friends__search-clear"
          type="button"
          aria-label={t("friends.search")}
          onclick={() => (query = "")}
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
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      {/if}
    </div>
  {/if}

  {#if tab === "online"}
    {@render friendList(t("friends.online"), filteredOnline, t("friends.noneOnline"))}
  {:else if tab === "all"}
    {@render friendList(t("friends.allFriends"), filteredAccepted, t("friends.none"))}
  {:else if tab === "pending"}
    {#if filteredIncoming.length === 0 && filteredOutgoing.length === 0}
      <div class="friends__group">
        <span class="friends__label">{t("friends.pending")} — 0</span>
      </div>
      {@render emptyState(search ? t("friends.searchEmpty") : t("friends.noPending"))}
    {/if}
    {#if filteredIncoming.length > 0}
      <div class="friends__group">
        <span class="friends__label">{t("friends.received")} — {filteredIncoming.length}</span>
        <ul class="friends__list">
          {#each filteredIncoming as friend (friend.user!.id)}
            <FriendRow {friend}>
              <FriendAction
                icon="accept"
                label={t("friends.accept", { name: friend.user!.username })}
                onclick={() => run(chat.acceptFriend(friend.user!.id))}
              />
              <FriendAction
                icon="decline"
                label={t("friends.decline", { name: friend.user!.username })}
                onclick={() => run(chat.removeFriend(friend.user!.id))}
              />
              <FriendAction
                icon="block"
                armed={arming === friend.user!.id}
                label={arming === friend.user!.id
                  ? t("friends.confirmBlock", { name: friend.user!.username })
                  : t("friends.block", { name: friend.user!.username })}
                onclick={() => block(friend.user!.id)}
              />
            </FriendRow>
          {/each}
        </ul>
      </div>
    {/if}
    {#if filteredOutgoing.length > 0}
      <div class="friends__group">
        <span class="friends__label">{t("friends.sent")} — {filteredOutgoing.length}</span>
        <ul class="friends__list">
          {#each filteredOutgoing as friend (friend.user!.id)}
            <FriendRow {friend}>
              <FriendAction
                icon="decline"
                label={t("friends.cancel", { name: friend.user!.username })}
                onclick={() => run(chat.removeFriend(friend.user!.id))}
              />
            </FriendRow>
          {/each}
        </ul>
      </div>
    {/if}
  {:else if tab === "blocked"}
    <div class="friends__group">
      <span class="friends__label">{t("friends.blocked")} — {filteredBlocked.length}</span>
      {#if filteredBlocked.length > 0}
        <ul class="friends__list">
          {#each filteredBlocked as user (user.id)}
            <FriendRow friend={{ user, state: FriendState.UNSPECIFIED } as Friend}>
              <FriendAction
                icon="unblock"
                label={t("friends.unblockUser", { name: user.username })}
                onclick={() => run(chat.unblock(user.id))}
              />
            </FriendRow>
          {/each}
        </ul>
      {/if}
    </div>
    {#if filteredBlocked.length === 0}
      {@render emptyState(search ? t("friends.searchEmpty") : t("friends.noBlocked"))}
    {/if}
  {:else}
    <FriendsAdd />
    {@render emptyState(t("friends.addEmpty"))}
  {/if}
</section>

<style>
  .friends__header {
    min-height: 57px;
    padding: 12px var(--page-gutter);
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 16px;
    border-bottom: 1px solid var(--border-color);
  }

  .friends__title {
    display: flex;
    align-items: center;
    gap: 10px;
    color: var(--muted-color);
  }

  .friends__title svg {
    width: 20px;
  }

  .friends__heading {
    margin: 0;
    font-family: var(--font-display);
    font-size: 16px;
    font-weight: 600;
  }

  .friends__divider {
    width: 1px;
    height: 20px;
    background: var(--border-color);
  }

  .friends__tabs {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 4px;
  }

  .friends__tab {
    height: 32px;
    padding: 0 12px;
    display: flex;
    align-items: center;
    gap: 8px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--subtle-color);
    font-size: var(--hint-font-size);
    font-weight: 600;
    transition: all ease 0.1s;
  }

  .friends__tab:hover {
    background: var(--surface-color);
    color: var(--muted-color);
  }

  .friends__tab--active,
  .friends__tab--active:hover {
    background: var(--active-color);
    color: var(--muted-color);
  }

  .friends__tab--add,
  .friends__tab--add:hover {
    background: var(--brand-color);
    color: var(--dark-background-color);
  }

  .friends__tab--add-active,
  .friends__tab--add-active:hover {
    background: transparent;
    color: var(--brand-color);
  }

  .friends__badge {
    min-width: 18px;
    height: 18px;
    padding: 0 5px 1px;
    display: grid;
    place-items: center;
    border-radius: 6px;
    background: var(--brand-color);
    color: var(--dark-background-color);
    font-size: var(--tiny-font-size);
    font-weight: 700;
  }

  .friends__content {
    min-height: 0;
    padding: 20px var(--page-gutter);
    flex-grow: 1;
    display: flex;
    flex-direction: column;
    gap: 20px;
    overflow-y: auto;
  }

  .friends__search {
    height: 40px;
    padding: 0 14px;
    flex: none;
    display: flex;
    align-items: center;
    gap: 10px;
    border-radius: 8px;
    background: var(--dark-background-color);
    border: 1px solid var(--border-color);
    transition: border-color ease 0.15s;
  }

  .friends__search:focus-within {
    border-color: var(--brand-color);
  }

  .friends__search > svg {
    width: 16px;
    height: 16px;
    flex: none;
    color: var(--subtle-color);
    pointer-events: none;
  }

  .friends__search-input {
    min-width: 0;
    height: 100%;
    flex-grow: 1;
    border: 0;
    outline: 0;
    background: transparent;
    color: var(--body-color);
  }

  .friends__search-clear {
    width: 24px;
    height: 24px;
    padding: 4px;
    flex: none;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: 4px;
    background: transparent;
    color: var(--subtle-color);
    transition: color ease 0.15s;
  }

  .friends__search-clear:hover {
    color: var(--muted-color);
  }

  .friends__search-clear svg {
    width: 16px;
    height: 16px;
  }

  .friends__group {
    display: flex;
    flex-direction: column;
  }

  .friends__label {
    padding: 0 8px 8px;
    font-size: var(--small-font-size);
    font-weight: 600;
    color: var(--subtle-color);
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .friends__list {
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
    list-style: none;
  }

  .friends__empty {
    flex-grow: 1;
    padding: 48px 16px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
    text-align: center;
  }

  .friends__empty-brand {
    width: 96px;
    height: 96px;
    display: grid;
    place-items: center;
    border-radius: 16px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid var(--border-color);
  }

  .friends__empty-brand :global(.logo) {
    opacity: 0.35;
  }

  .friends__empty-text {
    max-width: 320px;
    margin: 0;
    color: var(--subtle-color);
    font-size: var(--body-font-size);
  }
</style>
