<script lang="ts">
  import ActivityInline from "@/components/activity/activity-inline.svelte";
  import Avatar from "@/components/avatar/avatar.svelte";
  import StatusDot from "@/components/profile/status-dot.svelte";
  import Status from "@/components/status/status.svelte";
  import { t } from "@/i18n";
  import { chat } from "@/stores/chat.svelte";
  import { usePresence } from "@/stores/presence.svelte";
  import SidebarStatusMenu from "./sidebar-status-menu.svelte";

  let menuOpen = $state(false);
  let profile = $state<HTMLElement>();

  const myPresence = usePresence(() => chat.user?.id ?? null);

  function onpointerdown(event: PointerEvent) {
    if (menuOpen && !profile?.contains(event.target as Node)) {
      menuOpen = false;
    }
  }

  function onkeydown(event: KeyboardEvent) {
    if (menuOpen && event.key === "Escape") {
      menuOpen = false;
    }
  }
</script>

<svelte:window {onpointerdown} {onkeydown} />

{#if chat.user}
  <div class="sidebar-profile" bind:this={profile}>
    {#if menuOpen}
      <SidebarStatusMenu onclose={() => (menuOpen = false)} />
    {/if}
    <button
      class="sidebar-profile__identity"
      aria-haspopup="menu"
      aria-expanded={menuOpen}
      aria-label={t("sidebar.changeStatus")}
      onclick={() => (menuOpen = !menuOpen)}
    >
      <span class="sidebar-profile__avatar-wrap">
        <Avatar user={chat.user} />
        <span class="sidebar-profile__dot">
          <StatusDot status={myPresence.status} size="small" ringColor="#15151d" />
        </span>
      </span>
      <span class="sidebar-profile__info">
        <span class="sidebar-profile__name">{chat.user.username}</span>
        {#if myPresence.activity}
          <ActivityInline activity={myPresence.activity} />
        {:else}
          <Status status={myPresence.status} />
        {/if}
      </span>
    </button>
    <button
      class="sidebar-profile__action"
      class:sidebar-profile__action--active={chat.activeId === null && chat.view === "settings"}
      aria-label={t("sidebar.settings")}
      data-tooltip={t("sidebar.settings")}
      onclick={() => chat.showSettings()}
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
        <circle cx="12" cy="12" r="3" />
        <path
          d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
        />
      </svg>
    </button>
    <button
      class="sidebar-profile__action"
      aria-label={t("sidebar.logout")}
      data-tooltip={t("sidebar.logout")}
      onclick={() => chat.logout()}
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
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
        <path d="M16 17l5-5-5-5" />
        <path d="M21 12H9" />
      </svg>
    </button>
  </div>
{/if}

<style>
  .sidebar-profile {
    position: relative;
    padding: 8px;
    display: flex;
    align-items: center;
    gap: 4px;
    border-radius: 4px;
    background: var(--surface-color);
  }

  .sidebar-profile__identity {
    min-width: 0;
    margin: -4px;
    padding: 4px;
    flex-grow: 1;
    display: flex;
    align-items: center;
    gap: 8px;
    border: 0;
    border-radius: 4px;
    background: transparent;
    text-align: left;
    transition: background ease 0.1s;
  }

  .sidebar-profile__identity:hover {
    background: var(--surface-color);
  }

  .sidebar-profile__avatar-wrap {
    position: relative;
    display: inline-flex;
    flex: none;
  }

  .sidebar-profile__dot {
    position: absolute;
    right: -2px;
    bottom: -2px;
    display: flex;
  }

  .sidebar-profile__info {
    min-width: 0;
    flex-grow: 1;
    display: flex;
    flex-direction: column;
    line-height: 1.3;
  }

  .sidebar-profile__name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 600;
    color: var(--muted-color);
  }

  .sidebar-profile__action {
    width: 32px;
    height: 32px;
    flex: none;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--subtle-color);
    transition: all ease 0.1s;
  }

  .sidebar-profile__action:hover,
  .sidebar-profile__action--active {
    background: var(--active-color);
    color: var(--muted-color);
  }

  .sidebar-profile__action svg {
    width: 16px;
  }
</style>
