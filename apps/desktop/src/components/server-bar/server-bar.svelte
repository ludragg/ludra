<script lang="ts">
  import { GroupAvatar } from "@/components";
  import { t } from "@/i18n";
  import GroupDialog from "@/pages/group/group-dialog.svelte";
  import { chat } from "@/stores/chat.svelte";

  let creating = $state(false);

  const home = $derived(chat.activeId === null && chat.view === "friends");
  const unread = $derived(Object.values(chat.unread).reduce((total, count) => total + count, 0));
  const alert = $derived(
    [
      unread > 0 ? t("sidebar.unread", { count: unread }) : "",
      chat.incoming > 0 ? t("sidebar.pendingRequests", { count: chat.incoming }) : "",
    ]
      .filter(Boolean)
      .join(" · "),
  );

  function open(id: string) {
    chat.sidebarTab = "group";
    chat.select(id).catch(() => undefined);
  }
</script>

<nav class="rail" aria-label={t("rail.label")}>
  <div class="rail__item">
    <span class="rail__pill" class:rail__pill--active={home}></span>
    <button
      class="rail__button rail__button--home"
      class:rail__button--active={home}
      aria-label={t("rail.home")}
      aria-current={home ? "page" : undefined}
      data-tooltip={alert ? `${t("rail.home")} · ${alert}` : t("rail.home")}
      onclick={() => chat.showFriends()}
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
        <path d="M22 12h-6l-2 3h-4l-2-3H2" />
        <path
          d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"
        />
      </svg>
    </button>
    {#if alert}
      <span class="rail__dot" class:rail__dot--active={home} role="img" aria-label={alert}></span>
    {/if}
  </div>

  <span class="rail__divider" aria-hidden="true"></span>

  {#each chat.groups as group (group.id)}
    {@const active = group.id === chat.activeId}
    {@const groupUnread = chat.unread[group.id] ?? 0}
    <div class="rail__item">
      <span class="rail__pill" class:rail__pill--active={active} class:rail__pill--unread={groupUnread > 0 && !active}
      ></span>
      <button
        class="rail__button rail__button--group"
        class:rail__button--group-active={active}
        class:rail__button--live={!!group.call}
        aria-label={group.name}
        aria-current={active ? "page" : undefined}
        data-tooltip={group.name}
        onclick={() => open(group.id)}
      >
        {#if group.avatar}
          <GroupAvatar id={group.id} avatar={group.avatar} size="fill" />
        {:else}
          <span class="rail__initials">{group.name.slice(0, 2).toUpperCase()}</span>
        {/if}
      </button>
      {#if groupUnread > 0}
        <span class="rail__badge" aria-label={t("sidebar.unread", { count: groupUnread })}>{groupUnread}</span>
      {/if}
    </div>
  {/each}

  <div class="rail__item">
    <button
      class="rail__button rail__button--add"
      aria-label={t("group.create")}
      data-tooltip={t("group.create")}
      onclick={() => (creating = true)}
    >
      <span class="rail__add-circle">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.6"
          stroke-linecap="round"
          aria-hidden="true"
        >
          <path d="M12 6v12M6 12h12" />
        </svg>
      </span>
    </button>
  </div>
</nav>

{#if creating}
  <GroupDialog onclose={() => (creating = false)} />
{/if}

<style>
  .rail {
    width: 68px;
    flex: none;
    padding: 12px 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    overflow-y: auto;
    scrollbar-width: none;
    background: var(--dark-background-color);
    border-right: 1px solid var(--border-color);
  }

  .rail::-webkit-scrollbar {
    display: none;
  }

  .rail__item {
    position: relative;
    width: 100%;
    flex: none;
    display: flex;
    justify-content: center;
  }

  .rail__divider {
    width: 32px;
    height: 1px;
    flex: none;
    background: var(--border-color);
  }

  .rail__button {
    width: 48px;
    height: 48px;
    padding: 0;
    display: grid;
    place-items: center;
    overflow: hidden;
    border: 0;
    border-radius: 14px;
    background: rgba(255, 255, 255, 0.06);
    color: var(--muted-color);
    transition:
      border-radius ease 0.15s,
      background ease 0.15s,
      color ease 0.15s;
  }

  .rail__button:hover {
    background: var(--active-color);
    color: var(--muted-color);
  }

  .rail__button--home svg {
    width: 20px;
  }

  .rail__button--active,
  .rail__button--active:hover {
    background: rgba(199, 125, 255, 0.18);
    color: var(--brand-color);
  }

  .rail__button--group {
    background: rgba(199, 125, 255, 0.12);
    border-radius: 14px;
  }

  .rail__button--group:hover,
  .rail__button--group-active {
    background: rgba(199, 125, 255, 0.24);
    border-radius: 14px;
  }

  .rail__initials {
    font-family: var(--font-display);
    font-size: 15px;
    font-weight: 700;
    letter-spacing: 0.02em;
    color: var(--muted-color);
  }

  .rail__button--live {
    box-shadow:
      0 0 0 2px var(--dark-background-color),
      0 0 0 4px var(--success-color);
  }

  .rail__button--add {
    background: rgba(199, 125, 255, 0.12);
    border-radius: 14px;
  }

  .rail__button--add:hover {
    background: rgba(199, 125, 255, 0.22);
  }

  .rail__add-circle {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: var(--muted-color);
    color: var(--dark-background-color);
    display: grid;
    place-items: center;
    transition:
      transform ease 0.15s,
      background ease 0.15s;
  }

  .rail__button--add:hover .rail__add-circle {
    background: var(--brand-color);
    transform: scale(1.06);
  }

  .rail__add-circle svg {
    width: 14px;
  }

  .rail__pill {
    position: absolute;
    top: 50%;
    left: 0;
    width: 4px;
    height: 0;
    border-radius: 0 4px 4px 0;
    background: var(--brand-color);
    transform: translateY(-50%);
    transition: height ease 0.15s;
  }

  .rail__item:hover .rail__pill {
    height: 20px;
  }

  .rail__pill--unread {
    height: 8px;
  }

  .rail__item .rail__pill--active,
  .rail__item:hover .rail__pill--active {
    height: 32px;
  }

  .rail__dot {
    position: absolute;
    top: 8px;
    right: 14px;
    pointer-events: none;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--brand-color);
  }

  .rail__dot--active {
    box-shadow: 0 0 0 2px #18111c;
  }

  .rail__badge {
    position: absolute;
    right: 8px;
    bottom: -3px;
    min-width: 18px;
    height: 18px;
    padding: 0 5px 1px;
    display: grid;
    place-items: center;
    border-radius: 9px;
    background: var(--brand-color);
    box-shadow: 0 0 0 3px var(--dark-background-color);
    color: var(--dark-background-color);
    font-size: var(--tiny-font-size);
    font-weight: 700;
  }
</style>
