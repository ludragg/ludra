<script lang="ts">
  import { Logo } from "@/components";
  import { t, type Key } from "@/i18n";
  import UserMenu from "@/components/user-menu/user-menu.svelte";
  import { FriendState, Presence, type Friend, type User } from "@/protocol/ludra/v1/models_pb";
  import { chat } from "@/stores/chat.svelte";
  import ActiveNow from "./active-now.svelte";
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
  let menu = $state<{ user: User; x: number; y: number } | null>(null);

  const needle = $derived(query.trim().toLocaleLowerCase());
  const matches = (user: User | undefined) => !needle || !!user?.username.toLocaleLowerCase().includes(needle);

  const accepted = $derived(chat.friends.filter(({ state, user }) => state === FriendState.ACCEPTED && matches(user)));
  const online = $derived(
    accepted.filter(({ user }) => user?.presence === Presence.ONLINE || user?.presence === Presence.BUSY),
  );
  const incoming = $derived(chat.friends.filter(({ state, user }) => state === FriendState.INCOMING && matches(user)));
  const outgoing = $derived(chat.friends.filter(({ state, user }) => state === FriendState.OUTGOING && matches(user)));
  const blocked = $derived(chat.blocked.filter((user) => matches(user)));

  /** Com uma busca ativa, "sem resultados" substitui a mensagem de lista vazia. */
  const emptyOr = (text: string) => (needle ? t("friends.noResults") : text);

  function select(next: Tab) {
    tab = next;
    query = "";
  }

  function openMenu(user: User, event: MouseEvent) {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    menu = { user, x: rect.left, y: rect.bottom + 4 };
  }

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

{#snippet friendList(title: string, list: Friend[], empty: string)}
  {#if list.length > 0}
    <div class="friends__group">
      <span class="friends__label">{title} — {list.length}</span>
      <ul class="friends__list">
        {#each list as friend (friend.user!.id)}
          <FriendRow {friend}>
            <FriendAction
              icon="message"
              label={t("friends.messageTo", { name: friend.user!.username })}
              onclick={() => run(chat.start(friend.user!.username))}
            />
            <FriendAction
              icon="more"
              label={t("friends.more", { name: friend.user!.username })}
              onclick={(event) => openMenu(friend.user!, event)}
            />
          </FriendRow>
        {/each}
      </ul>
    </div>
  {:else}
    <div class="friends__empty-state">
      <div class="friends__empty-logo">
        <Logo size="large" />
      </div>
      <p class="friends__empty">{empty}</p>
    </div>
  {/if}
{/snippet}

<div class="friends">
  <div class="friends__main">
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
            onclick={() => select(item.id)}
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
          onclick={() => select("add")}
        >
          {t("friends.add")}
        </button>
      </div>
    </header>

    <section class="friends__content" aria-label={t("friends.title")}>
      {#if tab !== "add"}
        <label class="friends__search">
          <svg
            class="friends__search-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.3-4.3" />
          </svg>
          <input
            class="friends__search-input"
            type="text"
            autocomplete="off"
            spellcheck="false"
            placeholder={t("friends.search")}
            aria-label={t("friends.searchLabel")}
            bind:value={query}
          />
        </label>
      {/if}

      {#if tab === "online"}
        {@render friendList(t("friends.online"), online, emptyOr(t("friends.noneOnline")))}
      {:else if tab === "all"}
        {@render friendList(t("friends.allFriends"), accepted, emptyOr(t("friends.none")))}
      {:else if tab === "pending"}
        {#if incoming.length === 0 && outgoing.length === 0}
          <div class="friends__empty-state">
            <div class="friends__empty-logo">
              <Logo size="large" />
            </div>
            <p class="friends__empty">{emptyOr(t("friends.noPending"))}</p>
          </div>
        {/if}
        {#if incoming.length > 0}
          <div class="friends__group">
            <span class="friends__label">{t("friends.received")} — {incoming.length}</span>
            <ul class="friends__list">
              {#each incoming as friend (friend.user!.id)}
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
        {#if outgoing.length > 0}
          <div class="friends__group">
            <span class="friends__label">{t("friends.sent")} — {outgoing.length}</span>
            <ul class="friends__list">
              {#each outgoing as friend (friend.user!.id)}
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
        {#if blocked.length > 0}
          <div class="friends__group">
            <span class="friends__label">{t("friends.blocked")} — {blocked.length}</span>
            <ul class="friends__list">
              {#each blocked as user (user.id)}
                <FriendRow friend={{ user, state: FriendState.UNSPECIFIED } as Friend}>
                  <FriendAction
                    icon="unblock"
                    label={t("friends.unblockUser", { name: user.username })}
                    onclick={() => run(chat.unblock(user.id))}
                  />
                </FriendRow>
              {/each}
            </ul>
          </div>
        {:else}
          <div class="friends__empty-state">
            <div class="friends__empty-logo">
              <Logo size="large" />
            </div>
            <p class="friends__empty">{emptyOr(t("friends.noBlocked"))}</p>
          </div>
        {/if}
      {:else}
        <FriendsAdd />
      {/if}
    </section>
  </div>

  <ActiveNow />
</div>

{#if menu}
  <UserMenu user={menu.user} x={menu.x} y={menu.y} onclose={() => (menu = null)} />
{/if}

<style>
  .friends {
    min-height: 0;
    flex-grow: 1;
    display: flex;
  }

  .friends__main {
    min-width: 0;
    flex-grow: 1;
    display: flex;
    flex-direction: column;
  }

  .friends__header {
    height: 48px;
    padding: 0 16px;
    display: flex;
    align-items: center;
    gap: 12px;
    border-bottom: 1px solid rgba(0, 0, 0, 0.2);
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
    flex-wrap: nowrap;
    gap: 2px;
  }

  .friends__tab {
    height: 24px;
    padding: 0 7px;
    display: flex;
    align-items: center;
    gap: 8px;
    border: 0;
    border-radius: 4px;
    background: transparent;
    color: var(--subtle-color);
    font-size: var(--body-font-size);
    font-weight: 500;
    white-space: nowrap;
    transition: all ease 0.1s;
  }

  .friends__tab:hover {
    background: #35373c;
    color: var(--muted-color);
  }

  .friends__tab--active,
  .friends__tab--active:hover {
    background: var(--active-color);
    color: var(--muted-color);
  }

  .friends__tab--add,
  .friends__tab--add:hover {
    margin-left: 4px;
    border-radius: 8px;
    background: var(--brand-color);
    color: var(--on-brand-color);
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
    border-radius: 9px;
    background: var(--error-color);
    color: #ffffff;
    font-size: var(--tiny-font-size);
    font-weight: 700;
  }

  .friends__content {
    min-height: 0;
    padding: 16px 20px 16px 30px;
    flex-grow: 1;
    display: flex;
    flex-direction: column;
    gap: 20px;
    overflow-y: auto;
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
  }

  .friends__search {
    position: relative;
    flex: none;
    display: block;
  }

  .friends__search-icon {
    position: absolute;
    top: 50%;
    left: 12px;
    width: 16px;
    color: var(--subtle-color);
    transform: translateY(-50%);
    pointer-events: none;
  }

  .friends__search-input {
    width: 100%;
    height: 40px;
    padding: 0 12px 0 38px;
    border: 0;
    border-radius: 8px;
    background: var(--rail-color);
    transition: border-color ease 0.1s;
  }

  .friends__search-input:focus-visible {
    outline: none;
  }

  .friends__list {
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
    list-style: none;
  }

  .friends__empty-state {
    flex-grow: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
    padding-bottom: 48px;
    text-align: center;
  }

  .friends__empty-logo {
    width: 96px;
    height: 96px;
    border-radius: 16px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid var(--border-color);
    display: grid;
    place-items: center;
    opacity: 0.4;
  }

  .friends__empty {
    margin: 0;
    padding: 0 8px;
    color: var(--subtle-color);
  }
</style>
